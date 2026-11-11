/**
 * Backfill of old posts (internal links + title card), paced and reversible. Owner approval gates execution:
 * without MOTUS_BACKFILL_ENABLED=true every mode only writes what it would do.
 *   --plan --date D [--limit 3]   back up up to N posts and write their proposed bodies (no blog change)
 *   --execute --date D            apply the previous plan: identity and original hash re-checked, image URL must
 *                                 answer 200 (persisted to ops-data by the previous run), exact readback
 *   --revert <postId>             restore the backed-up original body exactly
 * Titles, labels and permalinks are never changed.
 */
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile,appendFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {GoogleBloggerApiAdapter,type BloggerPublishingConfig} from './services/blogger.js';
import {heroCardHtml,heroFileName,renderHeroPng,validHeroPng,type HeroCategory} from './publishers/hero-card.js';
import {RELATED_FEED_URL} from './publishers/related-posts.js';
import {BACKFILL_IMAGE_BASE,BACKFILL_ROOT,backfillContent,backfillOrder,eligibility,parseFeedWithIds,sha256,stripBackfill,type BackfillPlanItem} from './operations/backfill-links.js';

const args=process.argv.slice(2),value=(flag:string)=>{const i=args.indexOf(flag);return i>=0?args[i+1]:undefined};
const mode=args.includes('--plan')?'plan':args.includes('--execute')?'execute':args.includes('--revert')?'revert':'';
const date=value('--date')??new Date(Date.now()+9*3600e3).toISOString().slice(0,10),limit=Math.min(5,Math.max(1,Number(value('--limit')??3)||3));
if(!mode)throw new Error('--plan | --execute | --revert <postId> required');
const enabled=process.env.MOTUS_BACKFILL_ENABLED==='true',root=resolve(BACKFILL_ROOT),ledgerPath=join(root,'ledger.jsonl'),pendingPath=join(root,'pending.json');
await mkdir(join(root,'img'),{recursive:true});
const record=async(entry:Record<string,unknown>)=>{await appendFile(ledgerPath,JSON.stringify({at:new Date().toISOString(),...entry})+'\n','utf8');console.log(JSON.stringify(entry))};
const ledger=existsSync(ledgerPath)?(await readFile(ledgerPath,'utf8')).split('\n').filter(Boolean).map(line=>JSON.parse(line) as {postId:string;event:string}):[];
const raw=JSON.parse(await readFile(resolve('config/publishing.json'),'utf8')) as {blogger:BloggerPublishingConfig};
const config={...raw.blogger,blogId:(process.env.BLOGGER_BLOG_ID??'').trim(),credentialAvailable:true,publishAsDraft:true};
const google=new GoogleBloggerApiAdapter();
// An object, not an array: the ops-data merge unions arrays, which would keep applied items pending forever.
const readPending=async():Promise<BackfillPlanItem[]>=>existsSync(pendingPath)?((JSON.parse(await readFile(pendingPath,'utf8')) as {items?:BackfillPlanItem[]}).items??[]):[];
const writePending=(items:BackfillPlanItem[])=>writeFile(pendingPath,JSON.stringify({updatedAt:new Date().toISOString(),items},null,2),'utf8');
const category=(label:string):HeroCategory|null=>label==='국내증시'?'korea':label==='미국증시'?'us':label==='AI 인텔리전스'?'ai':null;

if(mode==='plan'){
  const response=await fetch(RELATED_FEED_URL,{headers:{accept:'application/json'},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('public feed '+response.status);
  const all=parseFeedWithIds(await response.json()),done=new Set(ledger.filter(item=>item.event==='BACKFILLED'||item.event==='SKIPPED'||item.event==='REVERTED').map(item=>item.postId));
  const pending=await readPending();
  for(const item of pending)done.add(item.postId);
  const plan:BackfillPlanItem[]=[...pending];let reads=0;
  for(const post of backfillOrder(all,done)){
    if(plan.length>=limit||reads>=15)break;reads++;
    const before=await google.readPost(post.postId,config);
    if(before.status!=='PUBLISHED'||before.url!==post.url){await record({event:'SKIPPED',postId:post.postId,url:post.url,reason:'status or permalink differs from the public feed'});continue}
    const state=eligibility(before.content);if(!state.eligible){await record({event:'SKIPPED',postId:post.postId,url:post.url,reason:state.reason});continue}
    let image:{file:string;alt:string}|null=null;const cat=category(post.label);
    if(state.needsImage&&cat){const input={category:cat,issueDate:post.published,storeDate:post.published,title:post.title,moves:[]};const bytes=await renderHeroPng(heroCardHtml(input));if(bytes&&validHeroPng(bytes)){const file=heroFileName(input);await writeFile(join(root,'img',file),bytes);image={file,alt:`${post.label} ${post.published}: ${post.title}`}}}
    const proposed=backfillContent(before.content,{post,all,image});
    await mkdir(join(root,post.postId),{recursive:true});
    await writeFile(join(root,post.postId,'original.json'),JSON.stringify({postId:post.postId,url:post.url,title:before.title,labels:before.labels,content:before.content,sha256:sha256(before.content),savedAt:new Date().toISOString()},null,2),'utf8');
    await writeFile(join(root,post.postId,'proposed.html'),proposed.content,'utf8');
    plan.push({postId:post.postId,url:post.url,title:before.title,labels:before.labels,originalSha256:sha256(before.content),proposedSha256:sha256(proposed.content),image:image?BACKFILL_IMAGE_BASE+image.file:null,relatedCount:proposed.related});
    await record({event:'PLANNED',postId:post.postId,url:post.url,image:Boolean(image),related:proposed.related});
  }
  await writePending(plan);
  console.log(`PLAN ${plan.length} post(s); remaining candidates ${backfillOrder(all,new Set([...done,...plan.map(item=>item.postId)])).length}`);
}

if(mode==='execute'){
  const plan=await readPending();const left:BackfillPlanItem[]=[];
  for(const item of plan){
    const proposed=await readFile(join(root,item.postId,'proposed.html'),'utf8');
    if(sha256(proposed)!==item.proposedSha256){await record({event:'HOLD',postId:item.postId,reason:'proposed body changed after planning'});left.push(item);continue}
    if(item.image){const head=await fetch(item.image,{method:'HEAD'}).catch(()=>null);if(head?.status!==200){await record({event:'HOLD',postId:item.postId,reason:'image not yet on ops-data'});left.push(item);continue}}
    if(!enabled){console.log('SIMULATED',item.postId,item.url);left.push(item);continue}
    const before=await google.readPost(item.postId,config);
    if(before.status!=='PUBLISHED'||before.url!==item.url||sha256(before.content)!==item.originalSha256){await record({event:'SKIPPED',postId:item.postId,reason:'post changed since the backup'});continue}
    try{
      const after=await google.patchPostContent(item.postId,{title:before.title,content:proposed,labels:before.labels},config);
      const norm=(html:string)=>html.replaceAll('&amp;','&').replace(/>\s+</g,'><').replace(/\s+/g,' ').trim();
      if(after.status!=='PUBLISHED'||after.url!==item.url||after.title!==before.title||norm(after.content)!==norm(proposed))throw new Error('readback differs (status, permalink, title or body)');
      await record({event:'BACKFILLED',postId:item.postId,url:item.url,image:Boolean(item.image),related:item.relatedCount});
    }catch(error){await record({event:'FAILED',postId:item.postId,url:item.url,reason:error instanceof Error?error.message:String(error)});left.push(item)}
  }
  await writePending(left);
}

if(mode==='revert'){
  const postId=value('--revert')??'';if(!/^\d+$/.test(postId))throw new Error('--revert <numeric postId>');
  const backup=JSON.parse(await readFile(join(root,postId,'original.json'),'utf8')) as {url:string;content:string;sha256:string};
  if(sha256(backup.content)!==backup.sha256)throw new Error('backup hash mismatch');
  if(!enabled){console.log('SIMULATED revert',postId,backup.url);process.exit(0)}
  const before=await google.readPost(postId,config);
  if(before.url!==backup.url)throw new Error('permalink differs from the backup');
  const after=await google.patchPostContent(postId,{title:before.title,content:backup.content,labels:before.labels},config);
  const norm=(html:string)=>html.replaceAll('&amp;','&').replace(/>\s+</g,'><').replace(/\s+/g,' ').trim();
  if(norm(after.content)!==norm(backup.content))throw new Error('readback after revert differs from the backup');
  await record({event:'REVERTED',postId,url:backup.url});
  if(stripBackfill(before.content)!==backup.content.trim())console.log('::warning::post had other edits besides the backfill; the backup was restored');
}

/**
 * Owner-requested correction of an already published daily article: the article is rebuilt from the same verified
 * pipeline and replaces the content of the SAME Blogger post (same post id and permalink), never a new post.
 * Every gate that guards a first publication applies; the target post is the one the persisted ledger recorded as
 * PUBLISHED for this operation date and category, and its identity is checked before and after the patch.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import type {SplitPublicationUnit} from './intelligence/split-daily-production.js';
import {evaluateAutoPublishGate} from './production/auto-publish.js';
import {candidateFromVerification,type ProductionVerificationArtifact} from './production/verification-artifact.js';
import {GoogleBloggerApiAdapter,isPublicBloggerPostUrl,type BloggerPublishingConfig} from './services/blogger.js';
import {appendPublishLedger,persistedPublicationDecision,publicationIdentity,readPublishLedger} from './production/publication-operation.js';

const args=process.argv.slice(2);const value=(flag:string)=>{const index=args.indexOf(flag);return index>=0?args[index+1]:undefined};
const date=value('--date')??'',name=value('--category')??'';
if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!['ai','us','korea'].includes(name))throw new Error('--date YYYY-MM-DD and --category ai|us|korea required');
const root=join(process.cwd(),'data','operations',date,name),execute=args.includes('--execute');
const done=async(result:Record<string,unknown>):Promise<never>=>{await writeFile(join(root,'republish.json'),JSON.stringify(result,null,2),'utf8');console.log(JSON.stringify(result));process.exit(0)};
const unitPath=join(root,'live-unit.json'),verificationPath=join(root,'verification.json'),auditPath=join(root,'live-source-audit.json');
if(!existsSync(unitPath)||!existsSync(verificationPath)||!existsSync(auditPath))await done({state:'HOLD',reason:'rebuilt unit, verification or source audit missing',patchCallCount:0});
const unit=JSON.parse(await readFile(unitPath,'utf8')) as SplitPublicationUnit&{readiness?:string};
if(!unit.render||unit.readiness!=='READY')await done({state:'HOLD',reason:'rebuilt unit is not READY',patchCallCount:0});
const verification=JSON.parse(await readFile(verificationPath,'utf8')) as ProductionVerificationArtifact;
if(verification.operationDate!==date)await done({state:'HOLD',reason:'verification operationDate mismatch',patchCallCount:0});
const sourceAudit=JSON.parse(await readFile(auditPath,'utf8')) as {entries?:unknown[]};
if('sha256:'+createHash('sha256').update(JSON.stringify(sourceAudit.entries??[])).digest('hex')!==verification.sourceAuditFingerprint)await done({state:'HOLD',reason:'source audit fingerprint mismatch',patchCallCount:0});
const now=new Date().toISOString(),candidate=candidateFromVerification(unit,verification,now),gate=evaluateAutoPublishGate({...candidate,duplicateUncertainty:false},now);
if(gate.state!=='AUTO_PUBLISH_READY')await done({state:'HOLD',reason:'gate: '+gate.reasons.join('; '),patchCallCount:0});
// The target is only ever the post this pipeline itself published for this operation date and category.
const ledger=await readPublishLedger(root),published=persistedPublicationDecision(ledger,date,unit.category);
if(published.state!=='SKIP'||!published.postId||!published.publicPostUrl)await done({state:'HOLD',reason:'no published post recorded for this operation date and category',patchCallCount:0});
const postId=String(published.postId),url=String(published.publicPostUrl),identity=publicationIdentity(date,unit.category);
if(!execute||process.env.MOTUS_LIVE_PUBLISH_ENABLED!=='true')await done({state:'SIMULATED',postId,publicPostUrl:url,title:unit.title,patchCallCount:0});
const raw=JSON.parse(await readFile(resolve('config/publishing.json'),'utf8')) as {blogger:BloggerPublishingConfig};
const config={...raw.blogger,blogId:process.env.BLOGGER_BLOG_ID!.trim(),credentialAvailable:true,publishAsDraft:true};
const google=new GoogleBloggerApiAdapter();
const before=await google.readPost(postId,config);
if(before.status!=='PUBLISHED'||before.url!==url||!isPublicBloggerPostUrl(before.url))await done({state:'HOLD',reason:'remote post identity or status does not match the ledger',postId,patchCallCount:0});
try{
  const after=await google.patchPostContent(postId,{title:unit.title,content:unit.render.html,labels:before.labels?.length?before.labels:[unit.label]},config);
  if(after.status!=='PUBLISHED'||after.url!==url||after.title!==unit.title)throw new Error('post readback after patch does not match (status, permalink or title)');
  await appendPublishLedger(root,{identity,operationDate:date,sessionDate:unit.observedDate,category:unit.category,at:now,event:'REPUBLISHED',postId,publicPostUrl:url,fingerprint:candidate.publicationFingerprint,detail:`owner-requested correction: content replaced in place (previous title: ${before.title})`});
  await done({state:'REPUBLISHED',postId,publicPostUrl:url,previousTitle:before.title,title:unit.title,patchCallCount:1});
}catch(error){
  await appendPublishLedger(root,{identity,operationDate:date,sessionDate:unit.observedDate,category:unit.category,at:now,event:'REPUBLISH_FAILED',postId,publicPostUrl:url,fingerprint:candidate.publicationFingerprint,detail:error instanceof Error?error.message:String(error)});
  await done({state:'FAILED',postId,publicPostUrl:url,reason:error instanceof Error?error.message:String(error),patchCallCount:1});
}

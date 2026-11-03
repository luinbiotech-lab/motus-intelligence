/**
 * Weekly review production: collect → build → gate → publish exactly once per reviewed week.
 *
 *   node dist/src/motus-weekly-cli.js --date YYYY-MM-DD [--execute] [--final-attempt]
 *
 * Without --execute (or without MOTUS_LIVE_PUBLISH_ENABLED=true) nothing is sent to Blogger. A week is published
 * at most once: the persisted ledger (data/weekly/<weekStart>/publish-ledger.jsonl), the public label feed and the
 * Blogger title lookup are all checked first, and an earlier draft of the same week is reused instead of a new post.
 * The first attempt of a week requires next week's economic calendar; --final-attempt accepts broker outlook alone.
 *
 * PDF report (owner-approved design, 2026-11-01): when the Drive credentials are present, the week's three-page PDF
 * is rendered, uploaded to Google Drive ("MOTUS Reports/<year>/Weekly") and linked from the article. A PDF failure
 * never blocks the article. --attach-pdf adds the PDF link to a week that is already published (once).
 */
import {appendFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {buildWeeklyArticle,collectWeeklyEvidence,weekWindow} from './operations/weekly-review.js';
import {renderWeeklyEditorialArticle,renderWeeklySection} from './publishers/editorial-article.js';
import {buildWeeklyPdfHtml} from './reports/weekly-pdf.js';
import {checkPdf,renderPdf} from './reports/pdf-render.js';
import {DRIVE_ROOT_FOLDER,GoogleDriveClient,driveCredentialsFromEnvironment} from './services/google-drive.js';
import type {WeeklyArticle,WeeklyEvidence,WeeklySection} from './operations/weekly-review.js';
import {GoogleBloggerApiAdapter,isPublicBloggerPostUrl,type BloggerPublishingConfig} from './services/blogger.js';

export const WEEKLY_LABEL='주간 증시';
const args=process.argv.slice(2),value=(flag:string)=>{const index=args.indexOf(flag);return index>=0?args[index+1]:undefined};
const kstToday=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
const runDate=value('--date')??kstToday;if(!/^\d{4}-\d{2}-\d{2}$/.test(runDate))throw new Error('--date YYYY-MM-DD required');
const execute=args.includes('--execute'),finalAttempt=args.includes('--final-attempt'),attachPdf=args.includes('--attach-pdf');
const window=weekWindow(runDate),root=join(process.cwd(),'data','weekly',window.weekStart),identity=`weekly|${window.weekStart}`;
await mkdir(root,{recursive:true});
const ledgerPath=join(root,'publish-ledger.jsonl');
type LedgerEntry={identity:string;at:string;event:'DRAFT_CREATED'|'DRAFT_ABANDONED'|'PUBLISHED'|'FAILED'|'SKIPPED_EXISTING'|'PDF_ATTACHED'|'PDF_FAILED';postId:string|null;publicPostUrl:string|null;title:string;detail:string};
const ledger=async():Promise<LedgerEntry[]>=>{try{return (await readFile(ledgerPath,'utf8')).split('\n').filter(Boolean).map(line=>JSON.parse(line) as LedgerEntry).filter(item=>item.identity===identity)}catch{return []}};
const record=async(entry:Omit<LedgerEntry,'identity'|'at'>)=>appendFile(ledgerPath,JSON.stringify({identity,at:new Date().toISOString(),...entry})+'\n','utf8');
const done=async(result:Record<string,unknown>):Promise<never>=>{await writeFile(join(root,'weekly-publish.json'),JSON.stringify({identity,runDate,...result},null,2),'utf8');if(process.env.GITHUB_ENV)await appendFile(process.env.GITHUB_ENV,`WEEKLY_RESULT=${join(root,'weekly-publish.json')}\n`,'utf8');console.log(JSON.stringify({identity,...result}));
  const failed=execute&&process.env.MOTUS_LIVE_PUBLISH_ENABLED==='true'&&(result.state==='FAILED'||(result.state==='HOLD'&&finalAttempt));process.exit(failed?1:0)};

/** Renders, checks and uploads the week's PDF; returns the section that links it, or null (recorded) on any failure. */
async function weeklyPdfSection(evidence:WeeklyEvidence,article:WeeklyArticle):Promise<WeeklySection|null> {
  const credentials=driveCredentialsFromEnvironment();
  if(!credentials){await writeFile(join(root,'pdf-upload.json'),JSON.stringify({state:'NOT_CONFIGURED'},null,2),'utf8');return null}
  try{
    const pdf=buildWeeklyPdfHtml(evidence,article,runDate);await writeFile(join(root,'weekly-report.html'),pdf.html,'utf8');
    const bytes=await renderPdf(pdf.html),check=checkPdf(bytes,3);if(!check.ok)throw new Error(`PDF_CHECK_FAILED pages=${check.pages} size=${check.size}`);
    const drive=new GoogleDriveClient(credentials);
    const upload=await drive.uploadPdf({name:pdf.fileName,bytes,folderPath:[DRIVE_ROOT_FOLDER,window.weekEnd.slice(0,4),'Weekly'],description:article.title});
    if(!(await drive.verifyPublic(upload)))throw new Error('PDF_PUBLIC_READ_FAILED');
    await writeFile(join(root,'pdf-upload.json'),JSON.stringify({state:'UPLOADED',fileName:pdf.fileName,pages:check.pages,size:check.size,webViewLink:upload.webViewLink,replaced:upload.replaced,uploadedAt:new Date().toISOString()},null,2),'utf8');
    return {key:'weekly-pdf',title:'PDF 리포트: 주간 시장 전략',intro:'그래프와 표로 한 주를 정리한 A4 3쪽 리포트입니다. 지수 3개월 추이, 업종별 수익률, 대형주 등락, 다음 주 일정을 담았습니다.',links:[{label:`MOTUS 주간 시장 전략 (${pdf.fileName})`,url:upload.webViewLink,meta:'PDF · Google Drive에서 보기·내려받기'}]};
  }catch(error){const reason=error instanceof Error?error.message:String(error);await writeFile(join(root,'pdf-upload.json'),JSON.stringify({state:'FAILED',reason},null,2),'utf8');await record({event:'PDF_FAILED',postId:null,publicPostUrl:null,title:article.title,detail:reason.slice(0,300)});return null}
}

// A week already published needs no collection at all, unless its PDF link is to be added once.
const prior=await ledger(),published=prior.find(item=>item.event==='PUBLISHED'||item.event==='SKIPPED_EXISTING');
if(published&&execute&&!(attachPdf&&!prior.some(item=>item.event==='PDF_ATTACHED')))await done({state:'SKIP',reason:'this week is already published',postId:published.postId,publicPostUrl:published.publicPostUrl});

const evidence=await collectWeeklyEvidence(runDate);
await writeFile(join(root,'evidence.json'),JSON.stringify(evidence,null,2),'utf8');
const article=buildWeeklyArticle(evidence,{requireCalendar:!finalAttempt&&!published});

if(attachPdf&&!published)await done({state:'HOLD',mode:'attach-pdf',reasons:['ATTACH_PDF_WEEK_NOT_PUBLISHED'],publishCallCount:0});
if(published){
  // --attach-pdf on a published week: add the PDF section to the same post (same id and permalink) and read it back.
  // Every outcome other than PDF_ATTACHED or an already-attached SKIP fails the run, so it never shows green.
  const fail=async(reason:string):Promise<never>=>{await record({event:'PDF_FAILED',postId:null,publicPostUrl:null,title:article.title,detail:reason.slice(0,300)});await writeFile(join(root,'weekly-publish.json'),JSON.stringify({identity,runDate,state:'FAILED',mode:'attach-pdf',reason},null,2),'utf8');console.error(JSON.stringify({identity,state:'FAILED',mode:'attach-pdf',reason}));process.exit(1)};
  if(!execute||process.env.MOTUS_LIVE_PUBLISH_ENABLED!=='true')await done({state:'SIMULATED',mode:'attach-pdf',publishCallCount:0});
  if(['BLOGGER_BLOG_ID','BLOGGER_CLIENT_ID','BLOGGER_CLIENT_SECRET','BLOGGER_REFRESH_TOKEN'].some(key=>!process.env[key]?.trim()))await fail('BLOGGER_CREDENTIALS_MISSING');
  const postId=prior.find(item=>(item.event==='PUBLISHED'||item.event==='SKIPPED_EXISTING')&&item.postId)?.postId;if(!postId)await fail('PUBLISHED_POST_ID_UNKNOWN');
  try{
    const section=await weeklyPdfSection(evidence,article);if(!section)await fail('PDF was not uploaded (see pdf-upload.json)');
    const raw=JSON.parse(await readFile(resolve('config/publishing.json'),'utf8')) as {blogger:BloggerPublishingConfig};
    const config={...raw.blogger,blogId:process.env.BLOGGER_BLOG_ID!.trim(),credentialAvailable:true,publishAsDraft:true},google=new GoogleBloggerApiAdapter();
    const before=await google.readPost(postId!,config);
    if(before.status!=='PUBLISHED'||!before.url||!before.content.includes(`data-week="${window.weekStart}"`))await fail('PUBLISHED_POST_MISMATCH');
    if(before.content.includes('data-section="weekly-pdf"'))await done({state:'SKIP',mode:'attach-pdf',reason:'PDF link already in the post',publicPostUrl:before.url});
    const block=renderWeeklySection(section!),content=before.content.replace(/(<p data-section="editorial-lead"[\s\S]*?<\/p>)/,`$1${block}`);
    if(content===before.content)await fail('LEAD_NOT_FOUND_FOR_PDF_SECTION');
    const after=await google.patchPostContent(postId!,{title:before.title,content:`<!doctype html><html><body>${content}</body></html>`,labels:before.labels},config);
    if(after.status!=='PUBLISHED'||after.url!==before.url||!after.content.includes(section!.links![0]!.url))await fail('readback after patch does not contain the PDF link');
    await record({event:'PDF_ATTACHED',postId:postId!,publicPostUrl:after.url,title:before.title,detail:section!.links![0]!.url});
    await done({state:'PDF_ATTACHED',postId,publicPostUrl:after.url,pdf:section!.links![0]!.url});
  }catch(error){await fail(error instanceof Error?error.message:String(error))}
}

const pdfSection=execute&&process.env.MOTUS_LIVE_PUBLISH_ENABLED==='true'&&article.readiness==='READY'?await weeklyPdfSection(evidence,article):null;
if(pdfSection)article.sections.unshift(pdfSection);
const render=renderWeeklyEditorialArticle(article),html=render.html.replace('<article ',`<article data-week="${window.weekStart}" `);
await writeFile(join(root,'weekly-article.json'),JSON.stringify(article,null,2),'utf8');await writeFile(join(root,'weekly-article.html'),html,'utf8');
if(article.readiness!=='READY')await done({state:'HOLD',reasons:article.reasons,title:article.title,publishCallCount:0});
if(!execute||process.env.MOTUS_LIVE_PUBLISH_ENABLED!=='true')await done({state:'SIMULATED',title:article.title,sections:render.renderedSections,publishCallCount:0});
if(process.env.GITHUB_ACTIONS==='true'&&!existsSync(join(process.cwd(),'data','.ops-data-hydrated')))await done({state:'HOLD',reasons:['OPS_DATA_NOT_HYDRATED'],publishCallCount:0});
const missing=['BLOGGER_BLOG_ID','BLOGGER_CLIENT_ID','BLOGGER_CLIENT_SECRET','BLOGGER_REFRESH_TOKEN'].filter(key=>!process.env[key]?.trim());
if(missing.length)await done({state:'HOLD',reasons:['BLOGGER_CREDENTIALS_MISSING'],publishCallCount:0});

// Public label feed: a post of this week that the ledger does not know about (e.g. a lost persistence run).
try{const response=await fetch(`https://motusnova.blogspot.com/feeds/posts/default/-/${encodeURIComponent(WEEKLY_LABEL)}?alt=json&max-results=10`,{signal:AbortSignal.timeout(20000)});
  if(response.ok){const body=await response.json() as {feed?:{entry?:Array<{content?:{$t?:string};link?:Array<{rel?:string;href?:string}>;title?:{$t?:string}}>}};
    // A summary-only feed cannot show the week marker: without it a lost ledger could not prevent a duplicate.
    if((body.feed?.entry??[]).some(entry=>typeof entry.content?.$t!=='string'))await done({state:'HOLD',reasons:['PUBLIC_FEED_HAS_NO_CONTENT'],publishCallCount:0});
    const hit=(body.feed?.entry??[]).find(entry=>(entry.content?.$t??'').includes(`data-week="${window.weekStart}"`));
    if(hit){const url=hit.link?.find(link=>link.rel==='alternate')?.href??null;await record({event:'SKIPPED_EXISTING',postId:null,publicPostUrl:url,title:hit.title?.$t??'',detail:'found on the public label feed'});await done({state:'SKIP',reason:'this week is already on the blog',publicPostUrl:url,publishCallCount:0})}}
  else if(response.status!==404)await done({state:'HOLD',reasons:['PUBLIC_FEED_LOOKUP_'+response.status],publishCallCount:0});
}catch(error){await done({state:'HOLD',reasons:['PUBLIC_FEED_LOOKUP_FAILED'],detail:error instanceof Error?error.message:String(error),publishCallCount:0})}

const raw=JSON.parse(await readFile(resolve('config/publishing.json'),'utf8')) as {blogger:BloggerPublishingConfig};
const config={...raw.blogger,blogId:process.env.BLOGGER_BLOG_ID!.trim(),credentialAvailable:true,publishAsDraft:true};
const google=new GoogleBloggerApiAdapter();
let postId:string|null=null;
try{
  const same=await google.findMatchingPosts({title:article.title,label:WEEKLY_LABEL},config);
  const live=same.find(item=>item.status==='PUBLISHED'&&item.url);
  if(live){await record({event:'SKIPPED_EXISTING',postId:live.postId,publicPostUrl:live.url,title:live.title,detail:'same title already published'});await done({state:'SKIP',reason:'same title already published',postId:live.postId,publicPostUrl:live.url,publishCallCount:0})}
  // Reuse this week's own draft (an earlier run that failed between insert and publish) rather than adding a post.
  const abandoned=new Set(prior.filter(item=>item.event==='DRAFT_ABANDONED').map(item=>item.postId));
  const draftId=prior.filter(item=>item.event==='DRAFT_CREATED'&&!abandoned.has(item.postId)).at(-1)?.postId??same.find(item=>item.status==='DRAFT')?.postId??null;
  if(draftId){
    // A draft that was deleted or is no longer a plain draft is abandoned (recorded) rather than retried forever.
    const existing=await google.readPost(draftId,config).catch((error:unknown)=>{if(error instanceof Error&&/readback 404/.test(error.message))return null;throw error});
    if(existing?.status==='PUBLISHED'&&existing.url){await record({event:'SKIPPED_EXISTING',postId:draftId,publicPostUrl:existing.url,title:existing.title,detail:'earlier draft was already published'});await done({state:'SKIP',postId:draftId,publicPostUrl:existing.url,publishCallCount:0})}
    if(existing?.status==='DRAFT'){await google.patchPostContent(draftId,{title:article.title,content:html,labels:[WEEKLY_LABEL]},config);postId=draftId}
    else await record({event:'DRAFT_ABANDONED',postId:draftId,publicPostUrl:null,title:existing?.title??'',detail:existing?`draft status ${existing.status}`:'draft no longer exists (404)'});}
  if(!postId){const draft=await google.insertDraftContent({title:article.title,content:html,labels:[WEEKLY_LABEL]},config);postId=draft.postId;await record({event:'DRAFT_CREATED',postId,publicPostUrl:null,title:article.title,detail:'draft inserted'})}
  const result=await google.publishDraftPost(postId,config),after=await google.readPost(postId,config);
  if(after.status!=='PUBLISHED'||!isPublicBloggerPostUrl(after.url)||after.url!==result.publicPostUrl||after.title!==article.title)throw new Error('readback after publish does not match (status, permalink or title)');
  if(!after.content.includes(`data-week="${window.weekStart}"`))throw new Error('stored content is missing the week marker');
  await record({event:'PUBLISHED',postId,publicPostUrl:after.url,title:article.title,detail:'published and read back'});
  await done({state:'PUBLISHED',postId,publicPostUrl:after.url,title:article.title,pdf:pdfSection?.links?.[0]?.url??null,publishCallCount:1});
}catch(error){
  const detail=error instanceof Error?error.message:String(error);
  await record({event:'FAILED',postId,publicPostUrl:null,title:article.title,detail});
  await done({state:'FAILED',postId,reason:detail});
}

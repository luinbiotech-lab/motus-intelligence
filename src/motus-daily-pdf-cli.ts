/**
 * Daily briefing PDF (owner decision 2026-11-04): after a daily article is PUBLISHED, render the two-page briefing,
 * upload it to Google Drive ("MOTUS Reports/<year>/Daily/<category>") and add a PDF link right after the lead of
 * the same post, then read the post back.
 *
 *   node dist/src/motus-daily-pdf-cli.js --date YYYY-MM-DD --category ai|us|korea [--execute]
 *
 * Runs only for a PUBLISHED outcome of this operation date; never touches any other post. A PDF failure never
 * changes the publication; the outcome is written to data/operations/<date>/<category>/pdf-report.json.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import type {SplitPublicationUnit} from './intelligence/split-daily-production.js';
import type {AIIntelligenceDailyViewModel,KoreaMarketDailyViewModel,USMarketDailyViewModel} from './intelligence/daily-masters.js';
import {buildDailyPdfHtml,publishedByRun} from './reports/daily-pdf.js';
import {checkPdf,renderPdf} from './reports/pdf-render.js';
import {renderWeeklySection} from './publishers/editorial-article.js';
import {DRIVE_ROOT_FOLDER,GoogleDriveClient,driveCredentialsFromEnvironment} from './services/google-drive.js';
import {GoogleBloggerApiAdapter,type BloggerPublishingConfig} from './services/blogger.js';

const args=process.argv.slice(2),value=(flag:string)=>{const index=args.indexOf(flag);return index>=0?args[index+1]:undefined};
const date=value('--date')??'',name=value('--category')??'',execute=args.includes('--execute');
if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!['ai','us','korea'].includes(name))throw new Error('--date YYYY-MM-DD and --category ai|us|korea required');
const root=join(process.cwd(),'data','operations',date,name),outcomePath=join(root,'pdf-report.json');
const done=async(result:Record<string,unknown>):Promise<never>=>{
  await writeFile(outcomePath,JSON.stringify({date,category:name,at:new Date().toISOString(),...result},null,2),'utf8');
  if(result.state==='FAILED'||result.state==='PATCHED_UNVERIFIED')console.log(`::warning title=Daily PDF ${name}::${result.state} ${String(result.reason??'')}`);
  console.log(JSON.stringify(result));process.exit(0);
};
let patched=false;
try{
  const publishPath=join(root,'auto-publish.json'),unitPath=join(root,'live-unit.json'),ledgerPath=join(root,'publish-ledger.jsonl');
  if(!existsSync(publishPath)||!existsSync(unitPath))await done({state:'SKIP',reason:'no publication outcome for this run'});
  const publication=JSON.parse(await readFile(publishPath,'utf8')) as {state?:string;draftPostId?:string|null;publicPostUrl?:string|null};
  if(publication.state!=='PUBLISHED'||!publication.draftPostId||!publication.publicPostUrl)await done({state:'SKIP',reason:'article not published in this run'});
  // auto-publish.json may be hydrated from ops-data while live-unit.json is rebuilt: only the publishing run attaches.
  const ledger=existsSync(ledgerPath)?await readFile(ledgerPath,'utf8'):'';
  if(!publishedByRun(ledger,process.env.GITHUB_RUN_ID,publication.draftPostId!))await done({state:'SKIP',reason:'article was not published by this run'});
  const unit=JSON.parse(await readFile(unitPath,'utf8')) as SplitPublicationUnit;
  const category=unit.category as 'AI_INTELLIGENCE'|'US_MARKET'|'KOREA_MARKET';
  const pdf=buildDailyPdfHtml(unit.viewModel as AIIntelligenceDailyViewModel|USMarketDailyViewModel|KoreaMarketDailyViewModel,category,`${unit.observedDate} 세션`);
  await writeFile(join(root,'pdf-report.html'),pdf.html,'utf8');
  if(!execute||process.env.MOTUS_LIVE_PUBLISH_ENABLED!=='true')await done({state:'SIMULATED',fileName:pdf.fileName});
  const credentials=driveCredentialsFromEnvironment();if(!credentials)await done({state:'SKIP',reason:'DRIVE_NOT_CONFIGURED'});
  const blogId=process.env.BLOGGER_BLOG_ID?.trim();if(!blogId)throw new Error('BLOGGER_BLOG_ID missing');
  const raw=JSON.parse(await readFile(resolve('config/publishing.json'),'utf8')) as {blogger:BloggerPublishingConfig};
  const config={...raw.blogger,blogId,credentialAvailable:true,publishAsDraft:true},google=new GoogleBloggerApiAdapter();
  // Check the post before anything is rendered or uploaded, so an existing linked PDF is never replaced.
  const before=await google.readPost(publication.draftPostId!,config);
  if(before.status!=='PUBLISHED'||before.url!==publication.publicPostUrl)throw new Error('published post identity does not match the run outcome');
  if(before.content.includes('data-section="daily-pdf"'))await done({state:'SKIP',reason:'PDF link already in the post'});
  const bytes=await renderPdf(pdf.html),check=checkPdf(bytes,2);if(!check.ok)throw new Error(`PDF_CHECK_FAILED pages=${check.pages} size=${check.size}`);
  const drive=new GoogleDriveClient(credentials!),folder=category==='AI_INTELLIGENCE'?'AI':category==='US_MARKET'?'US Market':'Korea Market';
  const upload=await drive.uploadPdf({name:pdf.fileName,bytes,folderPath:[DRIVE_ROOT_FOLDER,date.slice(0,4),'Daily',folder],description:unit.title});
  if(!(await drive.verifyPublic(upload)))throw new Error('PDF_PUBLIC_READ_FAILED');
  const block=renderWeeklySection({key:'daily-pdf',title:'PDF 브리핑 리포트',intro:'오늘 기사의 핵심 수치와 차트, 증권가 리포트를 A4 2쪽으로 정리했습니다.',links:[{label:`MOTUS ${category==='AI_INTELLIGENCE'?'AI 산업':category==='US_MARKET'?'미국 증시':'국내 증시'} 브리핑 (${pdf.fileName})`,url:upload.webViewLink,meta:'PDF · Google Drive에서 보기·내려받기'}]});
  const content=before.content.replace(/(<p data-section="editorial-lead"[\s\S]*?<\/p>)/,`$1${block}`);
  if(content===before.content)throw new Error('LEAD_NOT_FOUND_FOR_PDF_SECTION');
  await google.patchPostContent(publication.draftPostId!,{title:before.title,content:`<!doctype html><html><body>${content}</body></html>`,labels:before.labels},config);
  patched=true;
  const after=await google.readPost(publication.draftPostId!,config);
  if(after.status!=='PUBLISHED'||after.url!==before.url||!after.content.includes(upload.webViewLink))throw new Error('readback after patch does not contain the PDF link');
  await done({state:'PDF_ATTACHED',fileName:pdf.fileName,pages:check.pages,size:check.size,webViewLink:upload.webViewLink,publicPostUrl:after.url});
}catch(error){const reason=error instanceof Error?error.message:String(error);await done({state:patched?'PATCHED_UNVERIFIED':'FAILED',reason})}

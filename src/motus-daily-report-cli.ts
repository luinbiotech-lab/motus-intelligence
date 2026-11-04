/**
 * Daily report (owner decision 2026-11-04): once a day, after the Korea, US and AI articles of an operation date are
 * PUBLISHED, combine them into one PDF (cover + two pages per market), upload it to Google Drive
 * ("MOTUS Reports/<year>/Daily/Report") and publish one post in the '리포트' category that links the PDF and the
 * three articles.
 *
 *   node dist/src/motus-daily-report-cli.js --date YYYY-MM-DD [--execute] [--allow-partial]
 *
 * Without --allow-partial it waits (HOLD, exit 0) until all three categories are published. It never edits the
 * daily articles. Outcome: data/daily-report/<date>/daily-report.json and publish-ledger.jsonl.
 */
import {appendFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import type {SplitPublicationUnit} from './intelligence/split-daily-production.js';
import {DAILY_REPORT_ORDER,buildCombinedDailyPdfHtml,dailyKind,dailyLead,type DailyCategory,type DailyReportPart} from './reports/daily-pdf.js';
import {checkPdf,renderPdf} from './reports/pdf-render.js';
import {DAILY_REPORT_LABEL,renderDailyReportArticle} from './publishers/editorial-article.js';
import {DRIVE_ROOT_FOLDER,GoogleDriveClient,driveCredentialsFromEnvironment} from './services/google-drive.js';
import {GoogleBloggerApiAdapter,isPublicBloggerPostUrl,type BloggerPublishingConfig} from './services/blogger.js';
import type {WeeklySection} from './operations/weekly-review.js';

const args=process.argv.slice(2),value=(flag:string)=>{const index=args.indexOf(flag);return index>=0?args[index+1]:undefined};
const date=value('--date')??'',execute=args.includes('--execute'),allowPartial=args.includes('--allow-partial');
if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('--date YYYY-MM-DD required');
const root=join(process.cwd(),'data','daily-report',date),ledgerPath=join(root,'publish-ledger.jsonl'),outcomePath=join(root,'daily-report.json');
await mkdir(root,{recursive:true});
const done=async(result:Record<string,unknown>):Promise<never>=>{
  await writeFile(outcomePath,JSON.stringify({date,at:new Date().toISOString(),...result},null,2),'utf8');
  if(result.state==='FAILED')console.log(`::warning title=Daily report::FAILED ${String(result.reason??'')}`);
  console.log(JSON.stringify(result));process.exit(result.state==='FAILED'?1:0);
};
const record=async(entry:{event:string;postId:string|null;publicPostUrl:string|null;title:string;detail:string})=>appendFile(ledgerPath,JSON.stringify({date,at:new Date().toISOString(),attemptId:process.env.GITHUB_RUN_ID??'LOCAL',...entry})+'\n','utf8');
const prior=existsSync(ledgerPath)?(await readFile(ledgerPath,'utf8')).split('\n').filter(Boolean).map(line=>JSON.parse(line) as {event:string;postId:string|null;publicPostUrl:string|null}):[];
let postId:string|null=null,title='';
try{
  const published=prior.find(item=>item.event==='PUBLISHED'||item.event==='SKIPPED_EXISTING');
  if(published)await done({state:'SKIP',reason:'daily report already published',publicPostUrl:published.publicPostUrl,publishCallCount:0});
  // The day's published articles (the persisted outcome of each category's production run).
  const folders:Record<DailyCategory,string>={KOREA_MARKET:'korea',US_MARKET:'us',AI_INTELLIGENCE:'ai'};
  const parts:Array<DailyReportPart&{url:string;title:string}>=[],missing:string[]=[];
  for(const category of DAILY_REPORT_ORDER){
    const dir=join(process.cwd(),'data','operations',date,folders[category]),publishPath=join(dir,'auto-publish.json'),unitPath=join(dir,'live-unit.json');
    const outcome=existsSync(publishPath)?JSON.parse(await readFile(publishPath,'utf8')) as {state?:string;publicPostUrl?:string|null}:null;
    if(outcome?.state!=='PUBLISHED'||!outcome.publicPostUrl||!existsSync(unitPath)){missing.push(folders[category]);continue}
    const unit=JSON.parse(await readFile(unitPath,'utf8')) as SplitPublicationUnit;
    if(unit.category!==category)throw new Error(`${folders[category]}: live unit category ${unit.category}`);
    parts.push({category,view:unit.viewModel as DailyReportPart['view'],sessionLabel:`${unit.observedDate} 세션`,url:outcome.publicPostUrl,title:unit.title});
  }
  if(!parts.length)await done({state:'HOLD',reasons:['NO_PUBLISHED_ARTICLE'],missing,publishCallCount:0});
  if(missing.length&&!allowPartial)await done({state:'HOLD',reasons:missing.map(name=>`WAITING_FOR_${name.toUpperCase()}`),missing,publishCallCount:0});
  const pdf=buildCombinedDailyPdfHtml(parts,date);
  await writeFile(join(root,'daily-report-pdf.html'),pdf.html,'utf8');
  const [,month,day]=date.split('-').map(Number);
  title=`[데일리 리포트] ${month}월 ${day}일 ${parts.map(part=>dailyKind(part.category).replace(' 산업','')).join('·')} 핵심 정리`;
  const article=(link:{url:string;fileName:string}|null)=>{
    const sections:WeeklySection[]=[];
    if(link)sections.push({key:'daily-report-pdf',title:'PDF 리포트: 오늘의 시장 브리핑',intro:`표지 한 장에 ${parts.length}개 분야의 핵심 수치를, 이어서 분야마다 차트·종목·증권가 리포트를 2쪽씩 담은 A4 ${pdf.pages}쪽 리포트입니다.`,links:[{label:`MOTUS 데일리 리포트 (${link.fileName})`,url:link.url,meta:'PDF · Google Drive에서 보기·내려받기'}]});
    for(const part of parts)sections.push({key:`daily-report-${folders[part.category]}`,title:`${dailyKind(part.category)}: ${part.title}`,intro:dailyLead(part.view),links:[{label:part.title,url:part.url,meta:`${dailyKind(part.category)} 기사 전문 · ${part.sessionLabel}`}]});
    const lead=`${month}월 ${day}일 MOTUS 데일리 리포트입니다. 오늘 발행한 ${parts.map(part=>dailyKind(part.category)).join('·')} 기사의 핵심 수치와 차트, 증권가 리포트를 PDF 한 편으로 묶었습니다.${missing.length?` ${missing.map(name=>dailyKind(DAILY_REPORT_ORDER.find(c=>folders[c]===name)!)).join('·')} 기사는 발행되지 않아 이번 리포트에서 빠졌습니다.`:''}`;
    return renderDailyReportArticle({date,title,subtitle:'국내·미국 증시와 AI 산업을 한 번에 보는 하루 정리',lead,sections,sources:parts.map(part=>({label:`${dailyKind(part.category)} — ${part.title}`,url:part.url}))}).html;
  };
  const preview=article({url:'https://drive.google.com/',fileName:pdf.fileName});
  await writeFile(join(root,'daily-report-article.html'),preview,'utf8');
  if(!execute||process.env.MOTUS_LIVE_PUBLISH_ENABLED!=='true')await done({state:'SIMULATED',title,fileName:pdf.fileName,pages:pdf.pages,missing,publishCallCount:0});
  const blogId=process.env.BLOGGER_BLOG_ID?.trim(),credentials=driveCredentialsFromEnvironment();
  if(!blogId||!process.env.BLOGGER_CLIENT_ID||!process.env.BLOGGER_CLIENT_SECRET||!process.env.BLOGGER_REFRESH_TOKEN)await done({state:'HOLD',reasons:['BLOGGER_CREDENTIALS_MISSING'],publishCallCount:0});
  if(!credentials)await done({state:'HOLD',reasons:['DRIVE_NOT_CONFIGURED'],publishCallCount:0});
  // The public label feed: a report of this date that the ledger does not know about (e.g. a lost persistence run).
  const response=await fetch(`https://motusnova.blogspot.com/feeds/posts/default/-/${encodeURIComponent(DAILY_REPORT_LABEL)}?alt=json&max-results=10`,{signal:AbortSignal.timeout(20000)});
  if(response.ok){const body=await response.json() as {feed?:{entry?:Array<{content?:{$t?:string};link?:Array<{rel?:string;href?:string}>;title?:{$t?:string}}>}};
    if((body.feed?.entry??[]).some(entry=>typeof entry.content?.$t!=='string'))await done({state:'HOLD',reasons:['PUBLIC_FEED_HAS_NO_CONTENT'],publishCallCount:0});
    const hit=(body.feed?.entry??[]).find(entry=>(entry.content?.$t??'').includes(`data-daily-report="${date}"`));
    if(hit){const url=hit.link?.find(link=>link.rel==='alternate')?.href??null;await record({event:'SKIPPED_EXISTING',postId:null,publicPostUrl:url,title:hit.title?.$t??'',detail:'found on the public label feed'});await done({state:'SKIP',reason:'this date is already on the blog',publicPostUrl:url,publishCallCount:0})}}
  else if(response.status!==404)await done({state:'HOLD',reasons:['PUBLIC_FEED_LOOKUP_'+response.status],publishCallCount:0});
  const raw=JSON.parse(await readFile(resolve('config/publishing.json'),'utf8')) as {blogger:BloggerPublishingConfig};
  const config={...raw.blogger,blogId:blogId!,credentialAvailable:true,publishAsDraft:true},google=new GoogleBloggerApiAdapter();
  const same=await google.findMatchingPosts({title,label:DAILY_REPORT_LABEL},config);
  const live=same.find(item=>item.status==='PUBLISHED'&&item.url);
  if(live){await record({event:'SKIPPED_EXISTING',postId:live.postId,publicPostUrl:live.url,title:live.title,detail:'same title already published'});await done({state:'SKIP',reason:'same title already published',publicPostUrl:live.url,publishCallCount:0})}
  // PDF first (no post links it until the post below is published, so a same-name replace is safe).
  const bytes=await renderPdf(pdf.html),check=checkPdf(bytes,pdf.pages);
  if(!check.ok)throw new Error(`PDF_CHECK_FAILED pages=${check.pages}/${pdf.pages} size=${check.size}`);
  const drive=new GoogleDriveClient(credentials!);
  const upload=await drive.uploadPdf({name:pdf.fileName,bytes,folderPath:[DRIVE_ROOT_FOLDER,date.slice(0,4),'Daily','Report'],description:title});
  if(!(await drive.verifyPublic(upload)))throw new Error('PDF_PUBLIC_READ_FAILED');
  const html=article({url:upload.webViewLink,fileName:pdf.fileName});
  await writeFile(join(root,'daily-report-article.html'),html,'utf8');
  // Reuse this date's own draft (an earlier run that failed between insert and publish) rather than adding a post.
  const abandoned=new Set(prior.filter(item=>item.event==='DRAFT_ABANDONED').map(item=>item.postId));
  const draftId=prior.filter(item=>item.event==='DRAFT_CREATED'&&!abandoned.has(item.postId)).at(-1)?.postId??same.find(item=>item.status==='DRAFT')?.postId??null;
  if(draftId){
    const existing=await google.readPost(draftId,config).catch((error:unknown)=>{if(error instanceof Error&&/readback 404/.test(error.message))return null;throw error});
    if(existing?.status==='PUBLISHED'&&existing.url){await record({event:'SKIPPED_EXISTING',postId:draftId,publicPostUrl:existing.url,title:existing.title,detail:'earlier draft was already published'});await done({state:'SKIP',publicPostUrl:existing.url,publishCallCount:0})}
    if(existing?.status==='DRAFT'){await google.patchPostContent(draftId,{title,content:html,labels:[DAILY_REPORT_LABEL]},config);postId=draftId}
    else await record({event:'DRAFT_ABANDONED',postId:draftId,publicPostUrl:null,title:existing?.title??'',detail:existing?`draft status ${existing.status}`:'draft no longer exists (404)'});
  }
  if(!postId){const draft=await google.insertDraftContent({title,content:html,labels:[DAILY_REPORT_LABEL]},config);postId=draft.postId;await record({event:'DRAFT_CREATED',postId,publicPostUrl:null,title,detail:'draft inserted'})}
  const result=await google.publishDraftPost(postId,config),after=await google.readPost(postId,config);
  if(after.status!=='PUBLISHED'||!isPublicBloggerPostUrl(after.url)||after.url!==result.publicPostUrl||after.title!==title)throw new Error('readback after publish does not match (status, permalink or title)');
  if(!after.content.includes(`data-daily-report="${date}"`)||!after.content.includes(upload.webViewLink))throw new Error('stored content is missing the date marker or the PDF link');
  await record({event:'PUBLISHED',postId,publicPostUrl:after.url,title,detail:'published and read back'});
  await done({state:'PUBLISHED',postId,publicPostUrl:after.url,title,pdf:upload.webViewLink,pages:check.pages,missing,publishCallCount:1});
}catch(error){
  const detail=error instanceof Error?error.message:String(error);
  await record({event:'FAILED',postId,publicPostUrl:null,title,detail});
  await done({state:'FAILED',postId,reason:detail});
}

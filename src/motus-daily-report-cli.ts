/**
 * Daily report (owner decision 2026-11-04): once a day, after the Korea, US and AI articles of an operation date are
 * PUBLISHED, combine them into one PDF (cover + two pages per market), upload it to Google Drive
 * ("MOTUS Reports/<year>/Daily/Report") and publish one post in the '리포트' category that links the PDF and the
 * three articles.
 *
 *   node dist/src/motus-daily-report-cli.js --date YYYY-MM-DD [--execute] [--allow-partial]
 *
 * Owner decisions 2026-11-04: Monday = Korea + AI (no US session on Sunday), Tuesday-Friday = Korea + US + AI;
 * no report on Saturday/Sunday. Without --allow-partial it waits (HOLD, exit 0) until every expected category is
 * published; the final attempt (05:40 KST next day, --final-attempt) publishes what is there and fails loudly on
 * HOLD. Publication is judged by each category's publish ledger (auto-publish.json is overwritten by later runs).
 * Article data is charted only when its rendered article equals the article stored on Blogger (루인 review P0;
 * operations/daily-report-plan.ts); otherwise the article is linked, not charted. Without --execute it only reports
 * readiness from the files and writes nothing. It never edits the daily articles.
 */
import {appendFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import type {SplitPublicationUnit} from './intelligence/split-daily-production.js';
import {DAILY_REPORT_ORDER,buildCombinedDailyPdfHtml,dailyKind,dailyLead,dailyReportSection,expectedCategories,type DailyCategory,type DailyReportPart} from './reports/daily-pdf.js';
import {checkPdf,renderPdf} from './reports/pdf-render.js';
import {DAILY_REPORT_LABEL,renderDailyReportArticle} from './publishers/editorial-article.js';
import {DRIVE_ROOT_FOLDER,GoogleDriveClient,driveCredentialsFromEnvironment} from './services/google-drive.js';
import {GoogleBloggerApiAdapter,isPublicBloggerPostUrl,type BloggerPublishingConfig} from './services/blogger.js';
import type {WeeklySection} from './operations/weekly-review.js';
import {planCategory,verifiedCandidate,type CategoryPlan} from './operations/daily-report-plan.js';

const args=process.argv.slice(2),value=(flag:string)=>{const index=args.indexOf(flag);return index>=0?args[index+1]:undefined};
const date=value('--date')??'',execute=args.includes('--execute'),finalAttempt=args.includes('--final-attempt'),allowPartial=finalAttempt||args.includes('--allow-partial');
if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('--date YYYY-MM-DD required');
const root=join(process.cwd(),'data','daily-report',date),ledgerPath=join(root,'publish-ledger.jsonl'),outcomePath=join(root,'daily-report.json');
if(execute)await mkdir(root,{recursive:true});
const done=async(result:Record<string,unknown>):Promise<never>=>{
  if(execute)await writeFile(outcomePath,JSON.stringify({date,at:new Date().toISOString(),...result},null,2),'utf8');
  const failed=result.state==='FAILED'||(finalAttempt&&result.state==='HOLD');
  if(failed)console.log(`::warning title=Daily report ${date}::${String(result.state)} ${String(result.reason??(result.reasons as string[]|undefined)?.join(',')??'')}`);
  console.log(JSON.stringify({date,...result}));process.exit(failed?1:0);
};
const record=async(entry:{event:string;postId:string|null;publicPostUrl:string|null;title:string;detail:string})=>execute&&appendFile(ledgerPath,JSON.stringify({date,at:new Date().toISOString(),attemptId:process.env.GITHUB_RUN_ID??'LOCAL',...entry})+'\n','utf8');
const prior=existsSync(ledgerPath)?(await readFile(ledgerPath,'utf8')).split('\n').filter(Boolean).map(line=>JSON.parse(line) as {event:string;postId:string|null;publicPostUrl:string|null}):[];
let postId:string|null=null,title='';
try{
  const published=prior.find(item=>item.event==='PUBLISHED'||item.event==='SKIPPED_EXISTING');
  if(published)await done({state:'SKIP',reason:'daily report already published',publicPostUrl:published.publicPostUrl,publishCallCount:0});
  // The day's expected categories (owner decision): Monday Korea + AI, Tuesday-Friday all three, weekend none.
  const weekday=new Date(date+'T00:00:00Z').getUTCDay(),expected=expectedCategories(weekday);
  if(!expected.length)await done({state:'SKIP',reason:'no daily report on weekends',publishCallCount:0});
  const folders:Record<DailyCategory,string>={KOREA_MARKET:'korea',US_MARKET:'us',AI_INTELLIGENCE:'ai'};
  const parts:Array<DailyReportPart&{url:string;title:string}>=[],links:Array<{category:DailyCategory;url:string;title:string;sessionDate:string|null}>=[],missing:string[]=[],noData:string[]=[];
  const plans=new Map<DailyCategory,CategoryPlan>(),dataReasons:Record<string,string[]>={};
  const readText=async(path:string)=>existsSync(path)?await readFile(path,'utf8'):null;
  for(const category of expected){
    const dir=join(process.cwd(),'data','operations',date,folders[category]);
    const plan=planCategory(category,{ledger:await readText(join(dir,'publish-ledger.jsonl'))??'',snapshot:await readText(join(dir,'published-unit.json')),live:await readText(join(dir,'live-unit.json'))});
    plans.set(category,plan);dataReasons[folders[category]]=plan.reasons;
    if(!plan.published){missing.push(folders[category]);continue}
    // Provisional until the execute step compares it with the stored post (verifiedCandidate).
    const unit=plan.candidates[0]?.unit;
    links.push({category,url:plan.published.url,title:unit?.title??`${dailyKind(category)} 기사`,sessionDate:plan.published.sessionDate});
    if(unit)parts.push({category,view:unit.viewModel as DailyReportPart['view'],sessionLabel:`${unit.observedDate} 세션`,url:plan.published.url,title:unit.title});else noData.push(folders[category]);
  }
  if(!links.length)await done({state:'HOLD',reasons:['NO_PUBLISHED_ARTICLE'],missing,publishCallCount:0});
  if(missing.length&&!allowPartial)await done({state:'HOLD',reasons:missing.map(name=>`WAITING_FOR_${name.toUpperCase()}`),missing,publishCallCount:0});
  // A published article without trustworthy data waits for the final attempt (then it is linked, not charted).
  if(noData.length&&!allowPartial)await done({state:'HOLD',reasons:noData.map(name=>`NO_DATA_FOR_${name.toUpperCase()}`),noData,dataReasons,publishCallCount:0});
  if(!parts.length)await done({state:'HOLD',reasons:['NO_ARTICLE_DATA_FOR_PDF'],noData,publishCallCount:0});
  let pdf=buildCombinedDailyPdfHtml(parts,date);
  const [,month,day]=date.split('-').map(Number);
  const [year]=date.split('-');
  title=`[데일리 리포트] ${year}년 ${month}월 ${day}일 ${links.map(link=>dailyKind(link.category).replace(' 산업','')).join('·')} 핵심 정리`;
  const article=(link:{url:string;fileName:string}|null)=>{
    const sections:WeeklySection[]=[];
    if(link)sections.push({key:'daily-report-pdf',title:'PDF 리포트: 오늘의 시장 브리핑',intro:`표지 한 장에 ${parts.length}개 분야의 핵심 수치를, 이어서 분야마다 차트·종목·증권가 리포트를 2쪽씩 담은 A4 ${pdf.pages}쪽 리포트입니다.`,links:[{label:`MOTUS 데일리 리포트 (${link.fileName})`,url:link.url,meta:'PDF · Google Drive에서 보기·내려받기'}]});
    for(const link of links){const part=parts.find(item=>item.category===link.category),key=`daily-report-${folders[link.category]}`,title=`${dailyKind(link.category)}: ${link.title}`,articleLink={label:link.title,url:link.url,meta:`${dailyKind(link.category)} 기사 전문${link.sessionDate?` · ${link.sessionDate} 세션`:''}`};sections.push(part?dailyReportSection({key,title,view:part.view,link:articleLink}):{key,title,links:[articleLink]})}
    const kindOf=(name:string)=>dailyKind(DAILY_REPORT_ORDER.find(c=>folders[c]===name)!);
    const lead=`${month}월 ${day}일 MOTUS 데일리 리포트입니다. 오늘 발행한 ${parts.map(part=>dailyKind(part.category)).join('·')} 기사의 핵심 수치와 차트, 증권가 리포트를 PDF 한 편으로 묶었습니다.${weekday===1?' 월요일은 주말 동안 미국 정규장이 열리지 않아 국내 증시와 AI 산업만 다룹니다.':''}${missing.length?` ${missing.map(kindOf).join('·')} 기사는 이날 발행되지 않아 이번 리포트에서 빠졌습니다.`:''}${noData.length?` ${noData.map(kindOf).join('·')} 기사는 링크로만 소개합니다.`:''}`;
    return renderDailyReportArticle({date,title,subtitle:'국내·미국 증시와 AI 산업을 한 번에 보는 하루 정리',lead,sections,sources:links.map(link=>({label:`${dailyKind(link.category)} — ${link.title}`,url:link.url}))}).html;
  };
  article({url:'https://drive.google.com/',fileName:pdf.fileName});
  if(!execute||process.env.MOTUS_LIVE_PUBLISH_ENABLED!=='true')await done({state:'SIMULATED',title,fileName:pdf.fileName,pages:pdf.pages,missing,noData,dataReasons,publishCallCount:0});
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
  const same=(await google.findMatchingPosts({title,label:DAILY_REPORT_LABEL},config)).filter(item=>item.status!=='DRAFT'||item.content.includes(`data-daily-report="${date}"`));
  const live=same.find(item=>item.status==='PUBLISHED'&&item.url);
  if(live){await record({event:'SKIPPED_EXISTING',postId:live.postId,publicPostUrl:live.url,title:live.title,detail:'same title already published'});await done({state:'SKIP',reason:'same title already published',publicPostUrl:live.url,publishCallCount:0})}
  // 루인 review P0: chart only a unit whose rendered article equals the stored post; otherwise link only.
  parts.length=0;noData.length=0;const verification:Record<string,string>={};
  for(const link of links){
    const plan=plans.get(link.category)!,name=folders[link.category];
    if(!plan.published?.postId){noData.push(name);verification[name]='NO_POST_ID_IN_LEDGER';continue}
    const post=await google.readPost(plan.published.postId,config).catch((error:unknown)=>error instanceof Error?error:new Error(String(error)));
    if(post instanceof Error){noData.push(name);verification[name]=`POST_READ_FAILED: ${post.message.slice(0,120)}`;continue}
    const checked=verifiedCandidate(plan,post);
    if('reason' in checked){noData.push(name);verification[name]=checked.reason;continue}
    link.title=post.title;verification[name]=`VERIFIED_${checked.candidate.source}`;
    parts.push({category:link.category,view:checked.candidate.unit.viewModel as DailyReportPart['view'],sessionLabel:`${checked.candidate.unit.observedDate} 세션`,url:link.url,title:post.title});
  }
  console.log(JSON.stringify({verification}));
  if(noData.length&&!allowPartial)await done({state:'HOLD',reasons:noData.map(name=>`UNVERIFIED_DATA_FOR_${name.toUpperCase()}`),verification,publishCallCount:0});
  if(!parts.length)await done({state:'HOLD',reasons:['NO_VERIFIED_ARTICLE_DATA'],verification,publishCallCount:0});
  pdf=buildCombinedDailyPdfHtml(parts,date);
  await writeFile(join(root,'daily-report-pdf.html'),pdf.html,'utf8');
  // PDF first (no post links it until the post below is published; Drive replaces a same-name file, so a retry of
  // the same date leaves one file).
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
  await done({state:'PUBLISHED',postId,publicPostUrl:after.url,title,pdf:upload.webViewLink,pages:check.pages,missing,noData,verification,publishCallCount:1});
}catch(error){
  const detail=error instanceof Error?error.message:String(error);
  await record({event:'FAILED',postId,publicPostUrl:null,title,detail});
  await done({state:'FAILED',postId,reason:detail});
}

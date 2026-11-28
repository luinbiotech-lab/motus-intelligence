import test from 'node:test';
import assert from 'node:assert/strict';
import {createFirstSplitDailyProductionRun} from '../src/intelligence/split-daily-production.js';
import {buildCombinedDailyPdfHtml,type DailyReportPart} from '../src/reports/daily-pdf.js';
import {DAILY_REPORT_LABEL,renderDailyReportArticle} from '../src/publishers/editorial-article.js';

const parts=():DailyReportPart[]=>createFirstSplitDailyProductionRun().units.map(unit=>({category:unit.category as DailyReportPart['category'],view:unit.viewModel as never,sessionLabel:'test'}));

test('the combined daily report is a cover plus two pages per category, Korea → US → AI, with balanced markup', () => {
  const all=parts(),pdf=buildCombinedDailyPdfHtml([...all].reverse(),'2026-11-05');
  assert.equal(pdf.pages,1+2*all.length);
  assert.equal((pdf.html.match(/<div class=page>/g)??[]).length,pdf.pages);
  // Unbalanced divs nest every page into the first one (a one-page PDF).
  assert.equal((pdf.html.match(/<div[\s>]/g)??[]).length,(pdf.html.match(/<\/div>/g)??[]).length);
  assert.equal(pdf.fileName,'MOTUS_Daily_Report_2026-11-05.pdf');
  const cover=pdf.html.slice(0,pdf.html.indexOf('<div class=page>',pdf.html.indexOf('<div class=page>')+1));
  assert.ok(cover.indexOf('국내 증시 ·')<cover.indexOf('미국 증시 ·')&&cover.indexOf('미국 증시 ·')<cover.indexOf('AI 산업 ·'));
  assert.doesNotMatch(pdf.html,/undefined|NaN|Infinity/);
  // 2026-11-28 owner: one market has no cover (it was one card on an empty page, repeated by the next page).
  const one=buildCombinedDailyPdfHtml(all.slice(0,1),'2026-11-05');
  assert.equal(one.pages,2);assert.equal((one.html.match(/<div class=page>/g)??[]).length,2);assert.doesNotMatch(one.html,/오늘의 시장<\/em>/);
  assert.match(pdf.html,/국내 증시 2~3쪽 · 미국 증시 4~5쪽 · AI 산업 6~7쪽/);
  assert.doesNotMatch(pdf.html,/2쪽씩/);
  assert.throws(()=>buildCombinedDailyPdfHtml([],'2026-11-05'));
});

test('the daily report post carries the date marker, the 리포트 label and links only', () => {
  const result=renderDailyReportArticle({date:'2026-11-05',title:'[데일리 리포트] 11월 5일 국내 증시·미국 증시·AI 핵심 정리',subtitle:'s',lead:'리드 문장입니다.',sections:[{key:'daily-report-pdf',title:'PDF',links:[{label:'PDF',url:'https://drive.google.com/file/d/x/view',meta:'PDF'}]},{key:'daily-report-korea',title:'국내 증시: t',intro:'요약',links:[{label:'t',url:'https://motusnova.blogspot.com/2026/11/a.html',meta:'m'}]}],sources:[{label:'국내 증시 — t',url:'https://motusnova.blogspot.com/2026/11/a.html'}]});
  assert.equal(result.label,DAILY_REPORT_LABEL);
  assert.equal(DAILY_REPORT_LABEL,'리포트');
  assert.match(result.html,/data-section="editorial-lead" data-daily-report="2026-11-05"/);
  assert.match(result.html,/href="https:\/\/drive\.google\.com\/file\/d\/x\/view"/);
});

test('daily report policy: Monday Korea + AI, Tuesday-Friday all three, no weekend report', async () => {
  const {expectedCategories}=await import('../src/reports/daily-pdf.js');
  assert.deepEqual(expectedCategories(1),['KOREA_MARKET','AI_INTELLIGENCE']);
  for(const day of [2,3,4,5])assert.deepEqual(expectedCategories(day),['KOREA_MARKET','US_MARKET','AI_INTELLIGENCE']);
  assert.deepEqual(expectedCategories(6),[]);assert.deepEqual(expectedCategories(0),[]);
});

import {planCategory,publishedArticle,verifiedCandidate,withoutDailyPdfLink} from '../src/operations/daily-report-plan.js';
const unitOf=(category:string)=>createFirstSplitDailyProductionRun().units.find(unit=>unit.category===category)!;
const ledgerFor=(entries:object[])=>entries.map(entry=>JSON.stringify(entry)).join('\n');
const URL_A='https://motusnova.blogspot.com/2026/11/a.html';

test('publication is read from the ledger (last PUBLISHED/REPUBLISHED), not from auto-publish.json', () => {
  const ledger=ledgerFor([{event:'PUBLISH_ATTEMPT'},{event:'PUBLISHED',publicPostUrl:URL_A,sessionDate:'2026-11-03',attemptId:'7',postId:'p1'},{event:'GATE_HOLD'},'not json' as never,{event:'REPUBLISHED',publicPostUrl:URL_A,sessionDate:'2026-11-03',attemptId:'9',postId:'p1'}]);
  assert.deepEqual(publishedArticle(ledger),{url:URL_A,sessionDate:'2026-11-03',attemptId:'9',postId:'p1'});
  assert.equal(publishedArticle(ledgerFor([{event:'SKIPPED_EXISTING',publicPostUrl:URL_A}])),null);
  assert.equal(publishedArticle(''),null);
});

test('candidate units: snapshot first, each rejection with its own reason code', () => {
  const unit=unitOf('US_MARKET'),session=unit.observedDate,ledger=ledgerFor([{event:'PUBLISHED',publicPostUrl:URL_A,sessionDate:session,postId:'p1'}]);
  const ok=JSON.stringify(unit),stale=JSON.stringify({...unit,observedDate:'2020-01-01'}),wrong=JSON.stringify({...unit,category:'KOREA_MARKET'});
  assert.deepEqual(planCategory('US_MARKET',{ledger:'',snapshot:ok,live:ok}).reasons,['NOT_PUBLISHED']);
  const both=planCategory('US_MARKET',{ledger,snapshot:ok,live:ok});assert.deepEqual(both.candidates.map(c=>c.source),['SNAPSHOT','LIVE']);
  // A stale or broken snapshot no longer hides the live unit; both are still subject to the content check.
  const staleSnap=planCategory('US_MARKET',{ledger,snapshot:stale,live:ok});assert.deepEqual(staleSnap.reasons,['SNAPSHOT_SESSION_MISMATCH']);assert.deepEqual(staleSnap.candidates.map(c=>c.source),['LIVE']);
  assert.deepEqual(planCategory('US_MARKET',{ledger,snapshot:'{',live:wrong}).reasons,['SNAPSHOT_UNREADABLE','LIVE_INVALID']);
  assert.deepEqual(planCategory('US_MARKET',{ledger,snapshot:null,live:null}).reasons,['SNAPSHOT_ABSENT','LIVE_ABSENT']);
});

test('only a unit whose rendered article equals the stored post is charted (루인 P0)', () => {
  const unit=unitOf('KOREA_MARKET'),session=unit.observedDate,ledger=ledgerFor([{event:'PUBLISHED',publicPostUrl:URL_A,sessionDate:session,postId:'p1'}]);
  const rebuilt={...unit,render:{...unit.render,html:unit.render.html.replace('</article>','<p>later run text</p></article>')}};
  const plan=planCategory('KOREA_MARKET',{ledger,snapshot:JSON.stringify(rebuilt),live:JSON.stringify(unit)});
  const post={postId:'p1',title:unit.title,content:unit.render.html,status:'PUBLISHED' as const,url:URL_A,labels:[]};
  const match=verifiedCandidate(plan,post);assert.ok('candidate' in match&&match.candidate.source==='LIVE');
  assert.deepEqual(verifiedCandidate(planCategory('KOREA_MARKET',{ledger,snapshot:JSON.stringify(rebuilt),live:null}),post),{reason:'CONTENT_MISMATCH'});
  assert.deepEqual(verifiedCandidate(plan,{...post,url:'https://motusnova.blogspot.com/2026/11/b.html'}),{reason:'POST_IDENTITY_MISMATCH'});
  assert.deepEqual(verifiedCandidate(plan,{...post,status:'DRAFT'}),{reason:'POST_IDENTITY_MISMATCH'});
  // The per-article PDF link block added on 2026-11-04 is ignored in the comparison.
  const withPdf={...post,content:unit.render.html.replace(/(<\/header>)/,'$1<section data-section="daily-pdf" style="x"><a href="https://drive.google.com/x">PDF</a></section>')};
  assert.notEqual(withPdf.content,post.content);assert.equal(withoutDailyPdfLink(withPdf.content),post.content);
  assert.ok('candidate' in verifiedCandidate(plan,withPdf));
});

test('the daily report carries a valid article hero image as its thumbnail, and drops an untrusted one (2026-11-11)',()=>{
  const base={date:'2026-11-11',title:'[데일리 리포트] 2026년 11월 11일 국내 증시·AI 핵심 정리',subtitle:'s',lead:'리포트입니다.',sections:[],sources:[]};
  const hero={url:'https://raw.githubusercontent.com/luinbiotech-lab/motus-intelligence/ops-data/data/operations/2026-11-11/korea/hero-0123456789ab.png',alt:'MOTUS 데일리 리포트 11월 11일 대표 이미지',width:1200,height:630};
  const withHero=renderDailyReportArticle({...base,heroImage:hero}).html;
  assert.match(withHero,/<figure data-section="hero-image"[^>]*><img src="https:\/\/raw\.githubusercontent\.com\/[^"]+hero-0123456789ab\.png"/);
  assert.ok(withHero.indexOf('hero-image')<withHero.indexOf('data-daily-report="2026-11-11"'));
  assert.doesNotMatch(renderDailyReportArticle({...base,heroImage:{...hero,url:'https://example.com/x.png'}}).html,/<img /);
  assert.doesNotMatch(renderDailyReportArticle(base).html,/<img /);
});

test('daily PDF (11/27 report): bare-list closes, investor flows, no repeated quote, session-close date', async () => {
  const {buildDailyPdfHtml,stockRows}=await import('../src/reports/daily-pdf.js');
  const unit=createFirstSplitDailyProductionRun().units.find(item=>item.category==='KOREA_MARKET')!;
  const view=structuredClone(unit.viewModel) as never as import('../src/intelligence/daily-masters.js').KoreaMarketDailyViewModel;
  view.deepSections=[{key:'korea-stocks',placement:'early',role:'data',title:'검색',bars:[{label:'삼성전자',value:0.47},{label:'삼성전기',value:3.97},{label:'안랩',value:2.03}],paragraphs:[{text:'이 밖의 검색 상위 종목은 종가와 등락만 정리했다: 삼성전자(1위, 171,500원, +0.47%), 안랩(6위, 98,700원, +2.03%).'},{text:'나머지 검색 상위 종목은 삼성전기 785,000원(+3.97%)에 거래를 마쳤다.'}]},
    {key:'korea-causes',placement:'early',role:'broker',title:'요인',paragraphs:[{text:'연합뉴스는 “코스피가 반등했다”고 전했다.'},{text:'KB증권은 “반도체가 올랐다”고 진단했다.'}]}] as never;
  view.investorFlows=[{factId:'f0',group:'FLOW',label:'개인',displayValue:'-10,698억원',direction:'DOWN',source:{label:'n',url:'https://x'}},{factId:'f1',group:'FLOW',label:'기관',displayValue:'+7,530억원',direction:'UP',source:{label:'n',url:'https://x'}}] as never;
  const rows=stockRows(view);
  assert.deepEqual(rows.map(row=>[row.name,row.close]),[['삼성전자','171,500원'],['삼성전기','785,000원'],['안랩','98,700원']]);
  const html=buildDailyPdfHtml(view,'KOREA_MARKET','s').html;
  assert.match(html,/투자자별 순매수/);assert.match(html,/-10,698/);
  assert.equal((html.match(/코스피가 반등했다/g)??[]).length,1,'a quote shown in the issue box is not repeated on page 2');
  assert.match(html,/\d+월 \d+일 마감/);
  assert.doesNotMatch(html,/<td class=r>-<\/td>/);
});

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
  assert.equal(buildCombinedDailyPdfHtml(all.slice(0,1),'2026-11-05').pages,3);
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

test('publication is read from the ledger, not from auto-publish.json that later runs overwrite', async () => {
  const {publishedArticle}=await import('../src/reports/daily-pdf.js');
  const ledger=[{event:'PUBLISH_ATTEMPT'},{event:'PUBLISHED',publicPostUrl:'https://motusnova.blogspot.com/2026/10/a.html',sessionDate:'2026-10-28'},{event:'GATE_HOLD'},{event:'REPUBLISHED',publicPostUrl:'https://motusnova.blogspot.com/2026/10/a.html',sessionDate:'2026-10-28'}].map(e=>JSON.stringify(e)).join('\n');
  assert.deepEqual(publishedArticle(ledger),{url:'https://motusnova.blogspot.com/2026/10/a.html',sessionDate:'2026-10-28'});
  assert.equal(publishedArticle(JSON.stringify({event:'SKIPPED_EXISTING',publicPostUrl:'https://x'})),null);
  assert.equal(publishedArticle(''),null);
});

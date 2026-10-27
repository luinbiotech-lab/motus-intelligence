import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateEditorialQuality} from '../src/production/editorial-quality.js';
import {formatTreasuryMetric} from '../src/operations/market-narrative.js';
import {buildUSPdfViewModel} from '../src/reports/pdf-production.js';
import {createFirstSplitDailyProductionRun} from '../src/intelligence/split-daily-production.js';
import type {USMarketDailyViewModel} from '../src/intelligence/daily-masters.js';
import {renderUSEditorialArticle} from '../src/publishers/editorial-article.js';
import {buildProductionVerification} from '../src/production/verification-artifact.js';

test('yield levels carry percent, dated observations and absolute bp rather than relative percent',()=>{
  assert.deepEqual(formatTreasuryMetric({label:'10Y',latest:5,previous:4.96,date:'2026-10-23',sessionDate:'2026-10-26'}),{label:'10Y (2026-10-23 기준)',value:'5.00%',change:'+4bp',direction:'UP'});
  assert.equal(formatTreasuryMetric({label:'10Y',latest:4.975,previous:4.98,date:'2026-10-26',sessionDate:'2026-10-26'}).change,'-0.5bp');
  assert.equal(formatTreasuryMetric({label:'10Y',latest:0,previous:0,date:'2026-10-26',sessionDate:'2026-10-26'}).change,'0bp');
  assert.throws(()=>formatTreasuryMetric({label:'10Y',latest:NaN,previous:4,date:'2026-10-26',sessionDate:'2026-10-26'}),/INVALID/);
});

test('SVG descriptions, masthead and source-list text cannot inflate editorial depth',()=>{
  const short=['전일 지수 종가를 확인하고 추세를 살폈다.','관측일이 다른 금리는 당일 움직임과 구분한다.','후속 자료에서 원인을 확인한다.','개별 업종은 별도 데이터가 필요하다.'].map(t=>`<p>${t.repeat(2)}</p>`).join('');
  const padding='차트의 설명과 자료 목록은 본문 분석 분량이 아니다. '.repeat(100);
  const result=evaluateEditorialQuality('미국 주요 지수와 장기금리 흐름을 살피다',`<article><header><p>${padding}</p></header><svg><desc>${padding}</desc></svg>${short}<ul><li>${padding}</li></ul></article>`);
  assert.equal(result.pass,false);assert.ok(result.proseTextLength<900);assert.ok(result.reasons.includes('article depth insufficient'));
});

test('PDF retains article narrative facts and analysis with three core charts and missing research',()=>{
  const view=structuredClone(createFirstSplitDailyProductionRun().units.find(u=>u.category==='US_MARKET')!.viewModel) as USMarketDailyViewModel;
  view.marketHistory.series=view.marketHistory.series.slice(0,3);
  view.narrative={facts:['검증된 종가 비교 사실'],analysis:['사실과 구분한 해석']};view.wallStreetResearch=[];view.sectorsCompanies=[];
  const pdf=buildUSPdfViewModel(view);
  assert.equal(pdf.charts.length,3);assert.deepEqual(pdf.charts[0]!.values,view.marketHistory.series[0]!.closes);
  assert.deepEqual(pdf.sections.find(s=>s.title==='지수별 흐름과 위치')?.items,view.narrative.facts);
  assert.deepEqual(pdf.sections.find(s=>s.title==='MOTUS 분석')?.items,view.narrative.analysis);
  assert.ok(!pdf.sections.some(s=>s.title==='Wall Street Research'));assert.doesNotMatch(JSON.stringify(pdf),/undefined|null.*기관/);
  const html=renderUSEditorialArticle(view).html;
  assert.ok(html.includes('검증된 종가 비교 사실'));assert.ok(html.includes('사실과 구분한 해석'));
  for(const match of html.matchAll(/<desc>(.*?)<\/desc>/g))assert.ok(match[1]!.length<300);
});

test('empty U.S. sector/company coverage cannot be certified by long index prose',()=>{
  const unit=structuredClone(createFirstSplitDailyProductionRun().units.find(u=>u.category==='US_MARKET')!);
  (unit.viewModel as USMarketDailyViewModel).sectorsCompanies=[];
  const result=buildProductionVerification({schemaVersion:'1.0',session:{state:'COMPLETED',observedDate:unit.observedDate,completedAt:'2026-10-01T00:00:00Z'},unit},'internal',[],'2026-10-01T00:00:00Z');
  assert.equal(result.verification,'REVIEW_REQUIRED');assert.equal(result.editorialQualityPass,false);assert.ok(result.unresolvedConflicts.includes('editorial quality: US sector/company evidence missing'));
});

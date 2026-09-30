import assert from 'node:assert/strict';
import test from 'node:test';
import { createApprovedSplitDraft,createFirstSplitDailyProductionRun,recordSplitHumanReview,type SplitDraftAdapter } from '../src/intelligence/split-daily-production.js';

test('Sprint 4E builds only sufficiently sourced independent publication units',()=>{
  const run=createFirstSplitDailyProductionRun();
  assert.deepEqual(run.selectedDates,{ai:'2026-09-29',us:'2026-09-30',korea:'2026-09-30'});
  assert.equal(run.units.length,3);
  assert.ok(run.units.every(unit=>unit.readiness==='READY'&&unit.review.state==='PENDING'&&unit.draftPostId===null));
  assert.deepEqual(run.units.map(unit=>unit.label),['AI Intelligence','U.S. Market','Korea Market']);
  assert.deepEqual(run.externalActions,{bloggerInsertCount:0,publishCount:0});
});

test('Sprint 4E US unit has four actual five-session line charts without index card duplication',()=>{
  const us=createFirstSplitDailyProductionRun().units.find(unit=>unit.category==='US_MARKET')!;
  const html=us.render.html;
  assert.equal((html.match(/<svg\b/g)??[]).length,4);
  assert.equal((html.match(/<svg class="index-line-chart"/g)??[]).length,4);
  for(const value of ['7,651.54','26,861.06','50,906.05','2,796.86'])assert.match(html,new RegExp(value.replaceAll(',','[,]')));
  assert.doesNotMatch(html,/시장 한눈에 보기[\s\S]*(?:S&amp;P 500|Nasdaq|Dow Jones|Russell 2000)[\s\S]*주요지수 추이/);
  assert.match(html,/VIX/);assert.match(html,/5\.29%/);assert.match(html,/100\.95/);assert.match(html,/\$98\.03/);
  const view=us.viewModel as {marketHistory:{series:{dates:string[];provenance:unknown[]}[]}};
  assert.ok(view.marketHistory.series.every(series=>series.dates.length===5&&series.provenance.length===5));
});

test('Sprint 4E uses red for positive and blue for negative, mobile-safe inline output and no internal leakage',()=>{
  for(const unit of createFirstSplitDailyProductionRun().units){
    assert.match(unit.render.html,/max-width:100%/);assert.doesNotMatch(unit.render.html,/<script\b|<iframe\b|\b(?:intelligenceId|researchId|factId|eventId|themeId|verificationStatus)\b/i);
    assert.match(unit.render.html,/<a href="https?:\/\//);assert.doesNotMatch(unit.render.html,/data\/fixtures|fixture-manual/i);
  }
  const combined=createFirstSplitDailyProductionRun().units.map(unit=>unit.render.html).join('');
  assert.match(combined,/#c62828/);assert.match(combined,/#1565c0/);
});

test('Sprint 4E Korea unit omits fake history and keeps market facts and research',()=>{
  const korea=createFirstSplitDailyProductionRun().units.find(unit=>unit.category==='KOREA_MARKET')!;
  assert.equal('marketHistory' in korea.viewModel,false);
  for(const value of ['6,838.04','855.91','1,352.8원','외국인','기관','개인','국내 증권사 리서치'])assert.match(korea.render.html,new RegExp(value));
});

test('Sprint 4E blocks Blogger writes before independent Human Review approval and dedupes approved drafts',async()=>{
  const source=createFirstSplitDailyProductionRun().units[0]!;let inserts=0;let lookups=0;
  const adapter:SplitDraftAdapter={async findExistingDraft(){lookups++;return null;},async insertDraft(){inserts++;return {postId:'remote-draft-1',state:'DRAFT'};}};
  await assert.rejects(()=>createApprovedSplitDraft(source,adapter),/APPROVED required/);assert.equal(inserts,0);assert.equal(lookups,0);
  const approved=recordSplitHumanReview(source,'APPROVED','human','출처와 공개 문구 확인','2026-10-01T10:00:00+09:00');
  const created=await createApprovedSplitDraft(approved,adapter);assert.equal(created.draftPostId,'remote-draft-1');assert.equal(inserts,1);assert.equal(created.publicPostUrl,null);
  const duplicateAdapter:SplitDraftAdapter={async findExistingDraft(){return {postId:'existing-draft'};},async insertDraft(){throw new Error('must not insert');}};
  const existing=await createApprovedSplitDraft(approved,duplicateAdapter);assert.equal(existing.draftPostId,'existing-draft');assert.equal(existing.duplicateCount,1);
});

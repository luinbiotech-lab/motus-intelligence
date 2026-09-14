import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ClaimDraft } from '../src/services/cross-verification.js';
import type { ClaimRecord, ClaimSource, ConflictRecord, EvidencePackage, FilingRecord, GeoVerificationContext, InputBundle, MacroRelease, MarketSnapshot, ReviewActionInput, Rule, Source, Status, VerificationTier } from '../src/domain/models.js';
import { runPipeline, configurationErrors } from '../src/services/pipeline.js';
import { marketChange, roundPercent } from '../src/utils/calculations.js';
import { schemaErrors, inputSchema } from '../src/data/schemas.js';
import { BlsCpiAdapter, SecEdgarAdapter, TreasuryYieldAdapter, UnconnectedAdapter } from '../src/data/adapters.js';
import { verifyClaims } from '../src/services/cross-verification.js';
import { applyReviewActions, buildMachineHumanDiff, buildPublishReadyDraft, buildReviewQueue, buildReviewSheet, createReviewAction, evaluateApprovalGate, initialApprovalStatus, transitionApprovalStatus } from '../src/services/review.js';
import { generateReport } from '../src/services/report.js';
import { buildDynamicTerms, decideContentOpportunities, renderBrokerageReportOnDemand, renderDailyEditorial } from '../src/services/editorial.js';
const read=(p:string):unknown=>JSON.parse(readFileSync(p,'utf8'));
const fixture=()=>structuredClone(read('data/fixtures/sample-day.json') as InputBundle);
const realFixture=()=>structuredClone(read('data/manual/2026-09-11/input.json') as InputBundle);
const sources=read('config/sources.json') as Source[];
const rules=read('config/us-korea-rules.v1.json') as Rule[];
const run=(input:unknown,registry=sources,ruleSet=rules)=>runPipeline(input,registry,ruleSet,'2000-01-03T21:20:00Z');
const runReal=(input:unknown,registry=sources,ruleSet=rules)=>runPipeline(input,registry,ruleSet,'2026-09-13T05:17:44Z');
const has=(input:InputBundle,status:Status)=>assert.ok(run(input).evidence.validationResult.issues.some(i=>i.status===status),status);
test('normal sample E2E: validation → impact → 9-section draft → linked evidence',()=>{
  const input=fixture();const original=JSON.stringify(input);const result=run(input);
  assert.equal(result.operationalStatus,'PASS');assert.equal(result.evidence.validationResult.status,'OK');
  assert.equal(result.report.sections.length,9);assert.equal(result.evidence.impactJudgments.length,1);
  assert.equal(result.evidence.impactJudgments[0]!.evidenceLevel,'A');assert.equal(result.evidence.impactJudgments[0]!.impactStrength,5);
  assert.equal(result.evidence.reportId,result.report.reportId);assert.equal(result.evidence.records.length,5);
  assert.equal(result.stages.length,11);assert.ok(result.stages.every(s=>s.status==='OK'));
  assert.match(result.markdown,/SAMPLE/);assert.equal(result.evidence.publishStatus,'BLOCKED');assert.equal(result.report.publishedAt,null);
  assert.equal(JSON.stringify(input),original);assert.deepEqual(result,run(input));
  for(const section of result.report.sections) for(const item of section.items) for(const id of item.evidenceIds) assert.ok(result.evidence.records.some(r=>r.evidenceId===id&&r.usedInSections.includes(section.id)));
});
test('missing value → NO_DATA; missing reason required',()=>{const input=fixture();input.market[0]!.close=null;input.market[0]!.missingReasons.close='수동 입력 누락';has(input,'NO_DATA');assert.equal(run(input).report.sections[2]!.items[0]!.evidenceIds.length,0);delete input.market[0]!.missingReasons.close;has(input,'INVALID_VALUE');});
test('source missing → SOURCE_UNAVAILABLE',()=>{const input=fixture();input.market[0]!.sourceId='MISSING';has(input,'SOURCE_UNAVAILABLE');});
test('duplicate → REVIEW_REQUIRED; duplicate excluded',()=>{const input=fixture();input.market.push({...input.market[0]!,id:'DUPLICATE'});has(input,'REVIEW_REQUIRED');assert.ok(run(input).evidence.validationResult.excludedIds.includes('DUPLICATE'));});
test('conflicting value → CONFLICT; both excluded',()=>{const input=fixture();input.market.push({...input.market[0]!,id:'CONFLICT',close:120,change:20,changePct:20});has(input,'CONFLICT');assert.ok(run(input).evidence.validationResult.excludedIds.includes('SAMPLE-MARKET-1'));assert.equal(run(input).report.sections[2]!.items[0]!.evidenceIds.length,0);});
test('previousClose=0 → INVALID_VALUE, no infinity',()=>{const input=fixture();input.market[0]!.previousClose=0;has(input,'INVALID_VALUE');assert.deepEqual(marketChange(1,0),{status:'INVALID_VALUE'});});
test('delayed source → DELAYED',()=>{const input=fixture();input.asOf='2000-01-05T21:15:00Z';has(input,'DELAYED');});
test('low confidence → LOW_CONFIDENCE and HOLD',()=>{const input=fixture();input.signals[0]!.evidenceIds=['MISSING'];const result=run(input);assert.equal(result.evidence.impactJudgments[0]!.status,'LOW_CONFIDENCE');assert.equal(result.evidence.impactJudgments[0]!.impactDirection,'HOLD');assert.equal(result.evidence.impactJudgments[0]!.impactStrength,1);assert.equal(result.operationalStatus,'REVIEW_REQUIRED');});
test('holiday → HOLIDAY; no impacts',()=>{const input=fixture();input.session.status='HOLIDAY';input.market=[];has(input,'HOLIDAY');assert.equal(run(input).evidence.impactJudgments.length,0);assert.equal(run(input).operationalStatus,'PASS');});
test('early close → EARLY_CLOSE with supplied close time',()=>{const input=fixture();input.session.status='EARLY_CLOSE';input.session.closeAt='2000-01-03T18:00:00Z';input.market[0]!.observedAt=input.session.closeAt;has(input,'EARLY_CLOSE');assert.equal(run(input).operationalStatus,'PASS');});
test('calculation and fixed signed rounding',()=>{assert.equal(roundPercent(1.005),1.01);assert.equal(roundPercent(-1.005),-1.01);assert.equal(marketChange(Infinity,1).status,'INVALID_VALUE');const c=marketChange(2,3);assert.equal(c.status,'OK');if(c.status==='OK') assert.equal(c.display.changePct,-33.33);});
test('changePct mismatch → CONFLICT',()=>{const input=fixture();input.market[0]!.changePct=9;has(input,'CONFLICT');});
test('currency, unit, dates and numeric type rejected',()=>{for(const [field,value] of [['currency','ZZZ'],['unit','kg'],['tradingDate','2000-02-30'],['close','110'],['observedAt','2000-01-03 21:00']]) {const input=fixture();Object.assign(input.market[0]!,{[field as string]:value});has(input,'INVALID_VALUE');}});
test('malformed individual records preserved, valid peers still render',()=>{const input=fixture();(input.market as unknown[]).push(null,{id:'bad'});const result=run(input);assert.equal(result.operationalStatus,'FAILED');assert.equal(result.evidence.records.length,7);assert.ok(result.report.sections[2]!.items[0]!.text.includes('SAMPLE_INDEX'));});
test('malformed envelope → BLOCKED and evidence retains raw input',()=>{for(const raw of [null,{},[],{...fixture(),asOf:'invalid'}]) {const result=run(raw);assert.equal(result.operationalStatus,'BLOCKED');assert.deepEqual(result.evidence.originalInput,raw);assert.equal(result.report.tradingDate,'INVALID_INPUT');}});
test('sample/real mixture blocks the whole run',()=>{const input=fixture();input.market[0]!.sample=false;has(input,'BLOCKED');assert.ok(run(input).evidence.validationResult.excludedIds.includes(input.market[0]!.id));assert.equal(run(input).operationalStatus,'BLOCKED');});
test('unofficial source → LOW_CONFIDENCE',()=>{const registry=structuredClone(sources);registry.find(s=>s.sourceId==='SAMPLE_A')!.official=false;const result=run(fixture(),registry);assert.ok(result.evidence.validationResult.issues.some(i=>i.status==='LOW_CONFIDENCE'));});
test('unconnected adapter never fabricates records',async()=>{const result=await new UnconnectedAdapter().collect(sources[0]!);assert.equal(result.status,'DATA_NOT_CONNECTED');assert.deepEqual(result.records,[]);});
test('all input statuses preserved',()=>{for(const status of ['NO_DATA','DATA_NOT_CONNECTED','DELAYED','CONFLICT','LOW_CONFIDENCE','REVIEW_REQUIRED','SOURCE_UNAVAILABLE','INVALID_VALUE','BLOCKED'] as Status[]){const input=fixture();input.market[0]!.status=status;has(input,status);}});
test('configuration and runtime schemas',()=>{assert.deepEqual(configurationErrors(sources,rules),[]);assert.deepEqual(schemaErrors(fixture(),inputSchema),[]);const bad=structuredClone(rules);bad[0]!.baseStrength=8;assert.equal(run(fixture(),sources,bad).operationalStatus,'BLOCKED');});
test('missing event never produces unsupported candidate',()=>{const input=fixture();input.signals[0]!.eventId='UNKNOWN';assert.equal(run(input).evidence.impactJudgments.length,0);});
test('duplicate record ID excludes all instances',()=>{const input=fixture();input.companyEvents.push({...input.companyEvents[0]!,summary:'conflict'});assert.equal(run(input).evidence.impactJudgments.length,0);has(input,'CONFLICT');});
test('future observation and mismatched session blocked',()=>{const input=fixture();input.session.closeAt='2000-01-04T21:00:00Z';assert.equal(run(input).operationalStatus,'BLOCKED');});
test('news full text rejected and never persisted',()=>{const input=fixture();Object.assign(input.news[0]!,{fullText:'must not accept article body'});const result=run(input);has(input,'INVALID_VALUE');assert.ok(!JSON.stringify(result).includes('must not accept article body'));assert.deepEqual(result.evidence.redactedFields,['news[0].fullText']);});
test('duplicate signal IDs all excluded',()=>{const input=fixture();input.signals.push(structuredClone(input.signals[0]!));assert.equal(run(input).evidence.impactJudgments.length,0);has(input,'CONFLICT');});
test('mismatched company signal excluded',()=>{const input=fixture();input.signals[0]!.usCompany='OTHER';has(input,'CONFLICT');assert.equal(run(input).evidence.impactJudgments.length,0);});
test('numeric overflow rejected',()=>{assert.equal(marketChange(Number.MAX_VALUE,-Number.MAX_VALUE).status,'INVALID_VALUE');});
test('holiday with malformed market record never crashes',()=>{const input=fixture();input.session.status='HOLIDAY';(input.market as unknown[]).push(null);assert.equal(run(input).operationalStatus,'FAILED');});
test('time rollover 24:00 is invalid',()=>{const input=fixture();input.market[0]!.observedAt='2000-01-03T24:00:00Z';has(input,'INVALID_VALUE');});
test('real envelope rejects synthetic identifiers despite changed source ID',()=>{const input=fixture();input.sample=false;input.session.sourceId='FED';for(const group of [input.market,input.macro,input.companyEvents,input.filings,input.news]) for(const r of group){r.sample=false;r.sourceId='FED';}has(input,'BLOCKED');assert.equal(run(input).operationalStatus,'BLOCKED');});
test('real trading-day fixture loads as manual verified PASS rehearsal',()=>{
  const input=realFixture();const result=runReal(input);
  assert.equal(result.operationalStatus,'PASS');
  assert.equal(result.report.sample,false);
  assert.equal(result.report.sections.length,9);
  assert.equal(result.evidence.impactJudgments.length,2);
  assert.equal(result.evidence.reviewMetrics.measurementStatus,'NOT_MEASURED');
  assert.equal(result.evidence.publishStatus,'BLOCKED');
  assert.ok(result.markdown.includes('SPX: 7656.98 points'));
  assert.ok(!result.markdown.includes('65.279999999999'));
  for(const group of [input.market,input.macro,input.companyEvents,input.filings]) for(const record of group) {
    assert.equal(record.collectionMode,'MANUAL_VERIFIED');
    assert.ok(record.verificationUrls&&record.verificationUrls.length>0);
  }
});
test('real records require MANUAL_VERIFIED or API collection mode',()=>{
  const input=realFixture();
  delete input.market[0]!.collectionMode;
  const result=runReal(input);
  assert.equal(result.operationalStatus,'BLOCKED');
  assert.ok(result.evidence.validationResult.issues.some(i=>i.recordId==='SPX-2026-09-11'&&i.field==='collectionMode'));
});
test('manual verified records require verification URLs',()=>{
  const input=realFixture();
  input.market[0]!.verificationUrls=[];
  const result=runReal(input);
  assert.equal(result.operationalStatus,'BLOCKED');
  assert.ok(result.evidence.validationResult.issues.some(i=>i.recordId==='SPX-2026-09-11'&&i.field==='verificationUrls'));
});
test('actual sample/real mixture is blocked',()=>{
  const input=realFixture();
  input.market[0]!.sample=true;
  const result=runReal(input);
  assert.equal(result.operationalStatus,'BLOCKED');
  assert.ok(result.evidence.validationResult.excludedIds.includes('SPX-2026-09-11'));
});
test('real evidence traceability links report items, evidence package, and IDs',()=>{
  const result=runReal(realFixture());
  const evidenceIds=new Set(result.evidence.records.map(record=>record.evidenceId));
  assert.equal(result.evidence.reportId,result.report.reportId);
  for(const section of result.report.sections) for(const item of section.items) for(const id of item.evidenceIds) assert.ok(evidenceIds.has(id),id);
  for(const record of result.evidence.records) {
    if(result.report.sections.some(section=>section.items.some(item=>item.evidenceIds.includes(record.evidenceId)))) assert.ok(record.usedInSections.length>0,record.evidenceId);
  }
});
test('unsupported real signal rule is review required and produces no matching impact',()=>{
  const input=realFixture();
  input.signals[0]!.trigger='UNSUPPORTED_TRIGGER';
  const result=runReal(input);
  assert.equal(result.operationalStatus,'REVIEW_REQUIRED');
  assert.ok(result.evidence.validationResult.issues.some(i=>i.recordId==='DRIVER-RATES-2026-09-11'&&i.field==='trigger'));
  assert.equal(result.evidence.impactJudgments.some(c=>c.id.startsWith('DRIVER-RATES-2026-09-11:')),false);
});

const treasurySource=()=>sources.find(s=>s.sourceId==='US_TREASURY')!;
const treasuryOptions={tradingDate:'2026-09-11',observedAt:'2026-09-11T19:30:00Z',collectedAt:'2026-09-11T21:00:00Z',recordIds:{US2Y:'US2Y-2026-09-11',US10Y:'US10Y-2026-09-11'}};
const treasuryCsv='Date,2 Yr,10 Yr\n09/10/2026,4.56,4.95\n09/11/2026,4.63,4.96\n';
test('Treasury adapter normalizes official 2Y and 10Y rows',async()=>{
  const adapter=new TreasuryYieldAdapter(async()=>({ok:true,status:200,text:async()=>treasuryCsv}));
  const result=await adapter.collect(treasurySource(),treasuryOptions);
  assert.equal(result.status,'OK');
  assert.equal(result.records.length,2);
  const records=result.records as MarketSnapshot[];
  assert.deepEqual(records.map(record=>record.symbol),['US2Y','US10Y']);
  assert.equal(records[0]!.collectionMode,'API');
  assert.ok(Math.abs(records[0]!.change!-0.07)<1e-8);
});
test('Treasury adapter reports timeout as source unavailable',async()=>{
  const adapter=new TreasuryYieldAdapter(async()=>{const error=new Error('timeout');error.name='TimeoutError';throw error;});
  const result=await adapter.collect(treasurySource(),treasuryOptions);
  assert.equal(result.status,'SOURCE_UNAVAILABLE');
  assert.match(result.message,/timeout/);
});
test('Treasury adapter handles empty and missing-date responses as no data',async()=>{
  const empty=await new TreasuryYieldAdapter(async()=>({ok:true,status:200,text:async()=>''})).collect(treasurySource(),treasuryOptions);
  const absent=await new TreasuryYieldAdapter(async()=>({ok:true,status:200,text:async()=>treasuryCsv})).collect(treasurySource(),{...treasuryOptions,tradingDate:'2026-09-12'});
  assert.equal(empty.status,'NO_DATA');
  assert.equal(absent.status,'NO_DATA');
});
test('Treasury adapter handles malformed and invalid numeric responses for review',async()=>{
  const malformed=await new TreasuryYieldAdapter(async()=>({ok:true,status:200,text:async()=>'Date,Ten Yr\n09/11/2026,4.96'})).collect(treasurySource(),treasuryOptions);
  const invalid=await new TreasuryYieldAdapter(async()=>({ok:true,status:200,text:async()=>'Date,2 Yr,10 Yr\n09/10/2026,4.56,4.95\n09/11/2026,N/A,4.96'})).collect(treasurySource(),treasuryOptions);
  assert.equal(malformed.status,'REVIEW_REQUIRED');
  assert.equal(invalid.status,'REVIEW_REQUIRED');
});
test('Treasury adapter handles provider unavailable, rate limit, and delayed records',async()=>{
  const unavailable=await new TreasuryYieldAdapter(async()=>({ok:false,status:503,text:async()=>''})).collect(treasurySource(),treasuryOptions);
  const rateLimit=await new TreasuryYieldAdapter(async()=>({ok:false,status:429,text:async()=>''})).collect(treasurySource(),treasuryOptions);
  const delayedSource={...treasurySource(),maxAgeMinutes:1};
  const delayed=await new TreasuryYieldAdapter(async()=>({ok:true,status:200,text:async()=>treasuryCsv})).collect(delayedSource,{...treasuryOptions,collectedAt:'2026-09-13T05:17:44Z'});
  assert.equal(unavailable.status,'SOURCE_UNAVAILABLE');
  assert.equal(rateLimit.status,'REVIEW_REQUIRED');
  assert.equal(delayed.status,'DELAYED');
  assert.equal(delayed.records.length,2);
});
const blsSource=()=>sources.find(s=>s.sourceId==='BLS')!;
const blsOptions={tradingDate:'2026-09-11',observedAt:'2026-09-11T12:30:00Z',collectedAt:'2026-09-11T13:00:00Z',period:'2026-08',releaseTime:'2026-09-11T12:30:00Z',recordId:'CPI-MOM-2026-08'};
const blsJson=(value='318.14')=>JSON.stringify({status:'REQUEST_SUCCEEDED',Results:{series:[{seriesID:'CUSR0000SA0',data:[{year:'2026',period:'M08',value},{year:'2026',period:'M07',value:'316.87'},{year:'2026',period:'M06',value:'316.55'}]}]}});
test('BLS CPI adapter computes official CPI m/m without consensus',async()=>{
  const result=await new BlsCpiAdapter(async()=>({ok:true,status:200,text:async()=>blsJson()})).collect(blsSource(),blsOptions);
  assert.equal(result.status,'OK');
  const record=result.records[0] as MacroRelease;
  assert.equal(record.collectionMode,'API');
  assert.equal(record.consensus,null);
  assert.equal(record.actual,0.4);
  assert.equal(record.previous,0.1);
  assert.ok(record.fieldProvenance?.actual);
});
test('BLS CPI adapter handles missing release, malformed, invalid, timeout, unavailable, revision inputs',async()=>{
  const missing=await new BlsCpiAdapter(async()=>({ok:true,status:200,text:async()=>JSON.stringify({status:'REQUEST_SUCCEEDED',Results:{series:[{data:[]}]}})})).collect(blsSource(),blsOptions);
  const malformed=await new BlsCpiAdapter(async()=>({ok:true,status:200,text:async()=>'{'})).collect(blsSource(),blsOptions);
  const invalid=await new BlsCpiAdapter(async()=>({ok:true,status:200,text:async()=>blsJson('N/A')})).collect(blsSource(),blsOptions);
  const timeout=await new BlsCpiAdapter(async()=>{const error=new Error('timeout');error.name='AbortError';throw error;}).collect(blsSource(),blsOptions);
  const unavailable=await new BlsCpiAdapter(async()=>({ok:false,status:503,text:async()=>''})).collect(blsSource(),blsOptions);
  const revision=await new BlsCpiAdapter(async()=>({ok:true,status:200,text:async()=>blsJson('318.46')})).collect(blsSource(),blsOptions);
  assert.equal(missing.status,'NO_DATA');
  assert.equal(malformed.status,'REVIEW_REQUIRED');
  assert.equal(invalid.status,'REVIEW_REQUIRED');
  assert.equal(timeout.status,'SOURCE_UNAVAILABLE');
  assert.equal(unavailable.status,'SOURCE_UNAVAILABLE');
  assert.equal((revision.records[0] as MacroRelease).actual,0.5);
});
const secSource=()=>sources.find(s=>s.sourceId==='SEC_EDGAR')!;
const secOptions={tradingDate:'2026-09-11',observedAt:'2026-09-10T20:16:50Z',collectedAt:'2026-09-11T13:00:00Z',cik:'1341439',ticker:'ORCL',companyId:'ORACLE',forms:['8-K'],accessionNumber:'0001193125-26-387905',recordId:'ORCL-8K-2026-09-10'};
const secJson=(duplicate=false)=>JSON.stringify({name:'Oracle Corporation',tickers:['ORCL'],filings:{recent:{accessionNumber:duplicate?['0001193125-26-387905','0001193125-26-387905']:['0001193125-26-387905'],form:duplicate?['8-K','8-K']:['8-K'],filingDate:duplicate?['2026-09-10','2026-09-10']:['2026-09-10'],reportDate:duplicate?['2026-08-31','2026-08-31']:['2026-08-31'],primaryDocument:duplicate?['orcl-20260910.htm','orcl-20260910.htm']:['orcl-20260910.htm']}}});
test('SEC EDGAR adapter normalizes filing metadata',async()=>{
  const result=await new SecEdgarAdapter(async()=>({ok:true,status:200,text:async()=>secJson()}),0).collect(secSource(),secOptions);
  assert.equal(result.status,'OK');
  const record=result.records[0] as FilingRecord;
  assert.equal(record.collectionMode,'API');
  assert.equal(record.formType,'8-K');
  assert.equal(record.accessionNumber,'0001193125-26-387905');
  assert.match(record.filingUrl!,/Archives\/edgar\/data\/1341439\/000119312526387905\/orcl-20260910.htm/);
  assert.ok(record.fieldProvenance?.accessionNumber);
});
test('SEC EDGAR adapter handles duplicate, unsupported form, timeout, rate limit, malformed',async()=>{
  const duplicate=await new SecEdgarAdapter(async()=>({ok:true,status:200,text:async()=>secJson(true)}),0).collect(secSource(),{tradingDate:secOptions.tradingDate,observedAt:secOptions.observedAt,collectedAt:secOptions.collectedAt,cik:secOptions.cik,ticker:secOptions.ticker,companyId:secOptions.companyId,forms:secOptions.forms});
  const unsupported=await new SecEdgarAdapter(async()=>({ok:true,status:200,text:async()=>secJson()}),0).collect(secSource(),{...secOptions,forms:['S-1']});
  const timeout=await new SecEdgarAdapter(async()=>{const error=new Error('timeout');error.name='TimeoutError';throw error;},0).collect(secSource(),secOptions);
  const rateLimit=await new SecEdgarAdapter(async()=>({ok:false,status:429,text:async()=>''}),0).collect(secSource(),secOptions);
  const malformed=await new SecEdgarAdapter(async()=>({ok:true,status:200,text:async()=>JSON.stringify({})}),0).collect(secSource(),secOptions);
  assert.equal(duplicate.status,'REVIEW_REQUIRED');
  assert.equal(unsupported.status,'REVIEW_REQUIRED');
  assert.equal(timeout.status,'SOURCE_UNAVAILABLE');
  assert.equal(rateLimit.status,'SOURCE_UNAVAILABLE');
  assert.equal(malformed.status,'REVIEW_REQUIRED');
});
test('field provenance flows into evidence and reportId remains traceable',()=>{
  const input=realFixture();
  input.market[0]!.fieldProvenance={close:{sourceId:'SP_DJI',sourceUrl:input.market[0]!.sourceUrl,observedAt:input.market[0]!.observedAt,collectedAt:input.market[0]!.collectedAt},changePct:{sourceId:'SP_DJI',sourceUrl:input.market[0]!.sourceUrl,observedAt:input.market[0]!.observedAt,collectedAt:input.market[0]!.collectedAt}};
  const result=runReal(input);
  const record=result.evidence.records.find(r=>r.evidenceId==='SPX-2026-09-11')!;
  assert.equal(result.evidence.reportId,result.report.reportId);
  assert.equal(record.fieldProvenance?.close?.sourceId,'SP_DJI');
});
test('golden day manual/API comparison detects no unexpected regression',async()=>{
  const input=realFixture();
  const treasury=await new TreasuryYieldAdapter(async()=>({ok:true,status:200,text:async()=>treasuryCsv})).collect(treasurySource(),treasuryOptions);
  const bls=await new BlsCpiAdapter(async()=>({ok:true,status:200,text:async()=>blsJson()})).collect(blsSource(),blsOptions);
  const sec=await new SecEdgarAdapter(async()=>({ok:true,status:200,text:async()=>secJson()}),0).collect(secSource(),secOptions);
  input.market=input.market.map(record=>treasury.records.find(api=>(api as MarketSnapshot).symbol===record.symbol) as MarketSnapshot ?? record);
  input.macro=input.macro.map(record=>record.id==='CPI-MOM-2026-08'?bls.records[0] as MacroRelease:record);
  input.filings=input.filings.map(record=>record.accessionNumber==='0001193125-26-387905'?sec.records[0] as FilingRecord:record);
  const result=runReal(input);
  assert.equal(result.operationalStatus,'PASS');
  assert.equal(input.market.find(record=>record.symbol==='US2Y')!.collectionMode,'API');
  assert.equal(input.macro.find(record=>record.indicatorId==='CPI_U_MOM')!.collectionMode,'API');
  assert.equal(input.filings[0]!.collectionMode,'API');
});
const claimSource=(sourceId:string,value:string|number|null,evidenceId='E1'):ClaimSource=>({sourceId,sourceUrl:`https://example.com/${sourceId}`,evidenceId,value,observedAt:'2026-09-11T12:30:00Z',collectedAt:'2026-09-11T13:00:00Z'});
const sourceWithTier=(sourceId:string,tier:VerificationTier,official=tier==='A'):Source=>({...sources[0]!,sourceId,official,verificationTier:tier});
const claim=(overrides:Partial<ClaimDraft>={}):ClaimDraft=>({claimId:'CLAIM-1',reportId:'REPORT-1',claimText:'미국 8월 CPI가 전월 대비 0.4% 상승했다.',claimType:'MACRO_FACT',subject:'CPI',predicate:'actual',value:0.4,unit:'percent',eventTime:'2026-09-11T12:30:00Z',evidenceIds:['E1'],supportingSources:[claimSource('BLS',0.4)],marketRelevance:'HIGH',...overrides});
test('claim verification: official fact, two-source verified, insufficient, conflict, rejected',()=>{
  const official=verifyClaims([claim()],sources,'2026-09-13T08:30:11Z').claims[0]!;
  const twoSource=verifyClaims([claim({claimId:'CLAIM-2',supportingSources:[claimSource('BLS',0.4),claimSource('AP',0.4)]})],[...sources,sourceWithTier('AP','B',false)],'2026-09-13T08:30:11Z').claims[0]!;
  const insufficient=verifyClaims([claim({claimId:'CLAIM-3',claimType:'CAUSAL_INTERPRETATION',informationType:'ANALYSIS',supportingSources:[claimSource('AP','CPI caused selloff')]})],[...sources,sourceWithTier('AP','B',false)],'2026-09-13T08:30:11Z').claims[0]!;
  const conflictResult=verifyClaims([claim({claimId:'CLAIM-4',supportingSources:[claimSource('BLS',0.4),claimSource('AP',0.6)]})],[...sources,sourceWithTier('AP','B',false)],'2026-09-13T08:30:11Z');
  const narrative=verifyClaims([claim({claimId:'CLAIM-5',claimType:'CAUSAL_INTERPRETATION',informationType:'ANALYSIS',supportingSources:[claimSource('AP','rates')],contradictingSources:[claimSource('CNBC','oil') as ClaimSource]})],[...sources,sourceWithTier('AP','B',false),sourceWithTier('CNBC','B',false)],'2026-09-13T08:30:11Z');
  const rejected=verifyClaims([claim({claimId:'CLAIM-6',rejected:true})],sources,'2026-09-13T08:30:11Z').claims[0]!;
  assert.equal(official.verificationStatus,'VERIFIED');
  assert.equal(twoSource.verificationStatus,'VERIFIED');
  assert.equal(insufficient.verificationStatus,'INSUFFICIENT_SOURCES');
  assert.equal(conflictResult.claims[0]!.verificationStatus,'CONFLICT');
  assert.equal(conflictResult.conflicts[0]!.conflictType,'NUMERIC_VALUE');
  assert.equal(narrative.claims[0]!.verificationStatus,'CONFLICT');
  assert.equal(narrative.conflicts[0]!.conflictType,'CAUSAL_NARRATIVE');
  assert.equal(rejected.verificationStatus,'REJECTED');
});
test('geopolitical verification requires party balance plus neutral source',()=>{
  const baseGeo:GeoVerificationContext={eventId:'GEO-1',countries:['A','B'],actors:['A government','B government'],region:'Strait',eventType:'ROUTE_BLOCKADE',affectedMarkets:['oil'],affectedCommodities:['Brent'],affectedRoutes:['shipping'],partyASources:[claimSource('PARTY_A','blocked')],partyBSources:[claimSource('PARTY_B','blocked')],neutralSources:[claimSource('UN','confirmed')],officialSources:[],conflictStatus:'UNVERIFIED',unresolvedClaims:[]};
  const geoSources=[...sources,sourceWithTier('PARTY_A','A'),sourceWithTier('PARTY_B','A'),sourceWithTier('UN','A')];
  const verified=verifyClaims([claim({claimId:'GEO-CLAIM-1',claimType:'GEOPOLITICAL_FACT',geopoliticalContext:baseGeo,supportingSources:[claimSource('UN','confirmed')]})],geoSources,'2026-09-13T08:30:11Z').claims[0]!;
  const oneParty=verifyClaims([claim({claimId:'GEO-CLAIM-2',claimType:'GEOPOLITICAL_FACT',geopoliticalContext:{...baseGeo,partyBSources:[],neutralSources:[]},supportingSources:[claimSource('PARTY_A','blocked')]})],geoSources,'2026-09-13T08:30:11Z').claims[0]!;
  const conflicted=verifyClaims([claim({claimId:'GEO-CLAIM-3',claimType:'GEOPOLITICAL_FACT',geopoliticalContext:{...baseGeo,conflictStatus:'CONFLICT'},supportingSources:[claimSource('PARTY_A','blocked')],contradictingSources:[claimSource('PARTY_B','not blocked')]})],geoSources,'2026-09-13T08:30:11Z').claims[0]!;
  assert.equal(verified.verificationStatus,'VERIFIED');
  assert.equal(oneParty.verificationStatus,'REVIEW_REQUIRED');
  assert.equal(conflicted.verificationStatus,'CONFLICT');
});
test('report blocks unverified and conflict claims but allows verified claim with trace',()=>{
  const input=realFixture();
  const unverified=verifyClaims([claim({claimId:'CLAIM-SPX-BAD',claimText:'SPX unverified',evidenceIds:['SPX-2026-09-11'],supportingSources:[]})],sources,'2026-09-13T08:30:11Z').claims[0]!;
  const blockedReport=generateReport(input,{status:'OK',issues:[],excludedIds:[]},[],'REPORT-1','2026-09-13T08:30:11Z',[unverified]);
  assert.equal(blockedReport.sections[2]!.items.some(item=>item.evidenceIds.includes('SPX-2026-09-11')),false);
  const verified=verifyClaims([claim({claimId:'CLAIM-SPX-GOOD',evidenceIds:['SPX-2026-09-11'],supportingSources:[claimSource('SP_DJI',7656.98,'SPX-2026-09-11')]})],sources,'2026-09-13T08:30:11Z').claims[0]!;
  const allowedReport=generateReport(input,{status:'OK',issues:[],excludedIds:[]},[],'REPORT-2','2026-09-13T08:30:11Z',[verified]);
  const item=allowedReport.sections[2]!.items.find(row=>row.evidenceIds.includes('SPX-2026-09-11'))!;
  assert.ok(item.claimIds?.includes('CLAIM-SPX-GOOD'));
});
test('review queue priority and approval state transition block publish before approval',()=>{
  const result=verifyClaims([claim({claimId:'A',supportingSources:[claimSource('BLS',0.4),claimSource('AP',0.6)]}),claim({claimId:'B',supportingSources:[]}),claim({claimId:'C',supportingSources:[claimSource('BLS',0.4)]})],[...sources,sourceWithTier('AP','B',false)],'2026-09-13T08:30:11Z');
  const queue=buildReviewQueue(result.claims,result.conflicts);
  assert.equal(queue[0]!.claimId,'A');
  assert.equal(initialApprovalStatus(false,result.claims,result.conflicts),'REVIEW_REQUIRED');
  assert.equal(transitionApprovalStatus('AUTO_VALIDATED','publish'),'BLOCKED');
  assert.equal(transitionApprovalStatus(transitionApprovalStatus('REVIEW_REQUIRED','approve'),'publish'),'PUBLISHED');
});
test('pipeline creates claim traceability, review queue, and approval status',()=>{
  const result=runReal(realFixture());
  assert.ok(result.evidence.claims!.length>0);
  assert.equal(result.evidence.conflicts!.length,0);
  assert.equal(result.evidence.approvalStatus,'AUTO_VALIDATED');
  const traced=result.report.sections.flatMap(section=>section.items).find(item=>item.claimIds?.length);
  assert.ok(traced);
  const claimId=traced!.claimIds![0]!;
  const claim=result.evidence.claims!.find(item=>item.claimId===claimId)!;
  assert.ok(claim.evidenceIds.some(id=>traced!.evidenceIds.includes(id)));
});
test('BLS adapter distinguishes scheduled/not released data',async()=>{
  const result=await new BlsCpiAdapter(async()=>({ok:true,status:200,text:async()=>blsJson()})).collect(blsSource(),{...blsOptions,collectedAt:'2026-09-11T12:00:00Z'});
  assert.equal(result.status,'NOT_RELEASED');
  assert.equal(result.records.length,0);
});
test('SEC adapter preserves accepted timestamp when available and marks date precision when unavailable',async()=>{
  const accepted=await new SecEdgarAdapter(async()=>({ok:true,status:200,text:async()=>secJson()}),0).collect(secSource(),{...secOptions,acceptedAt:'2026-09-10T20:16:50Z'});
  const dateOnly=await new SecEdgarAdapter(async()=>({ok:true,status:200,text:async()=>secJson()}),0).collect(secSource(),secOptions);
  assert.equal((accepted.records[0] as FilingRecord).timestampPrecision,'ACCEPTED_TIMESTAMP');
  assert.equal((accepted.records[0] as FilingRecord).filedAt,'2026-09-10T20:16:50Z');
  assert.equal((dateOnly.records[0] as FilingRecord).timestampPrecision,'DATE');
});

const actionInput=(evidence:EvidencePackage,claimId:string,action:ReviewActionInput['action'],overrides:Partial<ReviewActionInput>={}):ReviewActionInput=>({
  reportId:evidence.reportId,
  claimId,
  action,
  category:'WORDING',
  note:`${action} note`,
  reviewer:'human',
  reviewedAt:'2026-09-13T05:30:00Z',
  ...overrides
});
const evidenceWithClaims=(claims:ClaimRecord[],conflicts:ConflictRecord[]=[])=>{
  const base=runReal(realFixture()).evidence;
  return {...base,claims,conflicts,reviewQueue:buildReviewQueue(claims,conflicts),approvalStatus:initialApprovalStatus(false,claims,conflicts)} as EvidencePackage;
};
test('Sprint 2D review sheet summarizes counts and prioritizes problem items',()=>{
  const verified=verifyClaims([claim({claimId:'VERIFIED-1'}),claim({claimId:'UNVERIFIED-1',supportingSources:[],unresolvedSources:[claimSource('AP','not confirmed')]}),claim({claimId:'PARTIAL-1',claimType:'CAUSAL_INTERPRETATION',informationType:'ANALYSIS',supportingSources:[claimSource('AP','rates'),claimSource('CNBC','rates')]})],[...sources,sourceWithTier('AP','B',false),sourceWithTier('CNBC','B',false)],'2026-09-13T08:30:11Z').claims;
  const conflictResult=verifyClaims([claim({claimId:'CONFLICT-1',supportingSources:[claimSource('BLS',0.4),claimSource('AP',0.6)]})],[...sources,sourceWithTier('AP','B',false)],'2026-09-13T08:30:11Z');
  conflictResult.conflicts[0]!.materiality='CRITICAL';
  const evidence=evidenceWithClaims([...verified,...conflictResult.claims],conflictResult.conflicts);
  const sheet=buildReviewSheet(evidence);
  assert.equal(sheet.reportId,evidence.reportId);
  assert.equal(sheet.counts.VERIFIED,1);
  assert.equal(sheet.counts.UNVERIFIED,1);
  assert.equal(sheet.counts.CONFLICT,1);
  assert.ok(sheet.counts.REVIEW_REQUIRED_QUEUE>=2);
  assert.equal(sheet.items[0]!.claimId,'CONFLICT-1');
  assert.equal(sheet.items[0]!.recommendedAction,'CHECK_SOURCE');
  assert.equal(sheet.verifiedSummary.count,1);
});
test('Sprint 2D manual APPROVE, MODIFY, REJECT, HOLD actions validate and preserve audit trail',()=>{
  const result=runReal(realFixture());
  const claimId=result.evidence.claims![0]!.claimId;
  const approve=createReviewAction(result.evidence,actionInput(result.evidence,claimId,'APPROVE'));
  const modify=createReviewAction(result.evidence,actionInput(result.evidence,claimId,'MODIFY',{modifiedText:'수정된 검수 문장',category:'CAUSAL_INTERPRETATION'}));
  const reject=createReviewAction(result.evidence,actionInput(result.evidence,claimId,'REJECT',{category:'SOURCE_ERROR'}));
  const hold=createReviewAction(result.evidence,actionInput(result.evidence,claimId,'HOLD',{category:'OTHER'}));
  assert.equal(approve.originalText,result.evidence.claims![0]!.claimText);
  assert.equal(modify.modifiedText,'수정된 검수 문장');
  assert.equal(reject.finalDecision,'REJECTED_BY_REVIEWER');
  assert.equal(hold.finalDecision,'HELD_FOR_FOLLOW_UP');
  assert.equal(approve.originalVerificationStatus,result.evidence.claims![0]!.verificationStatus);
});
test('Sprint 2D invalid claimId and reportId mismatch are rejected',()=>{
  const result=runReal(realFixture());
  const claimId=result.evidence.claims![0]!.claimId;
  assert.throws(()=>createReviewAction(result.evidence,actionInput(result.evidence,'NOPE','APPROVE')),/invalid claimId/);
  assert.throws(()=>createReviewAction(result.evidence,{...actionInput(result.evidence,claimId,'APPROVE'),reportId:'OTHER'}),/reportId mismatch/);
  assert.throws(()=>createReviewAction(result.evidence,actionInput(result.evidence,claimId,'MODIFY')),/MODIFY requires modifiedText/);
});
test('Sprint 2D approval gate blocks unresolved critical and high conflicts',()=>{
  const high=verifyClaims([claim({claimId:'HIGH-CONFLICT',claimType:'CAUSAL_INTERPRETATION',informationType:'ANALYSIS',supportingSources:[claimSource('AP','rates')],contradictingSources:[claimSource('CNBC','oil')]})],[...sources,sourceWithTier('AP','B',false),sourceWithTier('CNBC','B',false)],'2026-09-13T08:30:11Z');
  const evidence=evidenceWithClaims(high.claims,high.conflicts);
  evidence.conflicts![0]!.materiality='HIGH';
  assert.equal(evaluateApprovalGate(evidence,[]),'REVIEW_REQUIRED');
  evidence.conflicts![0]!.materiality='CRITICAL';
  assert.equal(evaluateApprovalGate(evidence,[]),'REVIEW_REQUIRED');
});
test('Sprint 2D human override keeps original conflict and records reason',()=>{
  const conflictResult=verifyClaims([claim({claimId:'OVERRIDE-CONFLICT',supportingSources:[claimSource('BLS',0.4),claimSource('AP',0.6)]})],[...sources,sourceWithTier('AP','B',false)],'2026-09-13T08:30:11Z');
  const evidence=evidenceWithClaims(conflictResult.claims,conflictResult.conflicts);
  evidence.conflicts![0]!.materiality='LOW';
  const action=createReviewAction(evidence,actionInput(evidence,'OVERRIDE-CONFLICT','APPROVE',{note:'양측 수치가 달라 확정 대신 엇갈린다고 표현',category:'WORDING'}));
  const reviewed=applyReviewActions(evidence,[action]);
  assert.equal(action.overrideReason,'양측 수치가 달라 확정 대신 엇갈린다고 표현');
  assert.equal(reviewed.conflicts!.length,1);
  assert.equal(reviewed.reviewMetrics.claimsApproved,1);
});
test('Sprint 2D publish-ready draft, machine/human diff, metrics, traceability',()=>{
  const result=runReal(realFixture());
  const traced=result.report.sections.flatMap(section=>section.items).find(item=>item.claimIds?.length)!;
  const claimId=traced.claimIds![0]!;
  const action=createReviewAction(result.evidence,actionInput(result.evidence,claimId,'MODIFY',{modifiedText:'검수자가 인과 표현을 완화한 최종 문장',category:'CAUSAL_INTERPRETATION',reviewedAt:'2026-09-13T05:40:00Z'}));
  const reviewed=applyReviewActions(result.evidence,[action]);
  const draft=buildPublishReadyDraft(result.report,reviewed,[action]);
  const diff=buildMachineHumanDiff(result.report,draft,[action]);
  assert.equal(reviewed.reviewMetrics.measurementStatus,'MEASURED');
  assert.equal(reviewed.reviewMetrics.claimsReviewed,1);
  assert.equal(reviewed.reviewMetrics.claimsModified,1);
  assert.equal(diff.changedClaims.includes(claimId),true);
  assert.equal(diff.editCategories.includes('CAUSAL_INTERPRETATION'),true);
  assert.match(draft.markdown,/검수자가 인과 표현을 완화한 최종 문장/);
  const trace=draft.traceability.find(item=>item.claimIds.includes(claimId))!;
  assert.ok(trace.evidenceIds.length);
  assert.ok(trace.sourceIds.length);
});
test('Sprint 2D review metrics remain NOT_MEASURED without human actions',()=>{
  const result=runReal(realFixture());
  const reviewed=applyReviewActions(result.evidence,[]);
  assert.equal(reviewed.reviewMetrics.measurementStatus,'NOT_MEASURED');
  assert.equal(reviewed.reviewMetrics.reviewDurationSeconds,null);
});
test('Sprint 2E daily editorial renderer hides internal status and keeps public Korean prose',()=>{
  const result=runReal(realFixture());
  const editorial=renderDailyEditorial(result.report,result.evidence);
  assert.match(editorial.bloggerMarkdown,/미국시장 마감/);
  assert.match(editorial.bloggerMarkdown,/한국시장 영향/);
  assert.doesNotMatch(editorial.bloggerMarkdown,/CLAIM-|MANUAL-2026|AUTO_VALIDATED|REVIEW_REQUIRED|BLOCKED|DATA_NOT_CONNECTED/);
  assert.equal(editorial.seo.hashtags.includes('#미국증시'),true);
  assert.ok(editorial.naver.intro.length>40);
  assert.ok(editorial.naver.hashtags.length>=3);
});
test('Sprint 2E opportunity engine recommends B C D only when data supports them',()=>{
  const result=runReal(realFixture());
  const editorial=renderDailyEditorial(result.report,result.evidence);
  const decisions=editorial.opportunities;
  assert.equal(decisions.length,3);
  assert.equal(decisions.find(item=>item.contentType==='C_EVERGREEN')!.recommended,true);
  assert.equal(decisions.find(item=>item.contentType==='D_COMPANY_INDUSTRY')!.recommended,true);
  const quietEvidence={...result.evidence,impactJudgments:[],originalInput:{...realFixture(),market:realFixture().market.map(item=>({...item,changePct:0.1})),news:[],companyEvents:[],filings:[],signals:[]}} as EvidencePackage;
  const quiet=decideContentOpportunities(result.report,quietEvidence,'시장 요약',[]);
  assert.equal(quiet.find(item=>item.contentType==='B_EVENT')!.recommended,false);
  assert.equal(quiet.find(item=>item.contentType==='D_COMPANY_INDUSTRY')!.recommended,false);
});
test('Sprint 2E dynamic glossary uses only terms present in body and keeps evergreen keys',()=>{
  const terms=buildDynamicTerms('S&P 500과 나스닥, VIX, 미국 국채금리, 달러가 함께 움직였다.');
  assert.ok(terms.length>=3);
  assert.ok(terms.length<=8);
  for(const term of terms) {
    assert.ok(term.evergreenKey.startsWith('term-'));
    assert.match(term.explanation,/입니다|말합니다|뜻합니다/);
  }
  assert.equal(terms.some(item=>item.term==='WTI'),false);
});
test('Sprint 2E on-demand A4 brokerage report is cached by reportId and renderer version',async()=>{
  const result=runReal(realFixture());
  const dir=mkdtempSync(join(tmpdir(),'brokerage-'));
  const first=await renderBrokerageReportOnDemand(result.report,result.evidence,dir);
  const second=await renderBrokerageReportOnDemand(result.report,result.evidence,dir);
  assert.equal(first.cached,false);
  assert.equal(second.cached,true);
  assert.equal(first.markdown,second.markdown);
  assert.equal(first.naver.intro,second.naver.intro);
  assert.doesNotMatch(second.naver.intro,/ OK|REVIEW_REQUIRED|BLOCKED/);
  assert.match(first.markdown,/내부용 A4 브로커리지 요약/);
  assert.ok(first.naver.hashtags.includes('#미국증시'));
});

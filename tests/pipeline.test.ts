import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ClaimDraft } from '../src/services/cross-verification.js';
import type { ClaimRecord, ClaimSource, ConflictRecord, EvidencePackage, FilingRecord, GeoVerificationContext, InputBundle, MacroRelease, MarketSnapshot, ReportRecord, ReviewActionInput, Rule, Source, Status, VerificationTier } from '../src/domain/models.js';
import { runPipeline, configurationErrors } from '../src/services/pipeline.js';
import { marketChange, roundPercent } from '../src/utils/calculations.js';
import { schemaErrors, inputSchema } from '../src/data/schemas.js';
import { BlsCpiAdapter, SecEdgarAdapter, TreasuryYieldAdapter, UnconnectedAdapter } from '../src/data/adapters.js';
import { verifyClaims } from '../src/services/cross-verification.js';
import { applyReviewActions, buildMachineHumanDiff, buildPublishReadyDraft, buildReviewQueue, buildReviewSheet, createReviewAction, evaluateApprovalGate, initialApprovalStatus, transitionApprovalStatus } from '../src/services/review.js';
import { generateReport } from '../src/services/report.js';
import { buildDynamicTerms, decideContentOpportunities, renderBrokerageReportOnDemand, renderDailyEditorial } from '../src/services/editorial.js';
import { renderA4MasterOnDemand } from '../src/services/a4-visual.js';
import { publicCanRenderA4 } from '../src/services/admin.js';
import { approveBloggerPublication, assertPublicBloggerHtmlSafe, ConfiguredBloggerAdapter, createBloggerPreview, DryRunBloggerAdapter, GoogleBloggerApiAdapter, publishBloggerPublication, renderPublishingConsole, resolveBloggerUrl, type BloggerPublicationRecord, type BloggerPublishingConfig } from '../src/services/blogger.js';
import { BLOGGER_OAUTH_SCOPE, BLOGGER_TOKEN_ENDPOINT, buildBloggerAuthorizationUrl, exchangeAuthorizationCode, readBloggerOAuthEnvironment, runBloggerOAuthBootstrap, testRefreshTokenImmediately } from '../src/services/blogger-oauth.js';
import { renderMotusBloggerContent } from '../src/publishers/motus.js';
import { updateExistingBloggerDraft } from '../src/services/blogger-draft-update.js';
import { buildEditorialReviewCandidate, type EditorialReviewPlan } from '../src/services/editorial-review.js';
import { buildFiveSessionMajorIndexHistory } from '../src/services/market-history.js';
const read=(p:string):unknown=>JSON.parse(readFileSync(p,'utf8'));
const fixture=()=>structuredClone(read('data/fixtures/sample-day.json') as InputBundle);
const realFixture=()=>structuredClone(read('data/manual/2026-09-11/input.json') as InputBundle);
const latestCompletedFixture=()=>structuredClone(read('data/manual/2026-09-15/input.json') as InputBundle);
const sources=read('config/sources.json') as Source[];
const rules=read('config/us-korea-rules.v1.json') as Rule[];
const publishingConfig=(read('config/publishing.json') as {blogger:BloggerPublishingConfig}).blogger;
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
  assert.match(editorial.bloggerMarkdown,/## 핵심 요약/);
  assert.match(editorial.bloggerMarkdown,/## 시장 한눈에 보기/);
  assert.match(editorial.bloggerMarkdown,/## 한국시장 연결 포인트/);
  assert.doesNotMatch(editorial.bloggerMarkdown,/^# /m);
  assert.doesNotMatch(editorial.bloggerMarkdown,/CLAIM-|MANUAL-2026|AUTO_VALIDATED|REVIEW_REQUIRED|BLOCKED|DATA_NOT_CONNECTED/);
  assert.equal(editorial.seo.hashtags.includes('#미국증시'),true);
  assert.ok(editorial.seo.hashtags.length>=8&&editorial.seo.hashtags.length<=12);
  assert.equal(editorial.seo.hashtags.some(tag=>/#\d{8}/.test(tag)),false);
  assert.ok(editorial.naver.intro.length>40);
  assert.ok(editorial.naver.hashtags.length>=3);
});
test('Sprint 2E opportunity engine recommends B C D only when data supports them',()=>{
  const result=runReal(realFixture());
  const editorial=renderDailyEditorial(result.report,result.evidence);
  const decisions=editorial.opportunities;
  assert.equal(decisions.length,3);
  assert.ok(decisions.every(item=>typeof item.score==='number'));
  assert.ok(decisions.filter(item=>item.recommended).length<=2);
  assert.equal(decisions.every(item=>item.recommended),false);
  const quietEvidence={...result.evidence,impactJudgments:[],originalInput:{...realFixture(),market:realFixture().market.map(item=>({...item,changePct:0.1})),news:[],companyEvents:[],filings:[],signals:[]}} as EvidencePackage;
  const quiet=decideContentOpportunities(result.report,quietEvidence,'시장 요약',[]);
  assert.equal(quiet.find(item=>item.contentType==='B_EVENT')!.recommended,false);
  assert.equal(quiet.find(item=>item.contentType==='D_COMPANY_INDUSTRY')!.recommended,false);
});
test('Sprint 2E dynamic glossary uses only terms present in body and keeps evergreen keys',()=>{
  const terms=buildDynamicTerms('VIX와 DXY, WTI, CAPEX, CPI, Consensus, 미국 국채금리가 함께 움직였다.');
  assert.ok(terms.length>=3);
  assert.ok(terms.length<=6);
  for(const term of terms) {
    assert.ok(term.evergreenKey.startsWith('term-'));
    assert.doesNotMatch(term.explanation,/입니다|합니다|말합니다|뜻합니다/);
  }
  assert.equal(terms.find(item=>item.term==='CAPEX')?.explanation,'자본적 지출·설비투자');
  assert.equal(terms.some(item=>item.term==='VIX'),true);
  assert.equal(terms.some(item=>item.term==='DXY'),true);
  assert.equal(buildDynamicTerms('달러와 나스닥만 언급됐다.').some(item=>item.term==='나스닥'||item.term==='달러'),false);
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
test('Sprint 2F A4 MASTER renders one-page HTML PDF PNG and complete Naver package',async()=>{
  const result=runReal(realFixture());
  const dir=mkdtempSync(join(tmpdir(),'a4-master-'));
  const preview=createBloggerPreview(result.report,result.evidence,publishingConfig);
  const first=await renderA4MasterOnDemand(result.report,result.evidence,dir,{audience:'admin',action:'A4_REPORT_RENDER'},{regenerate:true,bloggerRecord:preview,publishingConfig});
  const second=await renderA4MasterOnDemand(result.report,result.evidence,dir,{audience:'admin',action:'A4_REPORT_RENDER'});
  assert.equal(first.cached,false);
  assert.equal(second.cached,true);
  assert.equal(first.layout.onePage,true);
  assert.equal(first.layout.overflow,false);
  assert.match(readFileSync(first.htmlPath,'utf8'),/data-qr-target=""/);
  assert.match(readFileSync(first.htmlPath,'utf8'),/전체 분석은 MOTUS에서 확인하세요/);
  assert.doesNotMatch(readFileSync(first.htmlPath,'utf8'),/blog\.example\.com/);
  assert.equal(readFileSync(first.pdfPath).subarray(0,4).toString(),'%PDF');
  assert.deepEqual([...readFileSync(first.pngPath).subarray(0,8)],[137,80,78,71,13,10,26,10]);
  const naver=JSON.parse(readFileSync(first.naverPackagePath,'utf8')) as Record<string,string|string[]>;
  for(const key of ['title','intro','hashtags','googleBloggerUrl','reportImagePath','reportPdfPath']) assert.ok(Object.hasOwn(naver,key),key);
  assert.equal(naver.googleBloggerUrl,first.layout.qrTargetUrl);
});
test('Sprint 2F admin boundary blocks public A4 generation',async()=>{
  const result=runReal(realFixture());
  const dir=mkdtempSync(join(tmpdir(),'a4-admin-'));
  assert.equal(publicCanRenderA4({audience:'public',action:'A4_REPORT_RENDER'}),false);
  await assert.rejects(()=>renderA4MasterOnDemand(result.report,result.evidence,dir,{audience:'public',action:'A4_REPORT_RENDER'}),/admin authorization required/);
});

test('Sprint 2G Blogger preview preserves SEO, glossary, labels, sources and hides internals',()=>{
  const result=runReal(realFixture());
  const preview=createBloggerPreview(result.report,result.evidence,publishingConfig);
  assert.equal(preview.status,'PREVIEW_READY');
  assert.equal(preview.previewUrl,'https://preview.local/motus/daily-market-2026-09-11');
  assert.match(preview.title,/^미국 증시 마감:/);
  assert.doesNotMatch(preview.title,/MOTUS Daily Market/);
  assert.equal(preview.draftPostId,null);
  assert.equal(preview.publicPostUrl,null);
  assert.ok(preview.labels.includes('미국증시'));
  assert.ok(preview.hashtags.includes('#미국증시'));
  assert.equal(preview.metadata.brand,'MOTUS');
  assert.equal(preview.metadata.displayName,'MOTUS | What Moves the World');
  assert.equal(preview.metadata.primaryCategory,'Daily Market');
  assert.ok(preview.labels.includes('Daily Market'));
  assert.ok(preview.metadata.companies.includes('ORCL'));
  assert.ok(preview.metadata.sectors.includes('AI / Data Center'));
  assert.ok(preview.metadata.countries.includes('United States'));
  assert.ok(preview.metadata.regions.includes('Asia'));
  assert.ok(preview.glossary.length>=3);
  assert.ok(preview.glossary.length<=6);
  assert.match(preview.html,/<meta name="description"/);
  assert.doesNotMatch(preview.html,/<h1>|MOTUS \| What Moves the WorldDaily Market/);
  assert.match(preview.html,/<h2\b[^>]*>핵심 요약<\/h2>/);
  assert.match(preview.html,/<div class="market-dashboard"/);
  assert.match(preview.html,/용어설명/);
  assert.doesNotMatch(preview.html,/<section class="related">/);
  assert.match(preview.html,/<h2\b[^>]*>주요 출처<\/h2>/);
  assert.doesNotMatch(preview.html,/자료 링크 \d|>https?:\/\//);
  assertPublicBloggerHtmlSafe(preview.html);
  assert.doesNotMatch(preview.html,/CLAIM-|AUTO_VALIDATED|confidenceScore|verificationStatus|\/admin\/blogger/);
});
test('Golden Day editorial preview uses opening prose, one dashboard, ordered industry analysis and one source section',()=>{
  const result=runReal(realFixture());
  const editorial=renderDailyEditorial(result.report,result.evidence);
  const preview=createBloggerPreview(result.report,result.evidence,publishingConfig);
  const opening=preview.html.match(/<section\b[^>]*data-section="opening-summary"[^>]*>([\s\S]*?)<\/section>/)?.[1]??'';
  assert.equal((opening.match(/<p>/g)??[]).length,2);
  assert.equal((preview.html.match(/class="market-dashboard"/g)??[]).length,1);
  const afterDashboard=preview.html.match(/data-section="market-overview"[\s\S]*?<\/section>([\s\S]*)/)?.[1]??'';
  assert.doesNotMatch(afterDashboard,/7656\.98|26333\.04|4\.63%/);
  const company=preview.html.indexOf('이번 기업 뉴스의 중심');
  const industry=preview.html.indexOf('분기 실적 못지않게');
  const supplyChain=preview.html.indexOf('글로벌 공급망에서는');
  const korea=preview.html.indexOf('한국시장에서는 반도체 업종');
  assert.ok(company>=0&&company<industry&&industry<supplyChain&&supplyChain<korea);
  assert.equal((preview.html.match(/<h2\b[^>]*>주요 출처<\/h2>/g)??[]).length,1);
  assert.equal((preview.html.match(/class="hashtags"/g)??[]).length,1);
  assert.ok(editorial.terms.every(term=>editorial.bloggerMarkdown.includes(term.term)));
});
test('latest completed trading day renders verified bearish market data without Golden Day assumptions',()=>{
  const input=latestCompletedFixture();
  const result=runPipeline(input,sources,rules,input.asOf);
  assert.equal(result.report.tradingDate,'2026-09-15');
  assert.deepEqual(result.evidence.validationResult.issues.map(item=>[item.recordId,item.status]),[['AP-MARKET-CLOSE-2026-09-15','LOW_CONFIDENCE']]);
  assert.equal(input.market.find(item=>item.symbol==='SPX')?.close,7585.73);
  assert.equal(input.market.find(item=>item.symbol==='US10Y')?.close,5);
  assert.equal(input.market.find(item=>item.symbol==='BRENT_NOV26')?.close,108.75);
  const editorial=renderDailyEditorial(result.report,result.evidence);
  const preview=createBloggerPreview(result.report,result.evidence,publishingConfig,'2026-09-16T08:30:00+09:00');
  assert.equal(editorial.seo.title,'미국 증시 마감: 유가·금리 상승에 나스닥 하락 (2026년 9월 15일)');
  assert.match(editorial.bloggerMarkdown,/대형주와 기술주, 중소형주가 함께 밀렸다/);
  assert.match(editorial.bloggerMarkdown,/Dave & Buster's\(PLAY\)/);
  assert.match(editorial.bloggerMarkdown,/미국 장기금리와 유가가 동시에 오른 조합/);
  assert.doesNotMatch(editorial.bloggerMarkdown,/위험선호 흐름을 이어갔다|나스닥 상승이/);
  assert.deepEqual(editorial.terms.map(item=>item.term),['EPS','FOMC','bp','국채금리']);
  assert.equal((preview.html.match(/class="market-dashboard"/g)??[]).length,1);
  assert.equal((preview.html.match(/<h2\b[^>]*>주요 출처<\/h2>/g)??[]).length,1);
  assert.doesNotMatch(preview.html,/CLAIM-|confidenceScore|REVIEW_REQUIRED|<h1>/);
});
test('2026-09-16 MOTUS Daily uses verified FOMC close data and dictionary glossary',()=>{
  const input=read('data/manual/2026-09-16/input.json') as InputBundle;
  const result=runPipeline(input,sources,rules,input.asOf);
  const editorial=renderDailyEditorial(result.report,result.evidence);
  const publication=read('data/blogger/2026-09-16/MANUAL-2026-09-16-65e0805c062f-publication.json') as BloggerPublicationRecord;
  assert.equal(result.report.tradingDate,'2026-09-16');
  assert.equal(input.market.find(item=>item.symbol==='SPX')?.close,7551.81);
  assert.equal(input.market.find(item=>item.symbol==='US2Y')?.close,4.74);
  assert.equal(input.market.find(item=>item.symbol==='US10Y')?.close,5.01);
  assert.match(editorial.seo.title,/연준 금리 인상에 다우 급락, AI 반도체는 선방/);
  assert.match(editorial.bloggerMarkdown,/엔비디아는 0\.8%, AMD는 1\.6%/);
  assert.deepEqual(editorial.terms.map(item=>item.term),['CAPEX','FOMC','bp','국채금리']);
  assert.ok(editorial.terms.every(item=>!/(입니다|합니다|말합니다|뜻합니다|[.!?]$)/.test(item.explanation)));
  assert.equal(publication.status,'DRAFT');
  assert.ok(publication.draftPostId);
  assert.equal(publication.publicPostUrl,null);
  assert.doesNotMatch(publication.html,/CLAIM-|confidenceScore|REVIEW_REQUIRED|<h1>/);
});
test('2026-09-16 Human Review approves the existing draft without publishing',()=>{
  const publication=read('data/blogger/2026-09-16/MANUAL-2026-09-16-65e0805c062f-publication.json') as BloggerPublicationRecord;
  const review=read('data/reviews/2026-09-16/MANUAL-2026-09-16-65e0805c062f-human-review.json') as {
    reviewStatus:string;decision:string;reviewer:string;reviewedAt:string;
    editorialReview:{result:string};finalPreviewVerification:{result:string;postIdMatched:boolean;sectionCount:number;internalTokenVisible:boolean;layoutOverflowObserved:boolean};
    publicationGuard:{state:string;publicPostUrl:null;createdNewPost:boolean;bloggerWriteAttempted:boolean;automaticPublishAttempted:boolean};
  };
  const reviewedEvidence=read('data/publish-ready/2026-09-16/MANUAL-2026-09-16-65e0805c062f-reviewed-evidence.json') as EvidencePackage;
  assert.equal(review.reviewStatus,'APPROVED');
  assert.equal(review.decision,'APPROVE');
  assert.equal(review.reviewer,'human');
  assert.ok(Date.parse(review.reviewedAt));
  assert.equal(review.editorialReview.result,'PASS');
  assert.deepEqual(review.finalPreviewVerification,{...review.finalPreviewVerification,result:'PASS',postIdMatched:true,sectionCount:8,internalTokenVisible:false,layoutOverflowObserved:false});
  assert.deepEqual(review.publicationGuard,{...review.publicationGuard,state:'DRAFT',publicPostUrl:null,createdNewPost:false,bloggerWriteAttempted:false,automaticPublishAttempted:false});
  assert.equal(reviewedEvidence.approvalStatus,'APPROVED');
  assert.equal(reviewedEvidence.reviewMetrics.reviewer,'human');
  assert.equal(publication.status,'DRAFT');
  assert.equal(publication.draftPostId,'1299415515105343069');
  assert.equal(publication.publicPostUrl,null);
  assert.ok(publication.history.some(item=>/human editorial review approved/.test(item.reason)));
});
test('2026-09-16 visibility patch keeps the existing draft and passes Blogger mobile review',()=>{
  const verification=read('data/blogger/2026-09-16/MANUAL-2026-09-16-65e0805c062f-visibility-verification.json') as {
    draftPostId:string;state:string;newPostCreated:boolean;automaticPublishAttempted:boolean;titleUnchanged:boolean;marketDataUnchanged:boolean;
    bloggerApiVerification:Record<string,string>;mobileAdminPreview:{result:string;horizontalOverflowObserved:boolean;sourceLinkNavigationVerified:boolean;verifiedSourceLink:string};
  };
  assert.equal(verification.draftPostId,'1299415515105343069');
  assert.equal(verification.state,'DRAFT');
  assert.equal(verification.newPostCreated,false);
  assert.equal(verification.automaticPublishAttempted,false);
  assert.equal(verification.titleUnchanged,true);
  assert.equal(verification.marketDataUnchanged,true);
  assert.ok(Object.values(verification.bloggerApiVerification).every(result=>result==='PASS'));
  assert.equal(verification.mobileAdminPreview.result,'PASS');
  assert.equal(verification.mobileAdminPreview.horizontalOverflowObserved,false);
  assert.equal(verification.mobileAdminPreview.sourceLinkNavigationVerified,true);
  assert.match(verification.mobileAdminPreview.verifiedSourceLink,/^https:\/\/www\.federalreserve\.gov\//);
});
test('2026-09-16 market trend patch preserves the draft and passes Blogger mobile verification',()=>{
  const verification=read('data/blogger/2026-09-16/MANUAL-2026-09-16-65e0805c062f-market-trend-verification.json') as {
    draftPostId:string;state:string;draftUpdated:boolean;newPostCreated:boolean;automaticPublishAttempted:boolean;
    titleUnchanged:boolean;marketDataUnchanged:boolean;chartType:string;oldBarChartRemoved:string;lineChartsRendered:string;fiveSessionActualData:string;twoByTwoLayout:string;mobileOverflow:string;indexCoverage:string;bloggerSafe:string;
    indices:string[];bloggerApi:{svgCount:number;duplicateDraftCount:number;draftCountBefore:number;draftCountAfter:number};
    mobileAdminPreview:{result:string;fourCardsVisible:boolean;twoByTwoVisible:boolean;horizontalOverflowObserved:boolean};
  };
  assert.equal(verification.draftPostId,'1299415515105343069');
  assert.equal(verification.state,'DRAFT');
  assert.equal(verification.draftUpdated,true);
  assert.equal(verification.newPostCreated,false);
  assert.equal(verification.automaticPublishAttempted,false);
  assert.equal(verification.titleUnchanged,true);
  assert.equal(verification.marketDataUnchanged,true);
  assert.equal(verification.chartType,'STATIC_INLINE_SVG_FIVE_SESSION_LINE_CARDS');
  assert.deepEqual([verification.oldBarChartRemoved,verification.lineChartsRendered,verification.fiveSessionActualData,verification.twoByTwoLayout,verification.mobileOverflow,verification.indexCoverage,verification.bloggerSafe],['PASS','PASS','PASS','PASS','PASS','PASS','PASS']);
  assert.deepEqual(verification.indices,['S&P 500','Nasdaq','Dow Jones','Russell 2000']);
  assert.equal(verification.bloggerApi.svgCount,4);
  assert.equal(verification.bloggerApi.duplicateDraftCount,0);
  assert.equal(verification.bloggerApi.draftCountBefore,verification.bloggerApi.draftCountAfter);
  assert.equal(verification.mobileAdminPreview.result,'PASS');
  assert.equal(verification.mobileAdminPreview.fourCardsVisible,true);
  assert.equal(verification.mobileAdminPreview.twoByTwoVisible,true);
  assert.equal(verification.mobileAdminPreview.horizontalOverflowObserved,false);
});
test('2026-09-15 AI semiconductor review candidate preserves draft and requires human approval',()=>{
  const report=read('data/reports/MANUAL-2026-09-15-d11e82f3085c.json') as ReportRecord;
  const evidence=read('data/evidence/MANUAL-2026-09-15-d11e82f3085c.json') as EvidencePackage;
  const publication=read('data/blogger/2026-09-15/MANUAL-2026-09-15-d11e82f3085c-publication.json') as BloggerPublicationRecord;
  const plan=read('data/editorial/2026-09-15/MANUAL-2026-09-15-d11e82f3085c-ai-semiconductor-review-plan.json') as EditorialReviewPlan;
  const before=JSON.stringify(publication);
  const candidate=buildEditorialReviewCandidate(report,evidence,publication,plan,publishingConfig.publisher);
  assert.equal(JSON.stringify(publication),before);
  assert.equal(publication.status,'DRAFT');
  assert.equal(publication.draftPostId,'393279749369966296');
  assert.equal(publication.publicPostUrl,null);
  const companySection=candidate.candidateMarkdown.match(/## AI·반도체 \/ 주요 산업\n\n([\s\S]*?)\n\n## 한국시장 연결 포인트/)?.[1]??'';
  const required=['전날 글로벌 시장을 흔든 AI 종목','10년물 국채금리가 5%','밸류에이션','CAPEX가 실제 매출과 이익','한국 반도체'];
  let previous=-1;
  for(const text of required) { const index=companySection.indexOf(text,previous+1); assert.ok(index>previous,text); previous=index; }
  assert.ok(companySection.indexOf("Dave & Buster's")>companySection.indexOf('### 미국 소비 체크'));
  assert.match(candidate.candidateHtml,/<h3>미국 소비 체크<\/h3>/);
  assert.match(candidate.candidateHtml,/7585\.73|25,?981\.57|25981\.57/);
  assert.match(candidate.candidateHtml,/Reuters · Wall Street close/);
  assert.match(candidate.candidateHtml,/Microsoft Investor Relations|AMD Investor Relations|NVIDIA Investor Relations/);
  assert.doesNotMatch(candidate.candidateHtml,/REVIEW_REQUIRED|LOW_CONFIDENCE|claimId|confidenceScore|sourceTier/);
  assert.equal(candidate.humanReview.reviewStatus,'PENDING_HUMAN_APPROVAL');
  assert.equal(candidate.humanReview.publishAllowed,false);
  assert.equal(candidate.humanReview.bloggerWriteAttempted,false);
  assert.equal(candidate.humanReview.createNewDraft,false);
});
test('2026-09-15 editorial review records explicit human approval and draft-only patch audit',()=>{
  const review=read('data/editorial/2026-09-15/MANUAL-2026-09-15-d11e82f3085c-ai-semiconductor-human-review.json') as {
    reviewStatus:string; publishAllowed:boolean; approval:{decision:string;reviewer:string;reviewedAt:string;notes:string};
    approvalHistory:{from:string;to:string;decision:string;reviewer:string}[];
    bloggerDraftUpdate:{result:string;method:string;createdNewPost:boolean;postId:string;status:string;publicPostUrl:null;verification:Record<string,boolean|number>};
  };
  assert.equal(review.reviewStatus,'APPROVED');
  assert.equal(review.publishAllowed,false);
  assert.equal(review.approval.decision,'APPROVE');
  assert.equal(review.approval.reviewer,'human');
  assert.ok(Date.parse(review.approval.reviewedAt)>0);
  assert.match(review.approval.notes,/공개 발행 승인이 아니다/);
  assert.deepEqual(review.approvalHistory.map(item=>[item.from,item.to,item.decision,item.reviewer]),[['PENDING_HUMAN_APPROVAL','APPROVED','APPROVE','human']]);
  assert.equal(review.bloggerDraftUpdate.result,'PASS');
  assert.equal(review.bloggerDraftUpdate.method,'posts.patch');
  assert.equal(review.bloggerDraftUpdate.createdNewPost,false);
  assert.equal(review.bloggerDraftUpdate.postId,'393279749369966296');
  assert.equal(review.bloggerDraftUpdate.status,'DRAFT');
  assert.equal(review.bloggerDraftUpdate.publicPostUrl,null);
  assert.equal(review.bloggerDraftUpdate.verification.marketDataUnchanged,true);
  assert.equal(review.bloggerDraftUpdate.verification.internalTokenCount,0);
  assert.equal(review.bloggerDraftUpdate.verification.duplicateDraftCount,0);
});
test('2026-09-15 category block preview keeps title and market data while preserving publication',()=>{
  const base='data/editorial/2026-09-15/MANUAL-2026-09-15-d11e82f3085c-category-block';
  const before=readFileSync(`${base}-before.html`,'utf8');
  const after=readFileSync(`${base}-after.html`,'utf8');
  const comparison=read(`${base}-comparison.json`) as {
    bloggerApiCalled:boolean;publicationRecordChanged:boolean;titleUnchanged:boolean;marketDataUnchanged:boolean;
    sectionOrder:string[];sectionBlockCount:number;glossaryCardCount:number;sourceGroups:string[];koreaHighlightBox:boolean;internalTokenCount:number;
  };
  assert.notEqual(before,after);
  assert.equal(comparison.bloggerApiCalled,false);
  assert.equal(comparison.publicationRecordChanged,false);
  assert.equal(comparison.titleUnchanged,true);
  assert.equal(comparison.marketDataUnchanged,true);
  assert.deepEqual(comparison.sectionOrder,['Opening Summary','시장 한눈에 보기','시장을 움직인 핵심 요인','AI·반도체 / 주요 산업','한국시장 연결 포인트','오늘 체크리스트','용어해설','주요 출처']);
  assert.equal(comparison.sectionBlockCount,8);
  assert.equal(comparison.glossaryCardCount,4);
  assert.deepEqual(comparison.sourceGroups,['시장지수','거시','기업·산업']);
  assert.equal(comparison.koreaHighlightBox,true);
  assert.equal(comparison.internalTokenCount,0);
  assert.match(after,/class="editorial-block block-korea-market"/);
  assert.equal((after.match(/class="market-dashboard"/g)??[]).length,1);
  assert.doesNotMatch(after,/CLAIM-|REVIEW_REQUIRED|confidenceScore|draftPostId/);
});
test('2026-09-15 Blogger financial research patch verification preserves the existing draft',()=>{
  const verification=read('data/blogger/2026-09-15/MANUAL-2026-09-15-d11e82f3085c-draft-update-verification.json') as {
    postId:string;status:string;title:string;h1Count:number;marketDashboardCount:number;duplicateDraftCount:number;internalTokenCount:number;
    sectionOrder:string[];editorialBlockCount:number;glossaryCardCount:number;glossaryReferenceCount:number;sourceGroupCount:number;koreaHighlightBox:boolean;
    titleBarCount:number;mobileHorizontalOverflowDisabled:boolean;inlineStyleAttributeCount:number;titleBarInlineStyleCount:number;contentBoxInlineStyleCount:number;
    styleTagCount:number;glossaryCompactTable:boolean;sourceGroupsInlineStyled:boolean;koreaInlineHighlight:boolean;adminDraftUrl:string;draftCountBefore:number;draftCountAfter:number;
  };
  assert.equal(verification.postId,'393279749369966296');
  assert.equal(verification.status,'DRAFT');
  assert.equal(verification.title,'미국 증시 마감: 유가·금리 상승에 나스닥 하락 (2026년 9월 15일)');
  assert.deepEqual(verification.sectionOrder,['핵심 요약','시장 한눈에 보기','시장을 움직인 핵심 요인','AI·반도체 / 주요 산업','한국시장 연결 포인트','오늘 체크리스트','용어설명','주요 출처']);
  assert.equal(verification.editorialBlockCount,8);
  assert.equal(verification.glossaryCardCount,0);
  assert.equal(verification.glossaryReferenceCount,4);
  assert.equal(verification.sourceGroupCount,3);
  assert.equal(verification.koreaHighlightBox,true);
  assert.equal(verification.titleBarCount,8);
  assert.equal(verification.mobileHorizontalOverflowDisabled,true);
  assert.ok(verification.inlineStyleAttributeCount>=70);
  assert.equal(verification.titleBarInlineStyleCount,8);
  assert.equal(verification.contentBoxInlineStyleCount,8);
  assert.equal(verification.styleTagCount,0);
  assert.equal(verification.glossaryCompactTable,true);
  assert.equal(verification.sourceGroupsInlineStyled,true);
  assert.equal(verification.koreaInlineHighlight,true);
  assert.equal(verification.h1Count,0);
  assert.equal(verification.marketDashboardCount,1);
  assert.equal(verification.internalTokenCount,0);
  assert.equal(verification.duplicateDraftCount,0);
  assert.equal(verification.draftCountBefore,verification.draftCountAfter);
  assert.match(verification.adminDraftUrl,/^https:\/\/www\.blogger\.com\/blog\/post\/edit\/\d+\/393279749369966296$/);
});
test('financial research layout uses title bars, compact glossary and grouped market table without overflow',()=>{
  const base='data/editorial/2026-09-15/MANUAL-2026-09-15-d11e82f3085c-financial-research-block';
  const after=readFileSync(`${base}-after.html`,'utf8');
  const comparison=read(`${base}-comparison.json`) as {
    bloggerApiCalled:boolean;publicationRecordChanged:boolean;titleUnchanged:boolean;marketDataUnchanged:boolean;sectionOrder:string[];
    sectionBlockCount:number;titleBarCount:number;titleBarInlineStyleCount:number;contentBoxInlineStyleCount:number;styleTagCount:number;
    glossaryReferenceCount:number;sourceGroups:string[];koreaHighlightBox:boolean;mobileHorizontalOverflowDisabled:boolean;internalTokenCount:number;
  };
  assert.equal(comparison.bloggerApiCalled,false);
  assert.equal(comparison.publicationRecordChanged,false);
  assert.equal(comparison.titleUnchanged,true);
  assert.equal(comparison.marketDataUnchanged,true);
  assert.deepEqual(comparison.sectionOrder,['핵심 요약','시장 한눈에 보기','시장을 움직인 핵심 요인','AI·반도체 / 주요 산업','한국시장 연결 포인트','오늘 체크리스트','용어설명','주요 출처']);
  assert.equal(comparison.sectionBlockCount,8);
  assert.equal(comparison.titleBarCount,8);
  assert.equal(comparison.titleBarInlineStyleCount,8);
  assert.equal(comparison.contentBoxInlineStyleCount,8);
  assert.equal(comparison.styleTagCount,0);
  assert.equal(comparison.glossaryReferenceCount,4);
  assert.deepEqual(comparison.sourceGroups,['시장지수','거시','기업·산업']);
  assert.equal(comparison.koreaHighlightBox,true);
  assert.equal(comparison.mobileHorizontalOverflowDisabled,true);
  assert.equal(comparison.internalTokenCount,0);
  assert.match(after,/data-layout="blogger-inline-v1"/);
  assert.match(after,/>주요지수<|>금리·환율<|>글로벌 변수</);
  assert.equal((after.match(/class="glossary-row"/g)??[]).length,4);
  assert.doesNotMatch(after,/glossary-card|overflow-x:auto|<style\b/);
  assert.match(after,/<h2\b[^>]*style="[^"]*background:#071a33[^"]*color:#ffffff[^"]*padding:[^"]*font-size:[^"]*font-weight:700[^"]*margin:0/);
  assert.match(after,/class="editorial-content glossary-reference"[^>]*style="[^"]*background:#f4f7fb[^"]*font-size:14px/);
});
test('financial research renderer omits an empty variable section',()=>{
  const rendered=renderMotusBloggerContent({
    title:'테스트',seoTitle:'테스트',metaDescription:'테스트',slug:'test',hashtags:[],glossary:[],sources:[],
    markdown:'## 핵심 요약\n\n본문\n\n## AI·반도체 / 주요 산업\n\n\n## 오늘 체크리스트\n\n- 확인',
    metadata:{schemaVersion:'1.0',brand:'MOTUS',displayName:'MOTUS | What Moves the World',primaryCategory:'Daily Market',categories:['Daily Market'],companies:[],sectors:[],themes:[],countries:[],regions:[]}
  },publishingConfig.publisher);
  assert.doesNotMatch(rendered.html,/<h2\b[^>]*>AI·반도체 \/ 주요 산업<\/h2>/);
  assert.match(rendered.html,/<h2\b[^>]*>핵심 요약<\/h2>/);
  assert.match(rendered.html,/<h2\b[^>]*>오늘 체크리스트<\/h2>/);
});
test('Blogger visibility renderer uses high-contrast inline styles, dictionary glossary and clickable sources',()=>{
  const rendered=renderMotusBloggerContent({
    title:'테스트',seoTitle:'테스트',metaDescription:'테스트',slug:'test',hashtags:[],
    glossary:[
      {term:'CAPEX',explanation:'자본적 지출·설비투자입니다.',evergreenKey:'capex',evergreenTitle:'CAPEX'},
      {term:'FOMC',explanation:'미국 연방공개시장위원회',evergreenKey:'fomc',evergreenTitle:'FOMC'},
      {term:'bp',explanation:'0.01%포인트',evergreenKey:'bp',evergreenTitle:'bp'},
      {term:'국채금리',explanation:'국채의 시장 수익률',evergreenKey:'yield',evergreenTitle:'국채금리'}
    ],
    sources:[{label:'Federal Reserve',url:'https://www.federalreserve.gov/test'}],
    markdown:'## 핵심 요약\n\n본문\n\n## 시장 한눈에 보기\n\n| 구분 | 지표 | 종가 | 등락 |\n| --- | --- | ---: | ---: |\n| 주요지수 | 지수 A | 100 | +1.0% |\n| 주요지수 | 지수 B | 90 | -1.0% |',
    metadata:{schemaVersion:'1.0',brand:'MOTUS',displayName:'MOTUS | What Moves the World',primaryCategory:'Daily Market',categories:['Daily Market'],companies:[],sectors:[],themes:[],countries:[],regions:[]}
  },publishingConfig.publisher);
  assert.match(rendered.html,/background:#03162e;color:#ffffff;border:1px solid #010b17[^"']*font-size:20px;font-weight:800/);
  assert.match(rendered.html,/background:#0b2745;color:#ffffff[^"']*font-size:14px;font-weight:800/);
  assert.match(rendered.html,/color:#08733f;background:#edf8f1/);
  assert.match(rendered.html,/color:#b42318;background:#fff1f0/);
  assert.match(rendered.html,/CAPEX[\s\S]*Capital Expenditure[\s\S]*자본적 지출·설비투자/);
  assert.match(rendered.html,/FOMC[\s\S]*Federal Open Market Committee/);
  assert.match(rendered.html,/bp[\s\S]*basis point/);
  assert.match(rendered.html,/국채금리[\s\S]*Treasury yield/);
  const glossary=rendered.html.match(/data-section="glossary"[\s\S]*?<\/section>/)?.[0]??'';
  assert.doesNotMatch(glossary,/입니다|합니다/);
  assert.match(rendered.html,/<a href="https:\/\/www\.federalreserve\.gov\/test" target="_blank" rel="nofollow noopener noreferrer" style="color:#0759a6;text-decoration:underline/);
  assert.doesNotMatch(rendered.html,/>https:\/\//);
  assert.match(rendered.html,/width:100%;max-width:100%;box-sizing:border-box/);
});
test('MOTUS Blogger renderer adds four responsive five-session line charts from verified inputs',()=>{
  const marketHistory=buildFiveSessionMajorIndexHistory([
    read('data/manual/2026-09-11/input.json') as InputBundle,
    read('data/manual/2026-09-15/input.json') as InputBundle,
    read('data/manual/2026-09-16/input.json') as InputBundle
  ]);
  assert.deepEqual(marketHistory.series.map(item=>item.closes),[
    [7591.70,7656.98,7619.98,7585.73,7551.81],
    [26081.73,26333.04,26186.41,25981.57,25978.42],
    [52064.10,52573.29,52421.20,52093.11,51461.90],
    [2890.947,2903.944,2892.24,2870.29,2858.81]
  ]);
  assert.equal(marketHistory.series[3]!.provenance[3]!.crossCheckDelta,0.01);
  const rendered=renderMotusBloggerContent({
    title:'테스트',seoTitle:'테스트',metaDescription:'테스트',slug:'test',hashtags:[],glossary:[],sources:[],
    markdown:'## 핵심 요약\n\n본문\n\n## 시장 한눈에 보기\n\n| 구분 | 지표 | 종가 | 등락 |\n| --- | --- | ---: | ---: |\n| 주요지수 | S&P 500 | 7551.81 | -0.45% |\n| 주요지수 | 나스닥 | 25978.42 | -0.01% |\n| 주요지수 | 다우지수 | 51461.9 | -1.21% |\n| 주요지수 | 러셀2000 | 2858.81 | -0.4% |',
    metadata:{schemaVersion:'1.0',brand:'MOTUS',displayName:'MOTUS | What Moves the World',primaryCategory:'Daily Market',categories:['Daily Market'],companies:[],sectors:[],themes:[],countries:[],regions:[]},marketHistory
  },publishingConfig.publisher);
  const tableIndex=rendered.html.indexOf('data-section="market-overview"');
  const graphIndex=rendered.html.indexOf('data-section="major-index-trend"');
  assert.ok(tableIndex>=0&&graphIndex>tableIndex);
  assert.match(rendered.html,/data-chart-status="rendered"/);
  assert.equal((rendered.html.match(/<svg class="index-line-chart"/g)??[]).length,4);
  assert.equal((rendered.html.match(/<polyline points=/g)??[]).length,4);
  assert.equal((rendered.html.match(/data-values="[^"]+(?:,[^,"]+){4}"/g)??[]).length,4);
  assert.match(rendered.html,/<div class="index-trend-grid" data-layout="two-by-two"/);
  assert.equal((rendered.html.match(/class="index-trend-row"[^>]*display:flex!important;flex-wrap:nowrap!important/g)??[]).length,2);
  assert.equal((rendered.html.match(/width:50%;max-width:50%/g)??[]).length,4);
  for(const key of ['sp500','nasdaq','dow-jones','russell-2000']) assert.match(rendered.html,new RegExp(`data-index="${key}"`));
  assert.match(rendered.html,/7,551\.81[\s\S]*-0\.45%/);
  assert.match(rendered.html,/2026년 9월 10~16일 정규장 종가/);
  assert.match(rendered.html,/S&amp;P Dow Jones Indices[\s\S]*Nasdaq[\s\S]*FTSE Russell/);
  assert.doesNotMatch(rendered.html,/major-index-chart|막대그래프|data-change=|<script\b|javascript:|<foreignObject\b|<iframe\b|overflow-x:auto/);
  assertPublicBloggerHtmlSafe(rendered.html);
});
test('market trend failure falls back without breaking the Blogger article',()=>{
  const rendered=renderMotusBloggerContent({
    title:'테스트',seoTitle:'테스트',metaDescription:'테스트',slug:'test',hashtags:[],glossary:[],sources:[],
    markdown:'## 핵심 요약\n\n본문\n\n## 시장 한눈에 보기\n\n| 구분 | 지표 | 종가 | 등락 |\n| --- | --- | ---: | ---: |\n| 주요지수 | S&P 500 | 100 | -0.5% |',
    metadata:{schemaVersion:'1.0',brand:'MOTUS',displayName:'MOTUS | What Moves the World',primaryCategory:'Daily Market',categories:['Daily Market'],companies:[],sectors:[],themes:[],countries:[],regions:[]}
  },publishingConfig.publisher);
  assert.match(rendered.html,/data-section="major-index-trend" data-chart-status="fallback"/);
  assert.doesNotMatch(rendered.html,/<svg\b/);
  assert.match(rendered.html,/검증된 5거래일 종가를 모두 확인할 수 없어/);
  assert.match(rendered.html,/본문/);
  assertPublicBloggerHtmlSafe(rendered.html);
});
test('related articles render only for a verified MOTUS article permalink',()=>{
  const result=runReal(realFixture());
  const editorial=renderDailyEditorial(result.report,result.evidence);
  const preview=createBloggerPreview(result.report,result.evidence,publishingConfig);
  const glossary=editorial.terms.slice(0,3).map((term,index)=>({...term,publishedUrl:index===0?'https://motusnova.blogspot.com/2026/09/capex-cycle.html':index===1?'https://motusnova.blogspot.com/':'https://motusnova.blogspot.com/search/label/Evergreen'}));
  const rendered=renderMotusBloggerContent({title:preview.title,seoTitle:preview.seoTitle,metaDescription:preview.metaDescription,slug:preview.slug,markdown:editorial.bloggerMarkdown,hashtags:preview.hashtags,glossary,sources:preview.sources,metadata:preview.metadata},publishingConfig.publisher);
  assert.equal(rendered.relatedLinks.length,1);
  assert.equal(rendered.relatedLinks[0]?.url,'https://motusnova.blogspot.com/2026/09/capex-cycle.html');
  assert.match(rendered.html,/<div class="related"[^>]*>/);
  assert.doesNotMatch(rendered.html,/href="https:\/\/motusnova\.blogspot\.com\/"|\/search\/label\/Evergreen/);
});
test('Sprint 2G Blogger state transition, dry-run publish and credential failure are safe',async()=>{
  const result=runReal(realFixture());
  const preview=createBloggerPreview(result.report,result.evidence,publishingConfig);
  const approved=approveBloggerPublication(preview,{audience:'admin',action:'BLOGGER_APPROVE'});
  assert.equal(approved.status,'APPROVED');
  const dryRun=await publishBloggerPublication(approved,new DryRunBloggerAdapter(),publishingConfig,{audience:'admin',action:'BLOGGER_PUBLISH'},{dryRun:true});
  assert.equal(dryRun.status,'APPROVED');
  assert.equal(dryRun.dryRun,true);
  assert.equal(dryRun.publicPostUrl,null);
  const failed=await publishBloggerPublication(approved,new DryRunBloggerAdapter(),publishingConfig,{audience:'admin',action:'BLOGGER_PUBLISH'});
  assert.equal(failed.status,'FAILED');
  assert.equal(failed.error,'missing credential');
});
test('Sprint 2G Blogger publish stores real adapter URL and prevents duplicate publish',async()=>{
  const result=runReal(realFixture());
  const approved=approveBloggerPublication(createBloggerPreview(result.report,result.evidence,publishingConfig),{audience:'admin',action:'BLOGGER_APPROVE'});
  const adapter=new ConfiguredBloggerAdapter(async record=>({publicPostUrl:`https://real-blog.test/posts/${record.slug}`,postId:'POST-1',publishedAt:'2026-09-14T00:12:00+09:00'}));
  const published=await publishBloggerPublication(approved,adapter,{...publishingConfig,credentialAvailable:true},{audience:'admin',action:'BLOGGER_PUBLISH'});
  assert.equal(published.status,'PUBLISHED');
  assert.equal(published.draftPostId,'POST-1');
  assert.equal(published.publicPostUrl,'https://real-blog.test/posts/daily-market-2026-09-11');
  assert.deepEqual(resolveBloggerUrl(published),{url:'https://real-blog.test/posts/daily-market-2026-09-11',state:'PUBLISHED'});
  await assert.rejects(()=>publishBloggerPublication(published,adapter,{...publishingConfig,credentialAvailable:true},{audience:'admin',action:'BLOGGER_PUBLISH'}),/already-published reportId/);
});
test('Sprint 2G server-side auth denies public publishing console and publish action',async()=>{
  const result=runReal(realFixture());
  const preview=createBloggerPreview(result.report,result.evidence,publishingConfig);
  assert.throws(()=>renderPublishingConsole(preview,{audience:'public',action:'BLOGGER_PREVIEW'}),/admin authorization required/);
  const approved=approveBloggerPublication(preview,{audience:'admin',action:'BLOGGER_APPROVE'});
  await assert.rejects(()=>publishBloggerPublication(approved,new DryRunBloggerAdapter(),publishingConfig,{audience:'public',action:'BLOGGER_PUBLISH'}),/admin authorization required/);
  assert.throws(()=>approveBloggerPublication(preview,{audience:'admin',action:'BLOGGER_APPROVE',environment:'production'}),/production admin authentication provider required/);
});
test('Sprint 2G A4 QR and Naver package switch from preview URL to published Blogger URL on regenerate',async()=>{
  const result=runReal(realFixture());
  const dir=mkdtempSync(join(tmpdir(),'a4-2g-'));
  const preview=createBloggerPreview(result.report,result.evidence,publishingConfig);
  const before=await renderA4MasterOnDemand(result.report,result.evidence,dir,{audience:'admin',action:'A4_REPORT_RENDER'},{regenerate:true,bloggerRecord:preview,publishingConfig});
  assert.equal(before.layout.qrTargetUrl,'');
  assert.equal(before.naverPackage.googleBloggerUrl,'');
  const published={...preview,status:'PUBLISHED' as const,publicPostUrl:'https://real-blog.test/posts/daily-market-2026-09-11'};
  const after=await renderA4MasterOnDemand(result.report,result.evidence,dir,{audience:'admin',action:'A4_REPORT_RENDER'},{regenerate:true,bloggerRecord:published,publishingConfig});
  assert.equal(after.layout.qrTargetUrl,published.publicPostUrl);
  assert.equal(after.naverPackage.googleBloggerUrl,published.publicPostUrl);
  const naver=JSON.parse(readFileSync(after.naverPackagePath,'utf8')) as Record<string,string|string[]>;
  assert.equal(naver.googleBloggerUrl,published.publicPostUrl);
  assert.doesNotMatch(readFileSync(after.htmlPath,'utf8'),/blog\.example\.com|CLAIM-|confidenceScore|verificationStatus/);
});

test('Blogger failed publication can be re-approved without deleting failure audit history',()=>{
  const result=runReal(realFixture());
  const preview=createBloggerPreview(result.report,result.evidence,publishingConfig);
  const approved=approveBloggerPublication(preview,{audience:'admin',action:'BLOGGER_APPROVE'});
  const failed={...approved,status:'FAILED' as const,error:'previous OAuth failure',history:[...approved.history,{at:'2026-09-15T00:00:00+09:00',from:'APPROVED' as const,to:'FAILED' as const,reason:'previous OAuth failure'}]};
  const retried=approveBloggerPublication(failed,{audience:'admin',action:'BLOGGER_APPROVE'},'2026-09-15T00:05:00+09:00');
  assert.equal(retried.status,'APPROVED');
  assert.equal(retried.error,null);
  assert.equal(retried.history.length,failed.history.length+1);
  assert.ok(retried.history.some(event=>event.to==='FAILED'&&event.reason==='previous OAuth failure'));
  assert.equal(retried.history.at(-1)?.reason,'admin approved Blogger publication retry after failed attempt');
});

test('DRAFT plus Blogger root URL stores only draftPostId and leaves publicPostUrl null',async()=>{
  const result=runReal(realFixture());
  const approved=approveBloggerPublication(createBloggerPreview(result.report,result.evidence,publishingConfig),{audience:'admin',action:'BLOGGER_APPROVE'});
  let requestUrl='';
  let requestInit:RequestInit|undefined;
  const fakeFetch:typeof fetch=async(input,init)=>{
    requestUrl=String(input);
    requestInit=init;
    return new Response(JSON.stringify({id:'DRAFT-POST-1',url:'https://motusnova.blogspot.com/',status:'DRAFT',updated:'2026-09-15T01:30:00Z'}),{status:200,headers:{'content-type':'application/json'}});
  };
  const adapter=new GoogleBloggerApiAdapter(name=>name==='BLOGGER_OAUTH_TOKEN'?'secret-access-token':undefined,fakeFetch);
  const config={...publishingConfig,blogId:'123456789',credentialEnvironmentVariable:'BLOGGER_OAUTH_TOKEN',publishAsDraft:true};
  const draft=await publishBloggerPublication(approved,adapter,config,{audience:'admin',action:'BLOGGER_PUBLISH'});
  assert.equal(draft.status,'DRAFT');
  assert.equal(draft.draftPostId,'DRAFT-POST-1');
  assert.equal(draft.publicPostUrl,null);
  assert.deepEqual(resolveBloggerUrl(draft),{url:'',state:'DRAFT'});
  assert.match(requestUrl,/\/blogs\/123456789\/posts\?isDraft=true/);
  assert.equal((requestInit?.headers as Record<string,string>).authorization,'Bearer secret-access-token');
  const payload=JSON.parse(String(requestInit?.body)) as {title:string;content:string;labels?:string[];customMetaData?:string};
  assert.equal(payload.title,approved.title);
  assert.deepEqual(payload.labels,approved.labels);
  assert.match(payload.content,/class="motus-editorial"/);
  assert.match(payload.content,/<h2\b[^>]*>핵심 요약<\/h2>/);
  assert.match(payload.content,/market-dashboard/);
  assert.doesNotMatch(payload.content,/<h1>|MOTUS \| What Moves the WorldDaily Market/);
  assert.doesNotMatch(payload.content,/<!doctype|<html|<head(?:\s|>)|publicationVersion|confidenceScore/);
  assert.equal(payload.customMetaData,undefined);
});

test('Sprint 2H Google adapter never calls Blogger without both blogId and credential',async()=>{
  const result=runReal(realFixture());
  const approved=approveBloggerPublication(createBloggerPreview(result.report,result.evidence,publishingConfig),{audience:'admin',action:'BLOGGER_APPROVE'});
  let calls=0;
  const fakeFetch:typeof fetch=async()=>{ calls+=1; return new Response('{}',{status:200}); };
  const missingBlog=new GoogleBloggerApiAdapter(()=> 'token',fakeFetch);
  const missingToken=new GoogleBloggerApiAdapter(()=> undefined,fakeFetch);
  const withoutBlog=await publishBloggerPublication(approved,missingBlog,{...publishingConfig,blogId:null},{audience:'admin',action:'BLOGGER_PUBLISH'});
  const withoutToken=await publishBloggerPublication(approved,missingToken,{...publishingConfig,blogId:'123'},{audience:'admin',action:'BLOGGER_PUBLISH'});
  assert.equal(withoutBlog.status,'FAILED');
  assert.equal(withoutToken.status,'FAILED');
  assert.equal(withoutBlog.publicPostUrl,null);
  assert.equal(withoutToken.publicPostUrl,null);
  assert.equal(calls,0);
});

test('Google adapter reads an admin draft back without accepting a root URL as permalink',async()=>{
  const fakeFetch:typeof fetch=async(input)=>new Response(JSON.stringify({id:'DRAFT-READ-1',title:'MOTUS title',content:'<article style="width:100%">body</article>',status:'DRAFT',url:'https://motusnova.blogspot.com/',labels:['MOTUS Daily']}),{status:200,headers:{'content-type':'application/json'}});
  const adapter=new GoogleBloggerApiAdapter(name=>name==='BLOGGER_OAUTH_TOKEN'?'access':undefined,fakeFetch);
  const result=await adapter.readPost('DRAFT-READ-1',{...publishingConfig,blogId:'blog-id',credentialEnvironmentVariable:'BLOGGER_OAUTH_TOKEN'});
  assert.equal(result.status,'DRAFT');assert.equal(result.url,null);assert.deepEqual(result.labels,['MOTUS Daily']);
});

test('Blogger draft root URL never propagates to A4 or Naver',async()=>{
  const result=runReal(realFixture());
  const dir=mkdtempSync(join(tmpdir(),'a4-2h-draft-'));
  const rootUrl='https://motusnova.blogspot.com/';
  const draft={...createBloggerPreview(result.report,result.evidence,publishingConfig),status:'DRAFT' as const,draftPostId:'DRAFT-POST-1',publicPostUrl:null};
  const output=await renderA4MasterOnDemand(result.report,result.evidence,dir,{audience:'admin',action:'A4_REPORT_RENDER'},{regenerate:true,bloggerUrl:rootUrl,bloggerRecord:draft,publishingConfig});
  assert.equal(output.layout.qrTargetUrl,'');
  assert.equal(output.naverPackage.googleBloggerUrl,'');
  assert.doesNotMatch(readFileSync(output.htmlPath,'utf8'),new RegExp(rootUrl.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.doesNotMatch(JSON.stringify(output.naverPackage),new RegExp(rootUrl.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(output.naverPackage.intro,/MOTUS 초안은 검수 중/);
});

test('existing Blogger draftPostId blocks a duplicate remote insert',async()=>{
  const result=runReal(realFixture());
  const approved=approveBloggerPublication(createBloggerPreview(result.report,result.evidence,publishingConfig),{audience:'admin',action:'BLOGGER_APPROVE'});
  const existing={...approved,draftPostId:'4610978170890431016'};
  let calls=0;
  const adapter=new ConfiguredBloggerAdapter(async()=>{
    calls+=1;
    return {publicPostUrl:null,postId:'SHOULD-NOT-BE-CREATED',status:'DRAFT'};
  });
  await assert.rejects(()=>publishBloggerPublication(existing,adapter,{...publishingConfig,credentialAvailable:true},{audience:'admin',action:'BLOGGER_PUBLISH'}),/duplicate publish: draft post ID already exists/);
  assert.equal(calls,0);
});

test('existing Blogger draft is patched in place and re-read without publish or duplicate insert',async()=>{
  const result=runReal(realFixture());
  const preview=createBloggerPreview(result.report,result.evidence,publishingConfig);
  const existing={...preview,status:'DRAFT' as const,draftPostId:'4610978170890431016',publicPostUrl:null,history:[...preview.history,{at:'2026-09-15T00:00:00Z',from:'APPROVED' as const,to:'DRAFT' as const,reason:'existing draft created'}]};
  const env:Record<string,string>={BLOGGER_BLOG_ID:'blog-id',BLOGGER_REFRESH_TOKEN:'refresh',BLOGGER_CLIENT_ID:'client',BLOGGER_CLIENT_SECRET:'secret'};
  let patched:{title:string;content:string}|null=null;
  const calls:{method:string;url:string}[]=[];
  const fakeFetch:typeof fetch=async(input,init)=>{
    const url=String(input),method=init?.method??'GET';
    calls.push({method,url});
    if(url===BLOGGER_TOKEN_ENDPOINT) return new Response(JSON.stringify({access_token:'access'}),{status:200});
    if(method==='PATCH') {
      patched=JSON.parse(String(init?.body)) as {title:string;content:string};
      assert.deepEqual(Object.keys(patched).sort(),['content','title']);
      assert.doesNotMatch(url,/publish|revert/);
      return new Response(JSON.stringify({id:existing.draftPostId,status:'DRAFT'}),{status:200});
    }
    if(new URL(url).pathname.endsWith(`/posts/${existing.draftPostId}`)) return new Response(JSON.stringify({id:existing.draftPostId,status:'DRAFT',title:patched?.title??'old title',content:patched?.content??'<p>old</p>',updated:'2026-09-16T01:00:00Z'}),{status:200});
    return new Response(JSON.stringify({items:[{id:existing.draftPostId,status:'DRAFT',title:patched?.title??'old title'}]}),{status:200});
  };
  const updated=await updateExistingBloggerDraft(existing,preview.html,publishingConfig,{audience:'admin',action:'BLOGGER_PUBLISH'},{expectedPostId:existing.draftPostId,expectedTitle:preview.title,environment:name=>env[name],fetcher:fakeFetch});
  assert.equal(updated.record.status,'DRAFT');
  assert.equal(updated.record.draftPostId,existing.draftPostId);
  assert.equal(updated.record.publicPostUrl,null);
  assert.equal(updated.record.history.length,existing.history.length+1);
  assert.equal(updated.verification.h1Count,0);
  assert.equal(updated.verification.marketDashboardCount,1);
  assert.equal(updated.verification.primarySourcesCount,1);
  assert.equal(updated.verification.visibleRawUrlCount,0);
  assert.equal(updated.verification.unpublishedRelatedLinksCount,0);
  assert.equal(updated.verification.duplicateDraftCount,0);
  assert.equal(updated.verification.marketDataUnchanged,true);
  assert.equal(updated.verification.internalTokenCount,0);
  assert.equal(updated.verification.aiSemiconductorFocus,null);
  assert.equal(updated.verification.sectionOrder,null);
  assert.equal(updated.verification.editorialBlockCount,null);
  assert.match(updated.verification.adminDraftUrl,/^https:\/\/www\.blogger\.com\/blog\/post\/edit\/blog-id\/4610978170890431016$/);
  assert.equal(calls.filter(call=>call.method==='PATCH').length,1);
  assert.equal(calls.filter(call=>call.method==='POST'&&call.url.includes('/blogger/')).length,0);
});

test('MOTUS publisher stays separate from the market engine and supports global metadata categories',()=>{
  const result=runReal(realFixture());
  const preview=createBloggerPreview(result.report,result.evidence,publishingConfig);
  assert.deepEqual(publishingConfig.publisher.categories,[
    'Daily Market','AI & Industry','Global Company','Market / Investment Insight','Evergreen'
  ]);
  assert.equal(preview.metadata.displayName,'MOTUS | What Moves the World');
  assert.ok(preview.labels.includes('Daily Market'));
  assert.doesNotMatch(preview.html,/<h1>|\/search\/label\/Evergreen|<section class="related">/);
  assert.doesNotMatch(readFileSync('src/publishers/motus.ts','utf8'),/domain\/models|services\/pipeline|services\/validation|services\/analysis/);
  assert.equal(publishingConfig.publicBaseUrl,'https://motusnova.blogspot.com/');
});

test('Blogger OAuth bootstrap requests offline consent with only the Blogger scope',()=>{
  const url=buildBloggerAuthorizationUrl({clientId:'desktop-client-id',redirectUri:'http://127.0.0.1:43123/oauth2/callback',state:'csrf-state'});
  assert.equal(url.origin+url.pathname,'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('scope'),BLOGGER_OAUTH_SCOPE);
  assert.equal(url.searchParams.get('access_type'),'offline');
  assert.equal(url.searchParams.get('prompt'),'consent');
  assert.equal(url.searchParams.get('response_type'),'code');
  assert.equal(url.searchParams.get('redirect_uri'),'http://127.0.0.1:43123/oauth2/callback');
  assert.equal(url.searchParams.get('login_hint'),'luinbiotech@gmail.com');
  assert.equal([...url.searchParams.getAll('scope')].length,1);
});

test('Blogger OAuth environment validation exposes names but never credential values',()=>{
  const secretValue='client-secret-value';
  const values:Record<string,string>={BLOGGER_CLIENT_ID:'client-id',BLOGGER_CLIENT_SECRET:secretValue,BLOGGER_BLOG_ID:'blog-id'};
  assert.deepEqual(readBloggerOAuthEnvironment(name=>values[name]),{clientId:'client-id',clientSecret:secretValue,blogId:'blog-id'});
  assert.throws(()=>readBloggerOAuthEnvironment(()=>undefined),error=>{
    assert.match(String(error),/BLOGGER_CLIENT_ID/);
    assert.doesNotMatch(String(error),new RegExp(secretValue));
    return true;
  });
});

test('authorization code exchange requires a refresh token and does not put credentials in the URL',async()=>{
  let requestUrl='';
  let requestInit:RequestInit|undefined;
  const refreshToken='issued-refresh-token';
  const fakeFetch:typeof fetch=async(input,init)=>{
    requestUrl=String(input); requestInit=init;
    return new Response(JSON.stringify({refresh_token:refreshToken,access_token:'short-lived'}),{status:200});
  };
  const result=await exchangeAuthorizationCode({code:'authorization-code',clientId:'client-id',clientSecret:'client-secret',redirectUri:'http://127.0.0.1:41000/oauth2/callback'},fakeFetch);
  assert.equal(result,refreshToken);
  assert.equal(requestUrl,BLOGGER_TOKEN_ENDPOINT);
  assert.doesNotMatch(requestUrl,/authorization-code|client-secret/);
  const body=requestInit?.body as URLSearchParams;
  assert.equal(body.get('grant_type'),'authorization_code');
  assert.equal(body.get('client_secret'),'client-secret');
  await assert.rejects(()=>exchangeAuthorizationCode({code:'code',clientId:'id',clientSecret:'secret',redirectUri:'http://127.0.0.1/callback'},async()=>new Response(JSON.stringify({access_token:'temporary'}),{status:200})),/did not issue a refresh token/);
});

test('Google adapter refreshes access token before Blogger draft creation',async()=>{
  const result=runReal(realFixture());
  const approved=approveBloggerPublication(createBloggerPreview(result.report,result.evidence,publishingConfig),{audience:'admin',action:'BLOGGER_APPROVE'});
  const calls:{url:string;init?:RequestInit}[]=[];
  const fakeFetch:typeof fetch=async(input,init)=>{
    calls.push({url:String(input),...(init?{init}:{})});
    if(String(input)===BLOGGER_TOKEN_ENDPOINT) return new Response(JSON.stringify({access_token:'refreshed-access-token'}),{status:200});
    if(init?.method!=='POST') return new Response(JSON.stringify({items:[]}),{status:200});
    return new Response(JSON.stringify({id:'DRAFT-REFRESH-1',url:'https://verified-blog.test/draft-refresh',status:'DRAFT'}),{status:200});
  };
  const env:Record<string,string>={BLOGGER_REFRESH_TOKEN:'refresh-value',BLOGGER_CLIENT_ID:'client-value',BLOGGER_CLIENT_SECRET:'secret-value',BLOGGER_OAUTH_TOKEN:'deprecated-value'};
  const adapter=new GoogleBloggerApiAdapter(name=>env[name],fakeFetch);
  const config={...publishingConfig,blogId:'blog-id'};
  const draft=await publishBloggerPublication(approved,adapter,config,{audience:'admin',action:'BLOGGER_PUBLISH'});
  assert.equal(draft.status,'DRAFT');
  assert.equal(calls.length,3);
  assert.equal(calls[0]!.url,BLOGGER_TOKEN_ENDPOINT);
  assert.equal((calls[0]!.init?.body as URLSearchParams).get('grant_type'),'refresh_token');
  assert.equal((calls[1]!.init?.headers as Record<string,string>).authorization,'Bearer refreshed-access-token');
  assert.match(calls[1]!.url,/status=draft/);
  assert.equal(calls[2]!.init?.method,'POST');
});

test('Google adapter blocks a second draft for the same trading day before posts.insert',async()=>{
  const result=runReal(realFixture());
  const approved=approveBloggerPublication(createBloggerPreview(result.report,result.evidence,publishingConfig),{audience:'admin',action:'BLOGGER_APPROVE'});
  const calls:{url:string;init?:RequestInit}[]=[];
  const fakeFetch:typeof fetch=async(input,init)=>{
    calls.push({url:String(input),...(init?{init}:{})});
    if(String(input)===BLOGGER_TOKEN_ENDPOINT) return new Response(JSON.stringify({access_token:'refreshed-access-token'}),{status:200});
    if(init?.method==='POST') throw new Error('posts.insert must not run for duplicate trading day');
    return new Response(JSON.stringify({items:[{id:'EXISTING-DRAFT',title:approved.title,status:'DRAFT'}]}),{status:200});
  };
  const env:Record<string,string>={BLOGGER_REFRESH_TOKEN:'refresh-value',BLOGGER_CLIENT_ID:'client-value',BLOGGER_CLIENT_SECRET:'secret-value'};
  const draft=await publishBloggerPublication(approved,new GoogleBloggerApiAdapter(name=>env[name],fakeFetch),{...publishingConfig,blogId:'blog-id'},{audience:'admin',action:'BLOGGER_PUBLISH'});
  assert.equal(draft.status,'DRAFT');
  assert.equal(draft.draftPostId,'EXISTING-DRAFT');
  assert.equal(draft.publicPostUrl,null);
  assert.equal(calls.some(call=>call.url.includes('/blogger/v3/')&&call.init?.method==='POST'),false);
  assert.match(draft.history.at(-1)?.reason??'',/duplicate draft creation blocked/);
});

test('refresh failure blocks Blogger publish without deprecated-token fallback',async()=>{
  const result=runReal(realFixture());
  const approved=approveBloggerPublication(createBloggerPreview(result.report,result.evidence,publishingConfig),{audience:'admin',action:'BLOGGER_APPROVE'});
  const calls:string[]=[];
  const fakeFetch:typeof fetch=async(input)=>{calls.push(String(input));return new Response('{}',{status:401});};
  const env:Record<string,string>={BLOGGER_REFRESH_TOKEN:'invalid-refresh',BLOGGER_CLIENT_ID:'client',BLOGGER_CLIENT_SECRET:'secret',BLOGGER_OAUTH_TOKEN:'deprecated-value'};
  const failed=await publishBloggerPublication(approved,new GoogleBloggerApiAdapter(name=>env[name],fakeFetch),{...publishingConfig,blogId:'blog-id'},{audience:'admin',action:'BLOGGER_PUBLISH'});
  assert.equal(failed.status,'FAILED');
  assert.equal(failed.publicPostUrl,null);
  assert.deepEqual(calls,[BLOGGER_TOKEN_ENDPOINT]);
  assert.doesNotMatch(JSON.stringify(failed),/invalid-refresh|deprecated-value/);
});

test('OAuth bootstrap self-tests then persists without logging or returning the token',async()=>{
  let stored='';
  let tokenCalls=0;
  const environment=(name:string)=>({BLOGGER_CLIENT_ID:'desktop-id',BLOGGER_CLIENT_SECRET:'desktop-secret',BLOGGER_BLOG_ID:'configured-blog'} as Record<string,string>)[name];
  const result=await runBloggerOAuthBootstrap({
    environment,
    openUrl:async authorizationUrl=>{
      const url=new URL(authorizationUrl);
      const callback=new URL(url.searchParams.get('redirect_uri')!);
      callback.searchParams.set('state',url.searchParams.get('state')!);
      callback.searchParams.set('code','callback-code');
      const response=await fetch(callback);
      assert.equal(response.status,200);
    },
    fetcher:async(input,init)=>{
      tokenCalls+=1;
      assert.equal(String(input),BLOGGER_TOKEN_ENDPOINT);
      const body=init?.body as URLSearchParams;
      if(tokenCalls===1) {
        assert.equal(body.get('code'),'callback-code');
        return new Response(JSON.stringify({refresh_token:'memory-only-token'}),{status:200});
      }
      assert.equal(body.get('grant_type'),'refresh_token');
      assert.equal(body.get('refresh_token'),'memory-only-token');
      return new Response(JSON.stringify({access_token:'discarded-access-token',expires_in:3600,scope:BLOGGER_OAUTH_SCOPE}),{status:200});
    },
    persistSecret:async secret=>{stored=secret;return secret;},
    timeoutMs:2_000
  });
  assert.equal(stored,'memory-only-token');
  assert.equal(tokenCalls,2);
  assert.equal(result.refreshTokenStored,true);
  assert.equal(result.oauthCodeExchange,'PASS');
  assert.equal(result.refreshTokenReceived,'YES');
  assert.equal(result.immediateRefreshSelfTest,'PASS');
  assert.equal(result.expiresIn,3600);
  assert.equal(result.scope,BLOGGER_OAUTH_SCOPE);
  assert.equal(result.tokenFingerprintMatch,'YES');
  assert.equal(result.storedTokenCrLfContamination,'NO');
  assert.equal(result.storedTokenSurroundingQuoteContamination,'NO');
  assert.doesNotMatch(JSON.stringify(result),/memory-only-token|discarded-access-token|desktop-secret/);
});

test('OAuth denial stops before token exchange and secret storage',async()=>{
  let tokenCalls=0;
  let storeCalls=0;
  const environment=(name:string)=>({BLOGGER_CLIENT_ID:'desktop-id',BLOGGER_CLIENT_SECRET:'desktop-secret',BLOGGER_BLOG_ID:'configured-blog'} as Record<string,string>)[name];
  await assert.rejects(()=>runBloggerOAuthBootstrap({
    environment,
    openUrl:async authorizationUrl=>{
      const url=new URL(authorizationUrl);
      const callback=new URL(url.searchParams.get('redirect_uri')!);
      callback.searchParams.set('state',url.searchParams.get('state')!);
      callback.searchParams.set('error','access_denied');
      await fetch(callback);
    },
    fetcher:async()=>{tokenCalls+=1;return new Response('{}',{status:200});},
    persistSecret:async secret=>{storeCalls+=1;return secret;},
    timeoutMs:2_000
  }),/authorization was denied/);
  assert.equal(tokenCalls,0);
  assert.equal(storeCalls,0);
});

test('immediate refresh self-test reports metadata without returning the access token',async()=>{
  const result=await testRefreshTokenImmediately({refreshToken:'memory-refresh',clientId:'desktop-id',clientSecret:'desktop-secret'},async(input,init)=>{
    assert.equal(String(input),BLOGGER_TOKEN_ENDPOINT);
    const body=init?.body as URLSearchParams;
    assert.equal(body.get('grant_type'),'refresh_token');
    assert.equal(body.get('refresh_token'),'memory-refresh');
    return new Response(JSON.stringify({access_token:'must-not-escape',expires_in:3599,scope:BLOGGER_OAUTH_SCOPE}),{status:200});
  });
  assert.deepEqual(result,{expiresIn:3599,scope:BLOGGER_OAUTH_SCOPE});
  assert.doesNotMatch(JSON.stringify(result),/must-not-escape|memory-refresh|desktop-secret/);
});

test('OAuth bootstrap does not persist when immediate refresh self-test fails',async()=>{
  let tokenCalls=0;
  let persistCalls=0;
  const environment=(name:string)=>({BLOGGER_CLIENT_ID:'desktop-id',BLOGGER_CLIENT_SECRET:'desktop-secret',BLOGGER_BLOG_ID:'configured-blog'} as Record<string,string>)[name];
  await assert.rejects(()=>runBloggerOAuthBootstrap({
    environment,
    openUrl:async authorizationUrl=>{
      const url=new URL(authorizationUrl);
      const callback=new URL(url.searchParams.get('redirect_uri')!);
      callback.searchParams.set('state',url.searchParams.get('state')!);
      callback.searchParams.set('code','callback-code');
      await fetch(callback);
    },
    fetcher:async()=>{
      tokenCalls+=1;
      if(tokenCalls===1) return new Response(JSON.stringify({refresh_token:'unpersisted-token'}),{status:200});
      return new Response(JSON.stringify({error:'invalid_grant',error_description:'Bad Request'}),{status:400});
    },
    persistSecret:async secret=>{persistCalls+=1;return secret;},
    timeoutMs:2_000
  }),/immediate refresh self-test failed \(400\): invalid_grant - Bad Request/);
  assert.equal(tokenCalls,2);
  assert.equal(persistCalls,0);
});

test('OAuth bootstrap detects fingerprint mismatch and stored-token contamination',async()=>{
  let tokenCalls=0;
  const environment=(name:string)=>({BLOGGER_CLIENT_ID:'desktop-id',BLOGGER_CLIENT_SECRET:'desktop-secret',BLOGGER_BLOG_ID:'configured-blog'} as Record<string,string>)[name];
  const result=await runBloggerOAuthBootstrap({
    environment,
    openUrl:async authorizationUrl=>{
      const url=new URL(authorizationUrl);
      const callback=new URL(url.searchParams.get('redirect_uri')!);
      callback.searchParams.set('state',url.searchParams.get('state')!);
      callback.searchParams.set('code','callback-code');
      await fetch(callback);
    },
    fetcher:async()=>{
      tokenCalls+=1;
      return tokenCalls===1
        ?new Response(JSON.stringify({refresh_token:'clean-token'}),{status:200})
        :new Response(JSON.stringify({access_token:'discarded',expires_in:3600,scope:BLOGGER_OAUTH_SCOPE}),{status:200});
    },
    persistSecret:async()=>"'clean-token\n'",
    timeoutMs:2_000
  });
  assert.equal(result.tokenFingerprintMatch,'NO');
  assert.equal(result.storedTokenCrLfContamination,'YES');
  assert.equal(result.storedTokenSurroundingQuoteContamination,'YES');
});

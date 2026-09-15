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
import { renderA4MasterOnDemand } from '../src/services/a4-visual.js';
import { publicCanRenderA4 } from '../src/services/admin.js';
import { approveBloggerPublication, assertPublicBloggerHtmlSafe, ConfiguredBloggerAdapter, createBloggerPreview, DryRunBloggerAdapter, GoogleBloggerApiAdapter, publishBloggerPublication, renderPublishingConsole, resolveBloggerUrl, type BloggerPublishingConfig } from '../src/services/blogger.js';
import { BLOGGER_OAUTH_SCOPE, BLOGGER_TOKEN_ENDPOINT, buildBloggerAuthorizationUrl, exchangeAuthorizationCode, readBloggerOAuthEnvironment, runBloggerOAuthBootstrap, testRefreshTokenImmediately } from '../src/services/blogger-oauth.js';
const read=(p:string):unknown=>JSON.parse(readFileSync(p,'utf8'));
const fixture=()=>structuredClone(read('data/fixtures/sample-day.json') as InputBundle);
const realFixture=()=>structuredClone(read('data/manual/2026-09-11/input.json') as InputBundle);
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
  assert.ok(terms.length<=8);
  for(const term of terms) {
    assert.ok(term.evergreenKey.startsWith('term-'));
    assert.match(term.explanation,/입니다|말합니다|뜻합니다/);
  }
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
  assert.match(preview.title,/^MOTUS Daily Market \| 2026-09-11/);
  assert.equal(preview.postUrl,null);
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
  assert.match(preview.html,/<meta name="description"/);
  assert.match(preview.html,/용어 해설/);
  assert.match(preview.html,/관련 글/);
  assert.match(preview.html,/출처/);
  assertPublicBloggerHtmlSafe(preview.html);
  assert.doesNotMatch(preview.html,/CLAIM-|AUTO_VALIDATED|confidenceScore|verificationStatus|\/admin\/blogger/);
});
test('Sprint 2G Blogger state transition, dry-run publish and credential failure are safe',async()=>{
  const result=runReal(realFixture());
  const preview=createBloggerPreview(result.report,result.evidence,publishingConfig);
  const approved=approveBloggerPublication(preview,{audience:'admin',action:'BLOGGER_APPROVE'});
  assert.equal(approved.status,'APPROVED');
  const dryRun=await publishBloggerPublication(approved,new DryRunBloggerAdapter(),publishingConfig,{audience:'admin',action:'BLOGGER_PUBLISH'},{dryRun:true});
  assert.equal(dryRun.status,'APPROVED');
  assert.equal(dryRun.dryRun,true);
  assert.equal(dryRun.postUrl,null);
  const failed=await publishBloggerPublication(approved,new DryRunBloggerAdapter(),publishingConfig,{audience:'admin',action:'BLOGGER_PUBLISH'});
  assert.equal(failed.status,'FAILED');
  assert.equal(failed.error,'missing credential');
});
test('Sprint 2G Blogger publish stores real adapter URL and prevents duplicate publish',async()=>{
  const result=runReal(realFixture());
  const approved=approveBloggerPublication(createBloggerPreview(result.report,result.evidence,publishingConfig),{audience:'admin',action:'BLOGGER_APPROVE'});
  const adapter=new ConfiguredBloggerAdapter(async record=>({url:`https://real-blog.test/posts/${record.slug}`,providerPostId:'POST-1',publishedAt:'2026-09-14T00:12:00+09:00'}));
  const published=await publishBloggerPublication(approved,adapter,{...publishingConfig,credentialAvailable:true},{audience:'admin',action:'BLOGGER_PUBLISH'});
  assert.equal(published.status,'PUBLISHED');
  assert.equal(published.postUrl,'https://real-blog.test/posts/daily-market-2026-09-11');
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
  const published={...preview,status:'PUBLISHED' as const,postUrl:'https://real-blog.test/posts/daily-market-2026-09-11'};
  const after=await renderA4MasterOnDemand(result.report,result.evidence,dir,{audience:'admin',action:'A4_REPORT_RENDER'},{regenerate:true,bloggerRecord:published,publishingConfig});
  assert.equal(after.layout.qrTargetUrl,published.postUrl);
  assert.equal(after.naverPackage.googleBloggerUrl,published.postUrl);
  const naver=JSON.parse(readFileSync(after.naverPackagePath,'utf8')) as Record<string,string|string[]>;
  assert.equal(naver.googleBloggerUrl,published.postUrl);
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

test('Sprint 2H Google adapter creates an approved Blogger post as draft and preserves editorial metadata',async()=>{
  const result=runReal(realFixture());
  const approved=approveBloggerPublication(createBloggerPreview(result.report,result.evidence,publishingConfig),{audience:'admin',action:'BLOGGER_APPROVE'});
  let requestUrl='';
  let requestInit:RequestInit|undefined;
  const fakeFetch:typeof fetch=async(input,init)=>{
    requestUrl=String(input);
    requestInit=init;
    return new Response(JSON.stringify({id:'DRAFT-POST-1',url:'https://verified-blog.test/2026/09/golden-day.html',status:'DRAFT',updated:'2026-09-15T01:30:00Z'}),{status:200,headers:{'content-type':'application/json'}});
  };
  const adapter=new GoogleBloggerApiAdapter(name=>name==='BLOGGER_OAUTH_TOKEN'?'secret-access-token':undefined,fakeFetch);
  const config={...publishingConfig,blogId:'123456789',credentialEnvironmentVariable:'BLOGGER_OAUTH_TOKEN',publishAsDraft:true};
  const draft=await publishBloggerPublication(approved,adapter,config,{audience:'admin',action:'BLOGGER_PUBLISH'});
  assert.equal(draft.status,'DRAFT');
  assert.equal(draft.providerPostId,'DRAFT-POST-1');
  assert.equal(draft.postUrl,'https://verified-blog.test/2026/09/golden-day.html');
  assert.deepEqual(resolveBloggerUrl(draft),{url:draft.postUrl,state:'DRAFT'});
  assert.match(requestUrl,/\/blogs\/123456789\/posts\?isDraft=true/);
  assert.equal((requestInit?.headers as Record<string,string>).authorization,'Bearer secret-access-token');
  const payload=JSON.parse(String(requestInit?.body)) as {title:string;content:string;labels?:string[];customMetaData?:string};
  assert.equal(payload.title,approved.title);
  assert.equal(payload.labels,undefined);
  assert.match(payload.content,/class="motus-editorial"/);
  assert.match(payload.content,/MOTUS \| What Moves the World/);
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
  assert.equal(withoutBlog.postUrl,null);
  assert.equal(withoutToken.postUrl,null);
  assert.equal(calls,0);
});

test('Sprint 2H A4 and Naver use an actual Blogger draft URL',async()=>{
  const result=runReal(realFixture());
  const dir=mkdtempSync(join(tmpdir(),'a4-2h-draft-'));
  const draft={...createBloggerPreview(result.report,result.evidence,publishingConfig),status:'DRAFT' as const,postUrl:'https://verified-blog.test/2026/09/golden-day.html',providerPostId:'DRAFT-POST-1'};
  const output=await renderA4MasterOnDemand(result.report,result.evidence,dir,{audience:'admin',action:'A4_REPORT_RENDER'},{regenerate:true,bloggerRecord:draft,publishingConfig});
  assert.equal(output.layout.qrTargetUrl,draft.postUrl);
  assert.equal(output.naverPackage.googleBloggerUrl,draft.postUrl);
  assert.match(output.naverPackage.intro,/MOTUS 초안 URL/);
});

test('MOTUS publisher stays separate from the market engine and supports global metadata categories',()=>{
  const result=runReal(realFixture());
  const preview=createBloggerPreview(result.report,result.evidence,publishingConfig);
  assert.deepEqual(publishingConfig.publisher.categories,[
    'Daily Market','AI & Industry','Global Company','Market / Investment Insight','Evergreen'
  ]);
  assert.match(preview.html,/MOTUS \| What Moves the World/);
  assert.match(preview.html,/<h1>MOTUS Daily Market \| 2026-09-11/);
  assert.match(preview.html,/https:\/\/motusnova\.blogspot\.com\/search\/label\/Evergreen/);
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
    return new Response(JSON.stringify({id:'DRAFT-REFRESH-1',url:'https://verified-blog.test/draft-refresh',status:'DRAFT'}),{status:200});
  };
  const env:Record<string,string>={BLOGGER_REFRESH_TOKEN:'refresh-value',BLOGGER_CLIENT_ID:'client-value',BLOGGER_CLIENT_SECRET:'secret-value',BLOGGER_OAUTH_TOKEN:'deprecated-value'};
  const adapter=new GoogleBloggerApiAdapter(name=>env[name],fakeFetch);
  const config={...publishingConfig,blogId:'blog-id'};
  const draft=await publishBloggerPublication(approved,adapter,config,{audience:'admin',action:'BLOGGER_PUBLISH'});
  assert.equal(draft.status,'DRAFT');
  assert.equal(calls.length,2);
  assert.equal(calls[0]!.url,BLOGGER_TOKEN_ENDPOINT);
  assert.equal((calls[0]!.init?.body as URLSearchParams).get('grant_type'),'refresh_token');
  assert.equal((calls[1]!.init?.headers as Record<string,string>).authorization,'Bearer refreshed-access-token');
});

test('refresh failure blocks Blogger publish without deprecated-token fallback',async()=>{
  const result=runReal(realFixture());
  const approved=approveBloggerPublication(createBloggerPreview(result.report,result.evidence,publishingConfig),{audience:'admin',action:'BLOGGER_APPROVE'});
  const calls:string[]=[];
  const fakeFetch:typeof fetch=async(input)=>{calls.push(String(input));return new Response('{}',{status:401});};
  const env:Record<string,string>={BLOGGER_REFRESH_TOKEN:'invalid-refresh',BLOGGER_CLIENT_ID:'client',BLOGGER_CLIENT_SECRET:'secret',BLOGGER_OAUTH_TOKEN:'deprecated-value'};
  const failed=await publishBloggerPublication(approved,new GoogleBloggerApiAdapter(name=>env[name],fakeFetch),{...publishingConfig,blogId:'blog-id'},{audience:'admin',action:'BLOGGER_PUBLISH'});
  assert.equal(failed.status,'FAILED');
  assert.equal(failed.postUrl,null);
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

import test from 'node:test';
import assert from 'node:assert/strict';
import type { BrokerageResearchItem } from '../src/intelligence/brokerage-research.js';
import type { KoreaMarketFact } from '../src/intelligence/korea-market.js';
import {
  buildCrossIntelligenceChains,
  buildCrossIntelligenceNewsletterEntries,
  type CrossAISummary,
  type CrossIntelligenceInput,
  type CrossSignalHistory
} from '../src/intelligence/cross-intelligence.js';
import { INTELLIGENCE_SCHEMA_VERSION, type ResearchIntelligenceItem } from '../src/intelligence/schema.js';
import { createNewsletterViewModel } from '../src/intelligence/newsletter.js';
import { renderMotusDailyNewsletter } from '../src/publishers/motus-newsletter.js';

const time='2026-09-29T01:00:00Z';
const options={createdAt:'2026-09-29T02:00:00Z'} as const;
const intelligence=(overrides:Partial<ResearchIntelligenceItem>={}):ResearchIntelligenceItem=>({
  schemaVersion:INTELLIGENCE_SCHEMA_VERSION,intelligenceId:'intel:ai:sample',contentType:'AI_INTELLIGENCE',sourceType:'OFFICIAL',source:'공식 AI 자료',publisher:'Sample AI',analyst:null,
  publishedAt:time,collectedAt:'2026-09-29T01:10:00Z',market:'GLOBAL',country:'US',region:'North America',companyId:'company:sample-ai',company:'Sample AI',ticker:null,
  sector:'반도체',industry:'AI 반도체',themeId:'theme:ai-infrastructure',theme:'AI Infrastructure',relatedThemeIds:[],eventId:'event:ai-capex-2026',parentEventId:null,
  relatedCompanies:[],relatedSectors:['반도체'],relatedMarkets:['KR'],headline:'AI 인프라 투자 확대',summary:'공식 자료에서 확인된 AI 투자 신호.',claimIds:['CLAIM-AI'],evidenceIds:['EVIDENCE-SHARED'],
  stance:'BULLISH',targetPrice:null,rating:null,ratingChange:null,targetPriceChange:null,institutionView:null,aiInterpretation:'공식 사실과 분리된 AI 연결 후보 해석.',
  sourceUrl:'https://example.org/ai/source',verificationStatus:'VERIFIED',confidence:88,validityHorizon:'MEDIUM_TERM',
  provenance:{legacyReportId:null,inputSha256:null,adapterVersion:'fixture',sources:[{evidenceId:'EVIDENCE-SHARED',sourceType:'OFFICIAL',sourceId:'SOURCE-SHARED',sourceUrl:'https://example.org/ai/source',observedAt:time,collectedAt:'2026-09-29T01:10:00Z',verificationStatus:'VERIFIED',fieldProvenance:{}}]},...overrides
});
const wallStreet=(overrides:Partial<ResearchIntelligenceItem>={}):ResearchIntelligenceItem=>intelligence({
  intelligenceId:'intel:wall:sample',contentType:'WALL_STREET_INTELLIGENCE',sourceType:'SELL_SIDE_RESEARCH',source:'미국 기관 리서치',publisher:'Sample Wall Street',analyst:'Analyst',
  headline:'AI 투자에 대한 기관 관점',claimIds:['CLAIM-WALL'],institutionView:'기관은 AI 투자 확대를 긍정적으로 평가.',aiInterpretation:null,confidence:82,
  sourceUrl:'https://example.org/wall/source',provenance:{legacyReportId:null,inputSha256:null,adapterVersion:'fixture',sources:[{evidenceId:'EVIDENCE-SHARED',sourceType:'SELL_SIDE_RESEARCH',sourceId:'SOURCE-SHARED',sourceUrl:'https://example.org/wall/source',observedAt:time,collectedAt:'2026-09-29T01:15:00Z',verificationStatus:'VERIFIED',fieldProvenance:{}}]},...overrides
});
const brokerage=(overrides:Partial<BrokerageResearchItem>={}):BrokerageResearchItem=>({
  researchId:'research:korea:sample',institutionId:'samsung-securities',publisher:'삼성증권',analyst:'홍길동',publishedAt:'2026-09-29T09:00:00+09:00',collectedAt:'2026-09-29T09:10:00+09:00',
  researchType:'INDUSTRY_REPORT',headline:'한국 반도체 업종 전략',summary:'국내 반도체 업종에 대한 기관 요약.',market:'KR',sector:'반도체',industry:'반도체',companyId:'company:sample-ai',company:'샘플반도체',ticker:'000000',
  themeId:'theme:ai-infrastructure',eventId:'event:ai-capex-2026',institutionView:'AI 설비투자 확대가 한국 반도체 수요에 긍정적이라는 기관 관점.',
  evidence:[{evidenceId:'EVIDENCE-KR',text:'기관 원문의 업종 전망.',sourceRecordId:'KR-PDF-1',sourceUrl:'https://example.org/korea/report.pdf',page:'3',section:'산업 전망'}],
  targetPrice:null,previousTargetPrice:null,targetPriceChange:'UNKNOWN',rating:'BUY',previousRating:'HOLD',ratingChange:'UPGRADE',investmentStrategy:['실적 확인'],riskFactors:['투자 지연'],
  aiInterpretation:'기관 관점과 분리된 MOTUS 해석.',sourceUrl:'https://example.org/korea/report.pdf',verificationStatus:'VERIFIED',
  provenance:[{sourceRecordId:'KR-PDF-1',sourceKind:'OFFICIAL_PDF',sourceFormat:'PDF',sourceUrl:'https://example.org/korea/report.pdf',publishedAt:'2026-09-29T09:00:00+09:00',collectedAt:'2026-09-29T09:10:00+09:00',page:'3',section:'산업 전망',extractedFields:['institutionView']}],...overrides
});
const marketFact=(overrides:Partial<KoreaMarketFact>={}):KoreaMarketFact=>({
  factId:'kr-fact:sector-semiconductors',factType:'SECTOR_CHANGE_PCT',marketId:'KOSPI',investorType:null,sectorId:'sector:semiconductors',sectorLabel:'반도체',
  companyId:null,company:null,ticker:null,value:1.2,unit:'PERCENT',observedAt:'2026-09-29T06:30:00Z',collectedAt:'2026-09-29T06:35:00Z',sourceCategory:'KRX',source:'KRX fixture',sourceUrl:'https://example.org/krx/sector',
  verificationStatus:'VERIFIED',relationships:{eventIds:['event:ai-capex-2026'],themeIds:['theme:ai-infrastructure'],companyIds:[],sectorIds:['sector:semiconductors']},
  provenance:{sourceRecordId:'KRX-SECTOR-1',sourceCategory:'KRX',source:'KRX fixture',sourceUrl:'https://example.org/krx/sector',observedAt:'2026-09-29T06:30:00Z',collectedAt:'2026-09-29T06:35:00Z',originalMarket:'KOSPI',originalInvestor:null,originalSector:'반도체',originalValue:1.2,originalUnit:'PERCENT',normalization:'identity: PERCENT'},...overrides
});
const input=(overrides:Partial<CrossIntelligenceInput>={}):CrossIntelligenceInput=>({aiIntelligence:[],wallStreetIntelligence:[],koreaResearch:[],koreaMarketFacts:[],...overrides});

test('Sprint 3E links exact event IDs first and preserves edge provenance',()=>{
  const chains=buildCrossIntelligenceChains(input({aiIntelligence:[intelligence()],wallStreetIntelligence:[wallStreet()]}),options);
  assert.equal(chains.length,1); const chain=chains[0]!; assert.equal(chain.eventId,'event:ai-capex-2026');
  assert.deepEqual(chain.aiIntelligenceIds,['intel:ai:sample']); assert.deepEqual(chain.wallStreetIntelligenceIds,['intel:wall:sample']);
  assert.equal(chain.edgeProvenance[0]!.reason,'EVENT_ID'); assert.deepEqual(chain.edgeProvenance[0]!.matchedIds,['event:ai-capex-2026']);
  assert.deepEqual(chain.edgeProvenance[0]!.evidenceIds,['EVIDENCE-SHARED']); assert.deepEqual(chain.edgeProvenance[0]!.sourceIds,['SOURCE-SHARED']);
});

test('Sprint 3E links canonical theme IDs when neither item has an event',()=>{
  const chains=buildCrossIntelligenceChains(input({aiIntelligence:[intelligence({eventId:null})],koreaResearch:[brokerage({eventId:null,companyId:null,company:null,sector:null})]}),options);
  assert.equal(chains.length,1); assert.equal(chains[0]!.edgeProvenance[0]!.reason,'THEME_ID'); assert.equal(chains[0]!.primaryThemeId,'theme:ai-infrastructure');
});

test('Sprint 3E links company IDs deterministically',()=>{
  const ai=intelligence({eventId:null,themeId:'theme:ai-one',relatedThemeIds:[],sector:null,relatedSectors:[]});
  const research=brokerage({eventId:null,themeId:'theme:ai-two',sector:null});
  const chain=buildCrossIntelligenceChains(input({aiIntelligence:[ai],koreaResearch:[research]}),options)[0]!;
  assert.equal(chain.edgeProvenance[0]!.reason,'COMPANY_ID'); assert.deepEqual(chain.companies,['company:sample-ai']);
});

test('Sprint 3E links canonical sector IDs deterministically',()=>{
  const research=brokerage({eventId:null,themeId:null,companyId:null,company:null,ticker:null});
  const fact=marketFact({relationships:{eventIds:[],themeIds:[],companyIds:[],sectorIds:['sector:semiconductors']}});
  const chain=buildCrossIntelligenceChains(input({koreaResearch:[research],koreaMarketFacts:[fact]}),options)[0]!;
  assert.equal(chain.edgeProvenance[0]!.reason,'SECTOR_ID'); assert.deepEqual(chain.sectors,['sector:semiconductors']);
});

test('Sprint 3E keeps unrelated events separate even when themes match',()=>{
  const chains=buildCrossIntelligenceChains(input({aiIntelligence:[intelligence()],wallStreetIntelligence:[wallStreet({eventId:'event:other-ai-event'})]}),options);
  assert.equal(chains.length,2); assert.ok(chains.every(chain=>chain.edgeProvenance.length===0));
});

test('Sprint 3E rejects time-only linkage',()=>{
  const ai=intelligence({eventId:null,themeId:'theme:one',companyId:null,sector:null,relatedSectors:[],relatedMarkets:[]});
  const wall=wallStreet({eventId:null,themeId:'theme:two',companyId:null,sector:null,relatedSectors:[],relatedMarkets:[],evidenceIds:['EVIDENCE-WALL'],provenance:{legacyReportId:null,inputSha256:null,adapterVersion:'fixture',sources:[{evidenceId:'EVIDENCE-WALL',sourceType:'SELL_SIDE_RESEARCH',sourceId:'SOURCE-WALL',sourceUrl:'https://example.org/wall/source',observedAt:time,collectedAt:time,verificationStatus:'VERIFIED',fieldProvenance:{}}]}});
  const chains=buildCrossIntelligenceChains(input({aiIntelligence:[ai],wallStreetIntelligence:[wall]}),{...options,timeWindowHours:168});
  assert.equal(chains.length,2); assert.ok(chains.every(chain=>chain.edgeProvenance.length===0));
});

test('Sprint 3E creates shared and divergent signals without ranking',()=>{
  const shared=buildCrossIntelligenceChains(input({aiIntelligence:[intelligence()],wallStreetIntelligence:[wallStreet()]}),options)[0]!;
  assert.equal(shared.sharedSignals.length,1); assert.equal(shared.sharedSignals[0]!.direction,'POSITIVE'); assert.equal(shared.divergentSignals.length,0);
  const divergent=buildCrossIntelligenceChains(input({aiIntelligence:[intelligence()],wallStreetIntelligence:[wallStreet({stance:'BEARISH'})]}),options)[0]!;
  assert.equal(divergent.sharedSignals.length,0); assert.deepEqual(divergent.divergentSignals[0]!.directions,['POSITIVE','NEGATIVE']);
});

test('Sprint 3E emits changedSignals only with explicit history',()=>{
  const prior:CrossSignalHistory={node:{kind:'AI_INTELLIGENCE',id:'intel:ai:sample'},signalKey:'THEME:theme:ai-infrastructure',label:'이전 AI 관측',direction:'NEGATIVE',observedAt:'2026-09-28T01:00:00Z'};
  const withHistory=buildCrossIntelligenceChains(input({aiIntelligence:[intelligence()],history:[prior]}),options)[0]!;
  assert.equal(withHistory.changedSignals.length,1); assert.equal(withHistory.changedSignals[0]!.previous,'NEGATIVE'); assert.equal(withHistory.changedSignals[0]!.current,'POSITIVE');
  const withoutHistory=buildCrossIntelligenceChains(input({aiIntelligence:[intelligence()]}),options)[0]!;
  assert.deepEqual(withoutHistory.changedSignals,[]);
});

test('Sprint 3E keeps supplied AI summary separate with explicit provenance',()=>{
  const aiSummary:CrossAISummary={summary:'공통점과 차이점을 정리한 별도 AI 요약.',commonalitySummary:'AI 투자 확대 신호.',differenceSummary:'시장 반응 강도 차이.',followUpChecks:['실제 CAPEX 집행 확인'],provenance:{generator:'fixture-ai-summary',generatedAt:'2026-09-29T02:00:00Z',sourceNodeIds:['intel:ai:sample','intel:wall:sample']}};
  const chain=buildCrossIntelligenceChains(input({aiIntelligence:[intelligence()],wallStreetIntelligence:[wallStreet()]}),{...options,aiSummariesByEventId:{'event:ai-capex-2026':aiSummary}})[0]!;
  assert.deepEqual(chain.aiSummary,aiSummary); assert.notEqual(chain.aiSummary!.summary,chain.stageSummaries.aiIndustry[0]);
  assert.match(chain.stageSummaries.wallStreet[0]!,/기관 관점/);
});

test('Sprint 3E renders the optional Cross Intelligence flow without internal IDs',()=>{
  const chains=buildCrossIntelligenceChains(input({aiIntelligence:[intelligence()],wallStreetIntelligence:[wallStreet()],koreaResearch:[brokerage()],koreaMarketFacts:[marketFact()]}),options);
  const entries=buildCrossIntelligenceNewsletterEntries(chains);
  const model=createNewsletterViewModel({newsletterId:'newsletter:cross:fixture',issueDate:'2026-09-29',issueNumber:6,title:'MOTUS Daily Intelligence',subtitle:'Cross Intelligence',editorialSummary:'검증된 연결 구조.',crossIntelligenceChains:entries,sources:[],assets:[]});
  const rendered=renderMotusDailyNewsletter(model); assert.ok(rendered.renderedSections.includes('cross-intelligence'));
  assert.match(rendered.html,/Theme · ai infrastructure[\s\S]*AI &amp; Industry[\s\S]*Wall Street[\s\S]*Korea Research[\s\S]*Korea Market Reaction/);
  assert.equal((rendered.html.match(/data-cross-stage=/g)??[]).length,4); assert.doesNotMatch(rendered.html,/event:ai-capex|intel:ai|research:korea|kr-fact|cross:/);
});

test('Sprint 3E omits empty stages and rejects an internal ID in public output',()=>{
  const chain=buildCrossIntelligenceChains(input({aiIntelligence:[intelligence()]}),options);
  const entries=buildCrossIntelligenceNewsletterEntries(chain); assert.deepEqual(entries[0]!.wallStreet,[]); assert.deepEqual(entries[0]!.koreaResearch,[]);
  entries[0]!.connectionSummary='eventId must not leak';
  const model=createNewsletterViewModel({newsletterId:'newsletter:cross:leak',issueDate:'2026-09-29',issueNumber:7,title:'MOTUS Daily Intelligence',subtitle:'Leakage guard',editorialSummary:'내부 ID 차단.',crossIntelligenceChains:entries,sources:[],assets:[]});
  assert.throws(()=>renderMotusDailyNewsletter(model),/internal token/);
});

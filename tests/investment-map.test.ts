import test from 'node:test';
import assert from 'node:assert/strict';
import type { BrokerageResearchItem } from '../src/intelligence/brokerage-research.js';
import type { KoreaMarketFact } from '../src/intelligence/korea-market.js';
import { buildCrossIntelligenceChains } from '../src/intelligence/cross-intelligence.js';
import {
  buildInvestmentMap,
  buildInvestmentMapA4CompactView,
  buildInvestmentMapNewsletterView,
  type InvestmentMapInput
} from '../src/intelligence/investment-map.js';
import { INTELLIGENCE_SCHEMA_VERSION, type ResearchIntelligenceItem } from '../src/intelligence/schema.js';
import { createNewsletterViewModel } from '../src/intelligence/newsletter.js';
import { renderMotusDailyNewsletter } from '../src/publishers/motus-newsletter.js';

const generatedAt='2026-09-30T00:00:00Z';
const options={issueDate:'2026-09-30',generatedAt} as const;
const intelligence=(overrides:Partial<ResearchIntelligenceItem>={}):ResearchIntelligenceItem=>({
  schemaVersion:INTELLIGENCE_SCHEMA_VERSION,intelligenceId:'intel:wall:ai-infra',contentType:'WALL_STREET_INTELLIGENCE',sourceType:'SELL_SIDE_RESEARCH',source:'Global Research',publisher:'Global Securities',analyst:'Analyst',
  publishedAt:'2026-09-29T13:00:00Z',collectedAt:'2026-09-29T13:10:00Z',market:'US',country:'US',region:'North America',companyId:'company:nvidia',company:'NVIDIA',ticker:'NVDA',sector:'Semiconductors',industry:'AI chips',
  themeId:'theme:ai-infrastructure',theme:'AI Infrastructure',relatedThemeIds:[],eventId:'event:ai-capex-2026',parentEventId:null,relatedCompanies:[],relatedSectors:[],relatedMarkets:['KR'],
  headline:'AI infrastructure institutional view',summary:'Institutional research summary.',claimIds:['CLAIM-WALL'],evidenceIds:['EVIDENCE-WALL'],stance:'BULLISH',targetPrice:null,rating:null,ratingChange:null,targetPriceChange:null,
  institutionView:'AI CAPEX supports semiconductor demand.',aiInterpretation:null,sourceUrl:'https://example.org/wall/ai-infra',verificationStatus:'VERIFIED',confidence:84,validityHorizon:'MEDIUM_TERM',
  provenance:{legacyReportId:null,inputSha256:null,adapterVersion:'fixture',sources:[{evidenceId:'EVIDENCE-WALL',sourceType:'SELL_SIDE_RESEARCH',sourceId:'SOURCE-WALL',sourceUrl:'https://example.org/wall/ai-infra',observedAt:'2026-09-29T13:00:00Z',collectedAt:'2026-09-29T13:10:00Z',verificationStatus:'VERIFIED',fieldProvenance:{}}]},...overrides
});
const brokerage=(overrides:Partial<BrokerageResearchItem>={}):BrokerageResearchItem=>({
  researchId:'research:samsung:nvidia',institutionId:'samsung-securities',publisher:'삼성증권',analyst:'홍길동',publishedAt:'2026-09-30T08:00:00+09:00',collectedAt:'2026-09-30T08:10:00+09:00',researchType:'COMPANY_REPORT',
  headline:'AI 반도체 기업 리포트',summary:'공개 리서치 요약.',market:'KR',sector:'반도체',industry:'AI 반도체',companyId:'company:nvidia',company:'NVIDIA',ticker:'NVDA',themeId:'theme:ai-infrastructure',eventId:'event:ai-capex-2026',
  institutionView:'AI 설비투자가 반도체 수요를 지지한다는 기관 관점.',evidence:[{evidenceId:'EVIDENCE-KR',text:'원문 근거.',sourceRecordId:'KR-PDF-1',sourceUrl:'https://example.org/korea/nvidia.pdf',page:'3',section:'전망'}],
  targetPrice:{value:210000,currency:'KRW'},previousTargetPrice:{value:190000,currency:'KRW'},targetPriceChange:'UP',rating:'BUY',previousRating:'HOLD',ratingChange:'UPGRADE',
  investmentStrategy:['실적 발표 확인 후 대응'],riskFactors:['AI CAPEX 집행 지연'],aiInterpretation:null,sourceUrl:'https://example.org/korea/nvidia.pdf',verificationStatus:'VERIFIED',
  provenance:[{sourceRecordId:'KR-PDF-1',sourceKind:'OFFICIAL_PDF',sourceFormat:'PDF',sourceUrl:'https://example.org/korea/nvidia.pdf',publishedAt:'2026-09-30T08:00:00+09:00',collectedAt:'2026-09-30T08:10:00+09:00',page:'3',section:'전망',extractedFields:['targetPrice','rating','riskFactors']}],...overrides
});
const ai=(overrides:Partial<ResearchIntelligenceItem>={}):ResearchIntelligenceItem=>intelligence({
  intelligenceId:'intel:ai:power',contentType:'AI_INTELLIGENCE',sourceType:'OFFICIAL',source:'AI Company',publisher:'AI Company',analyst:null,companyId:null,company:null,ticker:null,
  themeId:'theme:data-center-power',theme:'Data Center Power',eventId:'event:power-capex',headline:'Data center power expansion',claimIds:['CLAIM-AI'],evidenceIds:['EVIDENCE-AI'],institutionView:null,aiInterpretation:'공식 사실과 분리된 연결 해석.',
  sourceUrl:'https://example.org/ai/power',provenance:{legacyReportId:null,inputSha256:null,adapterVersion:'fixture',sources:[{evidenceId:'EVIDENCE-AI',sourceType:'OFFICIAL',sourceId:'SOURCE-AI',sourceUrl:'https://example.org/ai/power',observedAt:'2026-09-29T13:00:00Z',collectedAt:'2026-09-29T13:10:00Z',verificationStatus:'VERIFIED',fieldProvenance:{}}]},...overrides
});
const emptyInput=(overrides:Partial<InvestmentMapInput>={}):InvestmentMapInput=>({brokerageResearch:[],wallStreetIntelligence:[],crossIntelligence:[],aiIntelligence:[],...overrides});

test('Sprint 3F dedupes research before every count',()=>{
  const original=brokerage(); const duplicate=brokerage({sourceUrl:'https://example.org/korea/nvidia.pdf?utm_source=mirror'});
  const map=buildInvestmentMap(emptyInput({brokerageResearch:[original,duplicate]}),options);
  assert.equal(map.researchItemCount,1); assert.equal(map.koreaResearchFocus.find(item=>item.key==='theme:ai-infrastructure')!.mentionCount,1);
  assert.equal(map.provenance.duplicates.length,1); assert.equal(map.provenance.duplicates[0]!.reason,'SAME_RESEARCH_ID');
});

test('Sprint 3F aggregates Institutional Focus from deduped global institutions',()=>{
  const second=intelligence({intelligenceId:'intel:wall:ai-infra-2',publisher:'Second Securities',headline:'Second AI infrastructure view',sourceUrl:'https://example.net/wall/ai-infra',evidenceIds:['EVIDENCE-WALL-2'],provenance:{legacyReportId:null,inputSha256:null,adapterVersion:'fixture',sources:[{evidenceId:'EVIDENCE-WALL-2',sourceType:'SELL_SIDE_RESEARCH',sourceId:'SOURCE-WALL-2',sourceUrl:'https://example.net/wall/ai-infra',observedAt:'2026-09-29T13:00:00Z',collectedAt:'2026-09-29T13:10:00Z',verificationStatus:'VERIFIED',fieldProvenance:{}}]}});
  const map=buildInvestmentMap(emptyInput({wallStreetIntelligence:[intelligence(),second]}),options); const focus=map.institutionalFocus.find(item=>item.key==='theme:ai-infrastructure')!;
  assert.equal(focus.mentionCount,2); assert.equal(focus.institutionCount,2); assert.deepEqual(focus.supportingInstitutionNames,['Global Securities','Second Securities']);
});

test('Sprint 3F aggregates Korea Research Focus without repeated mentions in one report',()=>{
  const first=brokerage(); const repeated={...first,themeId:first.themeId};
  const second=brokerage({researchId:'research:nh:ai',institutionId:'nh-investment-securities',publisher:'NH투자증권',headline:'AI 반도체 산업 전략',sourceUrl:'https://example.org/nh/ai.pdf',provenance:[{...first.provenance[0]!,sourceRecordId:'NH-PDF-1',sourceUrl:'https://example.org/nh/ai.pdf'}]});
  const map=buildInvestmentMap(emptyInput({brokerageResearch:[first,repeated,second]}),options); const focus=map.koreaResearchFocus.find(item=>item.key==='theme:ai-infrastructure')!;
  assert.equal(focus.mentionCount,2); assert.equal(focus.institutionCount,2);
});

test('Sprint 3F detects themes supported by Wall Street and Korea Research',()=>{
  const cross=buildCrossIntelligenceChains({aiIntelligence:[],wallStreetIntelligence:[intelligence()],koreaResearch:[brokerage()],koreaMarketFacts:[]},{createdAt:generatedAt});
  const map=buildInvestmentMap(emptyInput({wallStreetIntelligence:[intelligence()],brokerageResearch:[brokerage()],crossIntelligence:cross}),options); const theme=map.crossMarketThemes.find(item=>item.key==='theme:ai-infrastructure')!;
  assert.equal(theme.mentionCount,2); assert.equal(theme.institutionCount,2); assert.deepEqual(map.provenance.crossIntelligenceIds,cross.map(item=>item.crossIntelligenceId));
});

test('Sprint 3F aggregates most discussed stocks without recommendation wording',()=>{
  const second=brokerage({researchId:'research:nh:nvidia',institutionId:'nh-investment-securities',publisher:'NH투자증권',headline:'NVIDIA 산업 점검',sourceUrl:'https://example.org/nh/nvidia.pdf',provenance:[{...brokerage().provenance[0]!,sourceRecordId:'NH-PDF-2',sourceUrl:'https://example.org/nh/nvidia.pdf'}]});
  const map=buildInvestmentMap(emptyInput({wallStreetIntelligence:[intelligence()],brokerageResearch:[brokerage(),second]}),options); const stock=map.mostDiscussedStocks[0]!;
  assert.equal(stock.companyId,'company:nvidia'); assert.equal(stock.mentionCount,3); assert.equal(stock.institutionCount,3); assert.equal(stock.majorReasons.length,2);
  assert.doesNotMatch(JSON.stringify(map),/매수 추천|매도 추천/);
});

test('Sprint 3F uses only structured target-price and rating changes',()=>{
  const map=buildInvestmentMap(emptyInput({brokerageResearch:[brokerage()]}),options);
  assert.deepEqual(map.targetPriceChanges[0]!.previousTargetPrice,{value:190000,currency:'KRW'}); assert.equal(map.targetPriceChanges[0]!.direction,'UP');
  assert.equal(map.ratingChanges[0]!.previousRating,'HOLD'); assert.equal(map.ratingChanges[0]!.rating,'BUY'); assert.equal(map.ratingChanges[0]!.ratingChange,'UPGRADE');
  const unknown=buildInvestmentMap(emptyInput({brokerageResearch:[brokerage({targetPrice:null,previousTargetPrice:null,targetPriceChange:'UNKNOWN',rating:null,previousRating:null,ratingChange:'UNKNOWN'})]}),options);
  assert.deepEqual(unknown.targetPriceChanges,[]); assert.deepEqual(unknown.ratingChanges,[]);
});

test('Sprint 3F emits emerging and attention changes only with history',()=>{
  const first=buildInvestmentMap(emptyInput({wallStreetIntelligence:[intelligence()]}),options);
  const current=buildInvestmentMap(emptyInput({wallStreetIntelligence:[intelligence(),intelligence({intelligenceId:'intel:wall:power',publisher:'Second Securities',headline:'Power infrastructure view',themeId:'theme:data-center-power',theme:'Data Center Power',eventId:'event:power',sourceUrl:'https://example.net/wall/power'})],history:first.historySnapshot}),{...options,issueDate:'2026-10-01',generatedAt:'2026-10-01T00:00:00Z',comparisonWindow:'DAILY'});
  assert.equal(current.comparisonWindow,'DAILY'); assert.ok(current.newlyEmergingThemes.some(item=>item.key==='theme:data-center-power'));
  assert.deepEqual(first.newlyEmergingThemes,[]); assert.deepEqual(first.increasedAttention,[]); assert.deepEqual(first.decreasedAttention,[]); assert.equal(first.comparisonWindow,null);
});

test('Sprint 3F aggregates only explicit institution risk factors and strategies',()=>{
  const second=brokerage({researchId:'research:nh:risk',institutionId:'nh-investment-securities',publisher:'NH투자증권',headline:'AI 투자 리스크',sourceUrl:'https://example.org/nh/risk.pdf',provenance:[{...brokerage().provenance[0]!,sourceRecordId:'NH-RISK-1',sourceUrl:'https://example.org/nh/risk.pdf'}]});
  const map=buildInvestmentMap(emptyInput({brokerageResearch:[brokerage(),second],aiIntelligence:[ai()]}),options); const risk=map.majorRisks.find(item=>item.label==='AI CAPEX 집행 지연')!;
  assert.equal(risk.mentionCount,2); assert.equal(risk.supportingInstitutions.length,2); assert.deepEqual(map.investmentStrategies[0]!.supportingInstitutions,['NH투자증권','삼성증권']);
  assert.equal(map.majorRisks.some(item=>item.label.includes('전력')),false);
});

test('Sprint 3F uses Market Fact only for linked reaction, never attention count',()=>{
  const fact:KoreaMarketFact={factId:'kr-fact:semi',factType:'SECTOR_CHANGE_PCT',marketId:'KOSPI',investorType:null,sectorId:'sector:semiconductors',sectorLabel:'반도체',companyId:null,company:null,ticker:null,value:1.5,unit:'PERCENT',observedAt:'2026-09-30T06:30:00Z',collectedAt:'2026-09-30T06:35:00Z',sourceCategory:'KRX',source:'KRX fixture',sourceUrl:'https://example.org/krx/semi',verificationStatus:'VERIFIED',relationships:{eventIds:['event:ai-capex-2026'],themeIds:['theme:ai-infrastructure'],companyIds:[],sectorIds:['sector:semiconductors']},provenance:{sourceRecordId:'KRX-SEMI',sourceCategory:'KRX',source:'KRX fixture',sourceUrl:'https://example.org/krx/semi',observedAt:'2026-09-30T06:30:00Z',collectedAt:'2026-09-30T06:35:00Z',originalMarket:'KOSPI',originalInvestor:null,originalSector:'반도체',originalValue:1.5,originalUnit:'PERCENT',normalization:'identity: PERCENT'}};
  const cross=buildCrossIntelligenceChains({aiIntelligence:[],wallStreetIntelligence:[intelligence()],koreaResearch:[],koreaMarketFacts:[fact]},{createdAt:generatedAt});
  const map=buildInvestmentMap(emptyInput({wallStreetIntelligence:[intelligence()],crossIntelligence:cross,koreaMarketFacts:[fact]}),options);
  assert.equal(map.institutionalFocus.find(item=>item.key==='theme:ai-infrastructure')!.mentionCount,1); assert.equal(map.marketReactions.length,1);
  assert.deepEqual(map.provenance.attentionExcludedMarketFactIds,['kr-fact:semi']); assert.deepEqual(map.provenance.marketReactionFactIds,['kr-fact:semi']);
});

test('Sprint 3F emits no arbitrary score or ranking',()=>{
  const map=buildInvestmentMap(emptyInput({wallStreetIntelligence:[intelligence()],brokerageResearch:[brokerage()]}),options);
  assert.doesNotMatch(JSON.stringify(map),/"(?:score|rank|ranking)"\s*:/i);
});

test('Sprint 3F renders actual Investment Map subsections without internal IDs',()=>{
  const map=buildInvestmentMap(emptyInput({wallStreetIntelligence:[intelligence()],brokerageResearch:[brokerage()]}),options); const view=buildInvestmentMapNewsletterView(map);
  const model=createNewsletterViewModel({newsletterId:'newsletter:investment-map',issueDate:'2026-09-30',issueNumber:8,title:'MOTUS Daily Intelligence',subtitle:'Investment Map',editorialSummary:'검증된 리서치 집계.',investmentMapV1:view,sources:[],assets:[]});
  const rendered=renderMotusDailyNewsletter(model); assert.ok(rendered.renderedSections.includes('investment-map'));
  assert.match(rendered.html,/Institutional Focus[\s\S]*Korea Research Focus[\s\S]*Cross-Market Themes[\s\S]*Most Discussed Stocks[\s\S]*Target Price \/ Rating Changes[\s\S]*Major Risks/);
  assert.doesNotMatch(rendered.html,/company:nvidia|theme:ai-infrastructure|research:samsung|investment-map:2026/);
});

test('Sprint 3F omits empty Newsletter Investment Map',()=>{
  const map=buildInvestmentMap(emptyInput(),options);const view=buildInvestmentMapNewsletterView(map);
  const model=createNewsletterViewModel({newsletterId:'newsletter:empty-map',issueDate:'2026-09-30',issueNumber:9,title:'MOTUS Daily Intelligence',subtitle:'Empty map',editorialSummary:'집계 없음.',investmentMapV1:view,sources:[],assets:[]});
  assert.equal(Object.hasOwn(model,'investmentMapV1'),false);assert.equal(renderMotusDailyNewsletter(model).renderedSections.includes('investment-map'),false);
});

test('Sprint 3F A4 compact view respects limits without splitting cutoff ties',()=>{
  const themes=['leader','tie-one','tie-two','tie-three'];const wall:ResearchIntelligenceItem[]=[];
  wall.push(intelligence({intelligenceId:'intel:leader:1',publisher:'Institution A',headline:'Leader one',themeId:'theme:leader',theme:'Leader',eventId:'event:leader-1',sourceUrl:'https://example.org/leader/1'}));
  wall.push(intelligence({intelligenceId:'intel:leader:2',publisher:'Institution B',headline:'Leader two',themeId:'theme:leader',theme:'Leader',eventId:'event:leader-2',sourceUrl:'https://example.org/leader/2'}));
  themes.slice(1).forEach((theme,index)=>wall.push(intelligence({intelligenceId:`intel:${theme}`,publisher:`Tie Institution ${index}`,headline:`${theme} report`,themeId:`theme:${theme}`,theme,eventId:`event:${theme}`,sourceUrl:`https://example.org/${theme}`})));
  const compact=buildInvestmentMapA4CompactView(buildInvestmentMap(emptyInput({wallStreetIntelligence:wall}),options));
  assert.equal(compact.institutionalFocus.length,2);assert.ok(compact.institutionalFocus.some(item=>item.label==='Leader'));assert.ok(compact.institutionalFocus.some(item=>item.label==='Semiconductors'));assert.ok(compact.institutionalFocus.length<=3);
  assert.ok(compact.koreaResearchFocus.length<=3);assert.ok(compact.crossMarketThemes.length<=3);assert.ok(compact.mostDiscussedStocks.length<=5);assert.ok(compact.majorRisks.length<=3);
});

test('Sprint 3F public leakage guard rejects internal Investment Map IDs',()=>{
  const map=buildInvestmentMap(emptyInput({wallStreetIntelligence:[intelligence()]}),options);const view=buildInvestmentMapNewsletterView(map);view.institutionalFocus[0]!.label='companyId must not leak';
  const model=createNewsletterViewModel({newsletterId:'newsletter:map-leak',issueDate:'2026-09-30',issueNumber:10,title:'MOTUS Daily Intelligence',subtitle:'Leak guard',editorialSummary:'내부 ID 차단.',investmentMapV1:view,sources:[],assets:[]});
  assert.throws(()=>renderMotusDailyNewsletter(model),/internal token/);
});

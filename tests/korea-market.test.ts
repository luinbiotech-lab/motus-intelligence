import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FixtureKoreaMarketAdapter,
  buildKoreaMarketNewsletterView,
  canonicalKoreaInvestorType,
  canonicalKoreaMarketId,
  canonicalKoreaSector,
  collectKoreaMarketFacts,
  normalizeKoreaMoney,
  runKoreaMarketIntake,
  type KoreaMarketRawRecord
} from '../src/intelligence/korea-market.js';
import { createNewsletterViewModel } from '../src/intelligence/newsletter.js';
import { renderMotusDailyNewsletter } from '../src/publishers/motus-newsletter.js';

const raw=(overrides:Partial<KoreaMarketRawRecord>={}):KoreaMarketRawRecord=>({
  sourceRecordId:'KRX-KOSPI-FIXTURE',factType:'INDEX_LEVEL',market:'KOSPI',investor:null,sectorKey:null,sectorLabel:null,
  companyKey:null,company:null,ticker:null,value:2750.25,unit:'INDEX_POINT',observedAt:'2026-09-29T06:30:00Z',collectedAt:'2026-09-29T06:35:00Z',
  sourceCategory:'KRX',source:'KRX 검증 fixture',sourceUrl:'https://example.org/krx/kospi',verificationStatus:'VERIFIED',
  relatedEventKeys:['korea-market-close-2026-09-29'],relatedThemeKeys:['korea-market'],relatedCompanyKeys:[],relatedSectorKeys:[],...overrides
});

test('Sprint 3C ingests canonical KOSPI and KOSDAQ market facts',()=>{
  const result=runKoreaMarketIntake([raw(),raw({sourceRecordId:'KRX-KOSDAQ-FIXTURE',market:'코스닥',value:850.75,sourceUrl:'https://example.org/krx/kosdaq'})]);
  assert.equal(result.rejected.length,0); assert.deepEqual(result.facts.map(fact=>fact.marketId),['KOSPI','KOSDAQ']);
  assert.ok(result.facts.every(fact=>fact.unit==='INDEX_POINT'));
  assert.equal(canonicalKoreaMarketId('KRX KOSPI'),'KOSPI');
});

test('Sprint 3C ingests USD/KRW without fabricating source fields',()=>{
  const result=runKoreaMarketIntake([raw({sourceRecordId:'BOK-USD-KRW-FIXTURE',factType:'FX_SPOT',market:'USD/KRW',value:1325.4,unit:'KRW_PER_USD',sourceCategory:'BOK_ECOS',source:'한국은행 ECOS fixture',sourceUrl:'https://example.org/bok/usd-krw'})]);
  assert.equal(result.rejected.length,0); const fact=result.facts[0]!;
  assert.equal(fact.marketId,'USD_KRW'); assert.equal(fact.value,1325.4); assert.equal(fact.unit,'KRW_PER_USD');
  assert.equal(fact.sourceUrl,'https://example.org/bok/usd-krw'); assert.equal(fact.observedAt,'2026-09-29T06:30:00Z');
});

test('Sprint 3C normalizes investor aliases and all money units to KRW_MILLION',()=>{
  const records=[
    raw({sourceRecordId:'FLOW-FOREIGN',factType:'INVESTOR_NET_FLOW',investor:'외국인',value:125.5,unit:'KRW_100M',sourceUrl:'https://example.org/flow/foreign'}),
    raw({sourceRecordId:'FLOW-INSTITUTION',factType:'INVESTOR_NET_FLOW',investor:'institution',value:5_000_000_000,unit:'KRW',sourceUrl:'https://example.org/flow/institution'}),
    raw({sourceRecordId:'FLOW-RETAIL',factType:'INVESTOR_NET_FLOW',investor:'개인',value:-750,unit:'KRW_MILLION',sourceUrl:'https://example.org/flow/retail'})
  ];
  const result=runKoreaMarketIntake(records);
  assert.deepEqual(result.facts.map(fact=>fact.investorType),['FOREIGN','INSTITUTION','RETAIL']);
  assert.deepEqual(result.facts.map(fact=>fact.value),[12550,5000,-750]);
  assert.ok(result.facts.every(fact=>fact.unit==='KRW_MILLION'));
  assert.equal(canonicalKoreaInvestorType('기관계'),'INSTITUTION');
  assert.deepEqual(normalizeKoreaMoney(1,'KRW_100M'),{value:100,unit:'KRW_MILLION',normalization:'KRW_100M × 100 = KRW_MILLION'});
});

test('Sprint 3C separates canonical sector ID from display label and prepares relationship IDs',()=>{
  const result=runKoreaMarketIntake([raw({sourceRecordId:'SECTOR-SEMICONDUCTOR',factType:'SECTOR_CHANGE_PCT',market:'KOSPI',sectorKey:'SEMICONDUCTORS',sectorLabel:'반도체',value:2.4,unit:'PERCENT',sourceUrl:'https://example.org/sector/semiconductors',relatedThemeKeys:['ai-semiconductors'],relatedCompanyKeys:['samsung-electronics'],relatedSectorKeys:['SEMICONDUCTORS']})]);
  const fact=result.facts[0]!;
  assert.equal(fact.sectorId,'sector:semiconductors'); assert.equal(fact.sectorLabel,'반도체');
  assert.deepEqual(fact.relationships.themeIds,['theme:ai-semiconductors']);
  assert.deepEqual(fact.relationships.companyIds,['company:samsung-electronics']);
  assert.deepEqual(fact.relationships.sectorIds,['sector:semiconductors']);
  assert.deepEqual(canonicalKoreaSector('FINANCIALS','금융'),{id:'sector:financials',label:'금융'});
});

test('Sprint 3C preserves field provenance through the adapter boundary',async()=>{
  const record=raw({sourceRecordId:'PROGRAM-FLOW',factType:'PROGRAM_NET_FLOW',value:-32,unit:'KRW_100M',sourceCategory:'MANUAL_VERIFIED',source:'수동 교차검증 fixture',sourceUrl:'https://example.org/program/net'});
  const result=await collectKoreaMarketFacts(new FixtureKoreaMarketAdapter([record])); const fact=result.facts[0]!;
  assert.equal(fact.value,-3200); assert.equal(fact.unit,'KRW_MILLION');
  assert.equal(fact.provenance.originalValue,-32); assert.equal(fact.provenance.originalUnit,'KRW_100M');
  assert.equal(fact.provenance.normalization,'KRW_100M × 100 = KRW_MILLION');
  assert.equal(fact.provenance.sourceUrl,record.sourceUrl);
});

test('Sprint 3C supports trading value, program flow, movers, and advance-decline breadth',()=>{
  const records=[
    raw({sourceRecordId:'TRADING-VALUE-COVERAGE',factType:'TRADING_VALUE',value:185000,unit:'KRW_MILLION',sourceUrl:'https://example.org/coverage/value'}),
    raw({sourceRecordId:'PROGRAM-COVERAGE',factType:'PROGRAM_NET_FLOW',value:-21,unit:'KRW_100M',sourceUrl:'https://example.org/coverage/program'}),
    raw({sourceRecordId:'GAINER-COVERAGE',factType:'SECURITY_CHANGE_PCT',companyKey:'sample-company',company:'샘플기업',ticker:'000001',value:8.5,unit:'PERCENT',sourceUrl:'https://example.org/coverage/gainer'}),
    raw({sourceRecordId:'DECLINER-COVERAGE',factType:'SECURITY_CHANGE_PCT',companyKey:'sample-company-2',company:'샘플기업2',ticker:'000002',value:-6.2,unit:'PERCENT',sourceUrl:'https://example.org/coverage/decliner'}),
    raw({sourceRecordId:'ADVANCE-COVERAGE',factType:'ADVANCE_COUNT',value:512,unit:'COUNT',sourceUrl:'https://example.org/coverage/advance'}),
    raw({sourceRecordId:'DECLINE-COVERAGE',factType:'DECLINE_COUNT',value:361,unit:'COUNT',sourceUrl:'https://example.org/coverage/decline'})
  ];
  const result=runKoreaMarketIntake(records); assert.equal(result.rejected.length,0);
  const view=buildKoreaMarketNewsletterView(result.facts)!;
  assert.deepEqual(view.metrics.map(metric=>metric.group),['VALUE','PROGRAM','MOVER','MOVER','BREADTH','BREADTH']);
  assert.deepEqual(view.metrics.map(metric=>metric.direction),['FLAT','DOWN','UP','DOWN','FLAT','FLAT']);
});

test('Sprint 3C rejects missing source, timestamp, or value and creates no fallback market fact',()=>{
  const records=[raw({sourceRecordId:'MISSING-URL',sourceUrl:''}),raw({sourceRecordId:'MISSING-TIME',observedAt:''}),raw({sourceRecordId:'MISSING-VALUE',value:Number.NaN})];
  const result=runKoreaMarketIntake(records);
  assert.equal(result.facts.length,0); assert.equal(result.rejected.length,3);
  assert.ok(result.rejected[0]!.errors.some(error=>error.startsWith('sourceUrl:')));
  assert.ok(result.rejected[1]!.errors.some(error=>error.startsWith('observedAt:')));
  assert.ok(result.rejected[2]!.errors.some(error=>error.startsWith('value:')));
  assert.doesNotMatch(JSON.stringify(result),/1970-01-01|example\.invalid/i);
});

test('Sprint 3C rejects brokerage and AI interpretation contamination in Market Fact input',()=>{
  const institution={...raw({sourceRecordId:'CONTAMINATED-INSTITUTION'}),institutionView:null};
  const ai={...raw({sourceRecordId:'CONTAMINATED-AI'}),aiInterpretation:'해석'};
  const result=runKoreaMarketIntake([institution,ai]);
  assert.equal(result.facts.length,0);
  assert.ok(result.rejected[0]!.errors.includes('institutionView: prohibited in Market Fact'));
  assert.ok(result.rejected[1]!.errors.includes('aiInterpretation: prohibited in Market Fact'));
});

test('Sprint 3C renders verified Korea facts in Newsletter without opinion fields',()=>{
  const records=[
    raw(),raw({sourceRecordId:'KRX-KOSDAQ-FIXTURE',market:'KOSDAQ',value:850.75,sourceUrl:'https://example.org/krx/kosdaq'}),
    raw({sourceRecordId:'BOK-USD-KRW-FIXTURE',factType:'FX_SPOT',market:'USD_KRW',value:1325.4,unit:'KRW_PER_USD',sourceCategory:'BOK_ECOS',source:'한국은행 ECOS fixture',sourceUrl:'https://example.org/bok/usd-krw'}),
    raw({sourceRecordId:'FLOW-FOREIGN',factType:'INVESTOR_NET_FLOW',investor:'FOREIGN',value:125.5,unit:'KRW_100M',sourceUrl:'https://example.org/flow/foreign'}),
    raw({sourceRecordId:'TRADING-VALUE',factType:'TRADING_VALUE',value:25000,unit:'KRW_MILLION',sourceUrl:'https://example.org/value'}),
    raw({sourceRecordId:'SECTOR-SEMICONDUCTOR',factType:'SECTOR_CHANGE_PCT',sectorKey:'SEMICONDUCTORS',sectorLabel:'반도체',value:2.4,unit:'PERCENT',sourceUrl:'https://example.org/sector/semiconductors'})
  ];
  const view=buildKoreaMarketNewsletterView(runKoreaMarketIntake(records).facts)!;
  const model=createNewsletterViewModel({newsletterId:'newsletter:kr:fixture',issueDate:'2026-09-29',issueNumber:2,title:'MOTUS Daily Intelligence',subtitle:'한국시장 팩트 연결',editorialSummary:'검증 fixture 기반 렌더링 테스트.',koreaMarketFacts:view,sources:[],assets:[]});
  const rendered=renderMotusDailyNewsletter(model);
  assert.ok(rendered.renderedSections.includes('korea-market-intelligence'));
  assert.match(rendered.html,/data-render-field="korea-market-facts"/);
  assert.match(rendered.html,/KOSPI[\s\S]*KOSDAQ[\s\S]*USD\/KRW[\s\S]*외국인 순매수[\s\S]*거래대금[\s\S]*반도체/);
  assert.match(rendered.html,/<a href="https:\/\/example\.org\/krx\/kospi"[^>]*>KRX 검증 fixture<\/a>/);
  assert.doesNotMatch(rendered.html,/기관 관점|MOTUS 해석|institutionView|aiInterpretation/);
});

test('Sprint 3C omits Newsletter Korea section when there are no verified facts',()=>{
  assert.equal(buildKoreaMarketNewsletterView([]),null);
  const model=createNewsletterViewModel({newsletterId:'newsletter:empty-kr',issueDate:'2026-09-29',issueNumber:3,title:'MOTUS Daily Intelligence',subtitle:'빈 섹션 생략',editorialSummary:'한국시장 입력 없음.',sources:[],assets:[]});
  const rendered=renderMotusDailyNewsletter(model);
  assert.equal(rendered.renderedSections.includes('korea-market-intelligence'),false);
  assert.doesNotMatch(rendered.html,/Korea Market Intelligence|No data|자료 부족/);
});

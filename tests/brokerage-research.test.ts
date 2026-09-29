import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BrokerageInstitutionRegistry,
  FixtureBrokerageResearchAdapter,
  buildKoreaResearchNewsletterEntries,
  collectBrokerageResearch,
  defaultBrokerageInstitutionRegistry,
  koreaBrokerageInstitutions,
  runBrokerageResearchIntake,
  type BrokerageResearchSourceRecord
} from '../src/intelligence/brokerage-research.js';
import { createNewsletterViewModel } from '../src/intelligence/newsletter.js';
import { renderMotusDailyNewsletter } from '../src/publishers/motus-newsletter.js';

const raw=(overrides:Partial<BrokerageResearchSourceRecord>={}):BrokerageResearchSourceRecord=>({
  researchId:'research:samsung-securities:semiconductor-2026-09-29',sourceRecordId:'SAMSUNG-HTML-1',publisher:'삼성증권',analyst:'홍길동',
  publishedAt:'2026-09-29T00:30:00+09:00',collectedAt:'2026-09-29T08:00:00+09:00',researchType:'COMPANY_REPORT',
  headline:'반도체 기업 분석 fixture',summary:'공개 원문 구조를 검증하기 위한 테스트 요약.',market:'KR',sector:'정보기술',industry:'반도체',
  companyKey:'sample-semiconductor',company:'샘플반도체',ticker:'000000',themeKey:'semiconductors',eventKey:'sample-earnings',
  institutionView:'기관 원문에 명시된 실적 및 투자 관점.',evidence:[{evidenceId:'EVIDENCE-SAMSUNG-1',text:'원문에 명시된 검증용 근거.'}],
  targetPrice:{value:80000,currency:'KRW'},previousTargetPrice:{value:75000,currency:'KRW'},targetPriceChange:'UP',
  rating:'BUY',previousRating:'HOLD',ratingChange:'UPGRADE',investmentStrategy:['실적 확인 후 비중 조절'],riskFactors:['수요 둔화'],
  aiInterpretation:'기관 관점과 분리된 MOTUS 해석.',sourceKind:'OFFICIAL_RESEARCH_PAGE',sourceFormat:'HTML',sourceUrl:'https://example.org/research/sample-semiconductor',
  sourcePage:null,sourceSection:'투자의견',extractedFields:['headline','institutionView','targetPrice','rating'],verificationStatus:'PRIMARY_SOURCE_ONLY',...overrides
});

test('Sprint 3D registry canonicalizes supported institutions and remains extensible',()=>{
  assert.equal(defaultBrokerageInstitutionRegistry.resolve('Samsung Securities')?.name,'삼성증권');
  assert.equal(defaultBrokerageInstitutionRegistry.resolve('이베스트투자증권')?.institutionId,'ls-securities');
  assert.equal(koreaBrokerageInstitutions.length,10);
  const custom=new BrokerageInstitutionRegistry([{institutionId:'sample-securities',name:'샘플증권',aliases:['Sample Securities']}]);
  assert.equal(custom.resolve('Sample Securities')?.name,'샘플증권');
});

test('Sprint 3D ingests market strategy and industry reports without company inference',()=>{
  const result=runBrokerageResearchIntake([
    raw({researchId:'research:nh:market',sourceRecordId:'NH-MARKET',publisher:'NH투자증권',researchType:'MARKET_STRATEGY',headline:'시장 전략 fixture',companyKey:null,company:null,ticker:null,sector:null,industry:null,targetPrice:null,previousTargetPrice:null,targetPriceChange:'UNKNOWN',rating:null,previousRating:null,ratingChange:'UNKNOWN',sourceUrl:'https://example.org/nh/market'}),
    raw({researchId:'research:mirae:industry',sourceRecordId:'MIRAE-INDUSTRY',publisher:'미래에셋증권',researchType:'INDUSTRY_REPORT',headline:'반도체 산업 fixture',companyKey:null,company:null,ticker:null,targetPrice:null,previousTargetPrice:null,targetPriceChange:'UNKNOWN',rating:null,previousRating:null,ratingChange:'UNKNOWN',sourceUrl:'https://example.org/mirae/industry'})
  ]);
  assert.equal(result.rejected.length,0); assert.deepEqual(result.items.map(item=>item.researchType),['MARKET_STRATEGY','INDUSTRY_REPORT']);
  assert.equal(result.items[0]!.companyId,null); assert.equal(result.items[1]!.themeId,'theme:semiconductors');
});

test('Sprint 3D structures company target price and rating changes',()=>{
  const result=runBrokerageResearchIntake([raw()]); const item=result.items[0]!;
  assert.equal(result.rejected.length,0); assert.equal(item.companyId,'company:sample-semiconductor');
  assert.deepEqual(item.targetPrice,{value:80000,currency:'KRW'}); assert.deepEqual(item.previousTargetPrice,{value:75000,currency:'KRW'});
  assert.equal(item.targetPriceChange,'UP'); assert.equal(item.rating,'BUY'); assert.equal(item.previousRating,'HOLD'); assert.equal(item.ratingChange,'UPGRADE');
});

test('Sprint 3D rejects contradictory target-price normalization and never estimates missing values',()=>{
  const contradictory=raw({sourceRecordId:'CONTRADICTORY',targetPrice:{value:70000,currency:'KRW'},previousTargetPrice:{value:75000,currency:'KRW'},targetPriceChange:'UP'});
  const missing=raw({sourceRecordId:'MISSING-PRICE',targetPrice:null,previousTargetPrice:null,targetPriceChange:'UP'});
  const result=runBrokerageResearchIntake([contradictory,missing]);
  assert.equal(result.items.length,0); assert.equal(result.rejected.length,2);
  assert.ok(result.rejected[0]!.errors.some(error=>error.includes('conflicts with structured values')));
  assert.ok(result.rejected[1]!.errors.some(error=>error.startsWith('targetPrice: required')));
});

test('Sprint 3D rejects missing URL or publishedAt without fallback',()=>{
  const result=runBrokerageResearchIntake([raw({sourceRecordId:'MISSING-URL',sourceUrl:''}),raw({sourceRecordId:'MISSING-TIME',publishedAt:''})]);
  assert.equal(result.items.length,0); assert.equal(result.rejected.length,2);
  assert.ok(result.rejected[0]!.errors.some(error=>error.startsWith('sourceUrl:')));
  assert.ok(result.rejected[1]!.errors.some(error=>error.startsWith('publishedAt:')));
  assert.doesNotMatch(JSON.stringify(result),/1970-01-01|example\.invalid/);
});

test('Sprint 3D merges PDF and HTML mirrors while preserving every provenance location',()=>{
  const mirror=raw({sourceRecordId:'MIRROR-1',sourceKind:'VERIFIED_MIRROR',sourceFormat:'MIRROR',sourceUrl:'https://mirror.example.org/research/sample',sourcePage:'3',sourceSection:'기업 분석'});
  const officialPdf=raw({sourceRecordId:'PDF-1',sourceKind:'OFFICIAL_PDF',sourceFormat:'PDF',sourceUrl:'https://example.org/research/sample.pdf?utm_source=mail',sourcePage:'3',sourceSection:'기업 분석',evidence:[{evidenceId:'EVIDENCE-PDF-1',text:'PDF 3쪽 근거.'}]});
  const result=runBrokerageResearchIntake([mirror,officialPdf]); const item=result.items[0]!;
  assert.equal(result.items.length,1); assert.equal(result.duplicates.length,1); assert.equal(result.duplicates[0]!.reason,'SAME_REPORT_IDENTITY');
  assert.equal(item.provenance.length,2); assert.deepEqual(item.provenance.map(value=>value.sourceFormat),['MIRROR','PDF']);
  assert.equal(item.provenance[1]!.page,'3'); assert.equal(item.evidence.length,2);
  assert.equal(item.sourceUrl,'https://example.org/research/sample.pdf');
});

test('Sprint 3D canonical URL dedupe stays scoped to one publisher',()=>{
  const duplicate=raw({sourceRecordId:'SAME-URL',headline:'표현이 다른 mirror 제목',publishedAt:'2026-09-29T01:00:00+09:00',sourceUrl:'https://example.org/research/sample-semiconductor?utm_source=mail'});
  const otherPublisher=raw({researchId:'research:nh:same-url',sourceRecordId:'NH-SAME-URL',publisher:'NH투자증권',headline:'다른 기관 리포트',publishedAt:'2026-09-29T02:00:00+09:00'});
  const result=runBrokerageResearchIntake([raw(),duplicate,otherPublisher]);
  assert.equal(result.items.length,2); assert.equal(result.duplicates.length,1); assert.equal(result.duplicates[0]!.reason,'SAME_CANONICAL_URL');
  assert.deepEqual(result.items.map(item=>item.publisher),['삼성증권','NH투자증권']);
});

test('Sprint 3D adapter preserves source provenance',async()=>{
  const result=await collectBrokerageResearch(new FixtureBrokerageResearchAdapter([raw()])); const item=result.items[0]!;
  assert.equal(item.provenance[0]!.sourceRecordId,'SAMSUNG-HTML-1'); assert.equal(item.provenance[0]!.section,'투자의견');
  assert.deepEqual(item.provenance[0]!.extractedFields,['headline','institutionView','targetPrice','rating']);
  assert.equal(item.evidence[0]!.sourceUrl,'https://example.org/research/sample-semiconductor');
});

test('Sprint 3D keeps institutionView and aiInterpretation separate',()=>{
  const result=runBrokerageResearchIntake([raw({sourceRecordId:'MIXED-VIEW',aiInterpretation:'기관 원문에 명시된 실적 및 투자 관점.'})]);
  assert.equal(result.items.length,0); assert.ok(result.rejected[0]!.errors.some(error=>error.includes('distinct from institutionView')));
  const accepted=runBrokerageResearchIntake([raw()]).items[0]!;
  assert.notEqual(accepted.institutionView,accepted.aiInterpretation);
});

test('Sprint 3D rejects Korea Market Fact contamination',()=>{
  const contaminated={...raw(),factType:'INDEX_LEVEL',marketId:'KOSPI',investorType:null};
  const result=runBrokerageResearchIntake([contaminated]); assert.equal(result.items.length,0);
  assert.ok(result.rejected[0]!.errors.includes('Korea Market Fact fields are prohibited in Brokerage Research'));
});

test('Sprint 3D renders verified Korea Research with separate institution and AI fields',()=>{
  const entries=buildKoreaResearchNewsletterEntries(runBrokerageResearchIntake([raw()]).items);
  const model=createNewsletterViewModel({newsletterId:'newsletter:brokerage:fixture',issueDate:'2026-09-29',issueNumber:4,title:'MOTUS Daily Intelligence',subtitle:'국내 리서치 연결',editorialSummary:'검증 fixture 기반 렌더링.',koreaResearch:entries,sources:[],assets:[]});
  const rendered=renderMotusDailyNewsletter(model);
  assert.ok(rendered.renderedSections.includes('korea-research')); assert.match(rendered.html,/Korea Research/);
  assert.match(rendered.html,/삼성증권[\s\S]*기관 원문 관점[\s\S]*MOTUS 해석[\s\S]*목표주가 80,000 KRW[\s\S]*투자의견 BUY/);
  assert.match(rendered.html,/<a href="https:\/\/example\.org\/research\/sample-semiconductor"/);
  assert.doesNotMatch(rendered.html,/research:samsung|PRIMARY_SOURCE_ONLY|verificationStatus/);
});

test('Sprint 3D omits empty or unverified Korea Research section',()=>{
  assert.deepEqual(buildKoreaResearchNewsletterEntries(runBrokerageResearchIntake([raw({verificationStatus:'REVIEW_REQUIRED'})]).items),[]);
  const model=createNewsletterViewModel({newsletterId:'newsletter:no-research',issueDate:'2026-09-29',issueNumber:5,title:'MOTUS Daily Intelligence',subtitle:'빈 리서치 생략',editorialSummary:'공개 가능한 리서치 없음.',koreaResearch:[],sources:[],assets:[]});
  const rendered=renderMotusDailyNewsletter(model); assert.equal(Object.hasOwn(model,'koreaResearch'),false);
  assert.equal(rendered.renderedSections.includes('korea-research'),false); assert.doesNotMatch(rendered.html,/Korea Research/);
});

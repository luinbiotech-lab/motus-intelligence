import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { InputBundle, Rule, Source } from '../src/domain/models.js';
import { buildFiveSessionMajorIndexHistory } from '../src/services/market-history.js';
import { runPipeline } from '../src/services/pipeline.js';
import { createBloggerPreview, type BloggerPublishingConfig } from '../src/services/blogger.js';
import { renderA4MasterOnDemand } from '../src/services/a4-visual.js';
import {
  StaticLegacyAINewsAssetAdapter,
  createNewsletterViewModel,
  legacyAINewsSourceKinds,
  newsletterAssetLayers,
  validateNewsletterViewModel,
  type NewsletterBuildInput,
  type NewsletterIntelligenceEntry
} from '../src/intelligence/newsletter.js';
import { assertNewsletterPublicHtmlSafe, renderMotusDailyNewsletter } from '../src/publishers/motus-newsletter.js';

const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;
const sources=read<Source[]>('config/sources.json');
const rules=read<Rule[]>('config/us-korea-rules.v1.json');
const publishingConfig=read<{blogger:BloggerPublishingConfig}>('config/publishing.json').blogger;
const sourceLink={label:'OpenAI 공식 발표',url:'https://example.org/openai/official-release',publisher:'OpenAI'};
const aiEntry:NewsletterIntelligenceEntry={
  intelligenceId:'intel:ai:openai-infrastructure',headline:'AI 인프라 투자의 연결고리',summary:'공식 자료에서 확인된 인프라 방향을 산업 연결 관점에서 정리했다.',
  company:'OpenAI',companyId:'company:openai',primaryThemeId:'theme:ai-infrastructure',relatedThemeIds:['theme:data-centers','theme:power'],eventId:'event:openai-infrastructure',
  institutionView:null,aiInterpretation:'데이터센터와 전력 인프라까지 함께 확인해야 하는 사건이다.',sourceFacts:['공식 발표가 AI 인프라 계획을 다뤘다.'],sources:[sourceLink],assetIds:['asset:daily:openai-infrastructure']
};
const wallStreetEntry:NewsletterIntelligenceEntry={
  ...aiEntry,intelligenceId:'intel:wall-street:semiconductor',headline:'반도체 업종에 대한 기관 시각',company:'NVIDIA',companyId:'company:nvidia',primaryThemeId:'theme:semiconductors',relatedThemeIds:[],eventId:'event:semiconductor-view',
  institutionView:'기관은 실적 가시성과 투자 속도를 함께 평가했다.',aiInterpretation:'밸류에이션과 실제 CAPEX 집행 사이의 간격이 핵심 변수다.',sources:[{label:'기관 리서치 샘플',url:'https://example.org/research/semiconductor',publisher:'Example Securities'}]
};
const history=()=>buildFiveSessionMajorIndexHistory([
  read<InputBundle>('data/manual/2026-09-11/input.json'),read<InputBundle>('data/manual/2026-09-15/input.json'),read<InputBundle>('data/manual/2026-09-16/input.json')
]);
const input=():NewsletterBuildInput=>({
  newsletterId:'newsletter:daily:2026-09-16',issueDate:'2026-09-16',issueNumber:1,title:'MOTUS Daily Intelligence',subtitle:'시장을 움직이는 AI·산업·자본의 연결',editorialSummary:'오늘의 시장과 AI 산업 신호를 짧게 훑고 근거까지 이어서 볼 수 있도록 구성했다.',
  todayAtAGlance:{headline:'금리와 AI 투자가 같은 화면에 들어온 날',summary:'시장 가격과 산업 투자 신호를 함께 읽는다.',bullets:['주요 지수 흐름 확인','AI 인프라 투자 연결 점검']},
  marketSnapshot:{summary:'검증된 미국 주요지수 흐름이다.',metrics:[{label:'S&P 500',value:'7,551.81',change:'-0.45%',direction:'DOWN'},{label:'Nasdaq',value:'25,978.42',change:'-0.01%',direction:'DOWN'},{label:'Dow Jones',value:'51,461.90',change:'-1.21%',direction:'DOWN'},{label:'Russell 2000',value:'2,858.81',change:'-0.40%',direction:'DOWN'}],marketHistory:history()},
  aiIntelligence:[aiEntry],wallStreetIntelligence:[wallStreetEntry],koreaMarketIntelligence:[],
  crossIntelligence:[{headline:'AI CAPEX와 금리의 교차점',summary:'투자 확대와 할인율 부담을 함께 추적한다.',linkedIntelligenceIds:[aiEntry.intelligenceId,wallStreetEntry.intelligenceId],sourceIds:['SOURCE-1']}],
  investmentMap:[{theme:'AI Infrastructure',upstream:['전력','반도체'],beneficiaries:['데이터센터 공급망'],risks:['금리','집행 지연']}],
  whatToWatch:[{headline:'CAPEX 집행 속도',watchFor:'공식 실적과 투자 계획의 변화',validityHorizon:'SHORT_TERM'}],
  sources:[sourceLink,{label:'기관 리서치 샘플',url:'https://example.org/research/semiconductor',publisher:'Example Securities'}],
  assets:[{assetId:'asset:daily:openai-infrastructure',layer:'DAILY',title:'AI 인프라 데일리',companyIds:['company:openai'],themeIds:['theme:ai-infrastructure','theme:data-centers','theme:power'],eventIds:['event:openai-infrastructure'],intelligenceIds:[aiEntry.intelligenceId],parentAssetIds:['asset:topic:ai-infrastructure']}]
});

test('Sprint 3B.2 validates NewsletterViewModel and omits empty optional sections',()=>{
  const model=createNewsletterViewModel(input());
  assert.deepEqual(validateNewsletterViewModel(model),[]);
  assert.equal(Object.hasOwn(model,'koreaMarketIntelligence'),false);
  assert.equal(model.newsletterId,'newsletter:daily:2026-09-16');
  assert.deepEqual(newsletterAssetLayers,['DAILY','TOPIC','WEEKLY','EVERGREEN']);
});

test('Sprint 3B.2 keeps institution view and AI interpretation as separate render fields',()=>{
  const model=createNewsletterViewModel(input()); const rendered=renderMotusDailyNewsletter(model);
  assert.match(rendered.html,/data-render-field="institution-view"[\s\S]*기관 관점/);
  assert.match(rendered.html,/data-render-field="ai-interpretation"[\s\S]*MOTUS 해석/);
  const invalid=structuredClone(model); invalid.wallStreetIntelligence![0]!.aiInterpretation=invalid.wallStreetIntelligence![0]!.institutionView;
  assert.ok(validateNewsletterViewModel(invalid).some(error=>error.includes('must remain separate')));
});

test('Sprint 3B.2 renders fixed newsletter order, clickable sources, and no fake Korea section',()=>{
  const rendered=renderMotusDailyNewsletter(createNewsletterViewModel(input()));
  assert.deepEqual(rendered.renderedSections,['masthead','today-at-a-glance','market-snapshot','major-index-trend','ai-intelligence','wall-street-intelligence','cross-intelligence','investment-map','what-to-watch','sources']);
  const order=['data-section="masthead"','Today at a Glance','Market Snapshot','AI &amp; Industry Intelligence','Wall Street Intelligence','Cross Intelligence','Investment Map','What to Watch','Sources'];
  let prior=-1; for(const marker of order){const position=rendered.html.indexOf(marker);assert.ok(position>prior,marker);prior=position;}
  assert.doesNotMatch(rendered.html,/Korea Market Intelligence/);
  assert.match(rendered.html,/<a href="https:\/\/example\.org\/openai\/official-release"[^>]*>OpenAI 공식 발표<\/a>/);
  assert.doesNotMatch(rendered.html,/>\s*https?:\/\//);
  assertNewsletterPublicHtmlSafe(rendered.html);
});

test('Sprint 3B.2 preserves 10-second, 3-minute, and deep-read hierarchy',()=>{
  const html=renderMotusDailyNewsletter(createNewsletterViewModel(input())).html;
  assert.match(html,/data-read-depth="10-second"/); assert.match(html,/data-read-depth="3-minute"/); assert.match(html,/data-read-depth="deep-read"/);
  assert.match(html,/금리와 AI 투자가 같은 화면에 들어온 날/);
  assert.match(html,/확인된 사실[\s\S]*근거/);
});

test('Sprint 3B.2 is Blogger-mobile safe and reuses the verified 2x2 chart',()=>{
  const html=renderMotusDailyNewsletter(createNewsletterViewModel(input())).html;
  assert.match(html,/data-product="motus-daily-intelligence"/);
  assert.match(html,/width:100%;max-width:100%;box-sizing:border-box/);
  assert.equal((html.match(/<svg class="index-line-chart"/g)??[]).length,4);
  assert.match(html,/data-layout="responsive-two-by-two"/);
  assert.equal((html.match(/<svg class="index-line-chart"[^>]*width="100%"/g)??[]).length,4);
  assert.doesNotMatch(html,/index-trend-row|word-break:break-all/);
  assert.doesNotMatch(html,/<script\b|<iframe\b|<style\b|overflow-x:auto|javascript:/i);
});

test('Sprint 3B.2 defines legacy AI News adapters without rewriting collection sources',async()=>{
  const asset=input().assets[0]!;
  const adapter=new StaticLegacyAINewsAssetAdapter('legacy-google-alerts','GOOGLE_ALERTS',[asset]);
  assert.ok(legacyAINewsSourceKinds.includes(adapter.sourceKind));
  assert.deepEqual(await adapter.collect(),[asset]);
  const collected=await adapter.collect(); collected[0]!.title='changed';
  assert.equal((await adapter.collect())[0]!.title,'AI 인프라 데일리');
});

test('Sprint 3B.2 leaves US Daily, A4, and publication history unchanged',async()=>{
  const publicationPaths=['data/blogger/2026-09-11/MANUAL-2026-09-11-7cb0ccf11f29-publication.json','data/blogger/2026-09-16/MANUAL-2026-09-16-65e0805c062f-publication.json'];
  const publicationBefore=publicationPaths.map(path=>readFileSync(path,'utf8'));
  const dailyInput=read<InputBundle>('data/manual/2026-09-11/input.json'); const original=JSON.stringify(dailyInput);
  const result=runPipeline(dailyInput,sources,rules,'2026-09-13T05:17:44Z');
  assert.equal(JSON.stringify(dailyInput),original); assert.equal(result.report.tradingDate,'2026-09-11');
  const preview=createBloggerPreview(result.report,result.evidence,publishingConfig); assert.equal(preview.status,'PREVIEW_READY');
  const a4=await renderA4MasterOnDemand(result.report,result.evidence,mkdtempSync(join(tmpdir(),'newsletter-a4-regression-')),{audience:'admin',action:'A4_REPORT_RENDER'},{regenerate:true,bloggerRecord:preview,publishingConfig});
  assert.equal(a4.layout.onePage,true); assert.equal(a4.layout.overflow,false);
  renderMotusDailyNewsletter(createNewsletterViewModel(input()));
  assert.deepEqual(publicationPaths.map(path=>readFileSync(path,'utf8')),publicationBefore);
});

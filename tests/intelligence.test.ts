import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { InputBundle, Rule, Source } from '../src/domain/models.js';
import { runPipeline } from '../src/services/pipeline.js';
import { createBloggerPreview, type BloggerPublishingConfig } from '../src/services/blogger.js';
import { renderA4MasterOnDemand } from '../src/services/a4-visual.js';
import { adaptDailyReportToIntelligence } from '../src/intelligence/compatibility.js';
import { INTELLIGENCE_SCHEMA_VERSION, validateResearchIntelligenceItem, type ResearchIntelligenceItem } from '../src/intelligence/schema.js';

const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;
const sources=read<Source[]>('config/sources.json');
const rules=read<Rule[]>('config/us-korea-rules.v1.json');
const publishingConfig=read<{blogger:BloggerPublishingConfig}>('config/publishing.json').blogger;

const baseItem=(overrides:Partial<ResearchIntelligenceItem>={}):ResearchIntelligenceItem=>({
  schemaVersion:INTELLIGENCE_SCHEMA_VERSION,intelligenceId:'intel:test:1',contentType:'AI_INTELLIGENCE',sourceType:'NEWS',
  source:'Primary source',publisher:'MOTUS',analyst:null,publishedAt:'2026-09-16T20:00:00Z',collectedAt:'2026-09-16T20:05:00Z',
  market:'US',country:'US',region:'North America',companyId:'company:nvidia',company:'NVIDIA',ticker:'NVDA',sector:'Technology',industry:'Semiconductors',
  themeId:'theme:ai-capex',theme:'AI CAPEX',eventId:'event:ai-capex:1',parentEventId:null,
  relatedCompanies:['company:nvidia'],relatedSectors:['Semiconductors'],relatedMarkets:['US','KR'],
  headline:'AI investment update',summary:'Verified AI investment evidence.',claimIds:['claim:1'],evidenceIds:['evidence:1'],
  stance:'NEUTRAL',targetPrice:null,rating:null,ratingChange:null,targetPriceChange:null,
  institutionView:null,aiInterpretation:'MOTUS interpretation kept separate from the source view.',
  sourceUrl:'https://example.com/research',verificationStatus:'VERIFIED',confidence:90,validityHorizon:'SHORT_TERM',
  provenance:{legacyReportId:null,inputSha256:null,adapterVersion:null,sources:[]},...overrides
});

test('Sprint 3A validates AI Intelligence items',()=>{
  const result=validateResearchIntelligenceItem(baseItem());
  assert.deepEqual(result,{valid:true,errors:[]});
});

test('Sprint 3A validates Wall Street Intelligence items',()=>{
  const item=baseItem({contentType:'WALL_STREET_INTELLIGENCE',sourceType:'SELL_SIDE_RESEARCH',publisher:'Example Securities',analyst:'Research Analyst',institutionView:'Overweight; target price raised.',aiInterpretation:null,rating:'Overweight',ratingChange:'Maintain',targetPrice:225,targetPriceChange:10});
  assert.equal(validateResearchIntelligenceItem(item).valid,true);
});

test('Sprint 3A validates Korea Market Intelligence items',()=>{
  const item=baseItem({contentType:'KOREA_MARKET_INTELLIGENCE',market:'KR',country:'KR',region:'Asia',companyId:'company:sk-hynix',company:'SK hynix',ticker:'000660',institutionView:null,aiInterpretation:null});
  assert.equal(validateResearchIntelligenceItem(item).valid,true);
});

test('Sprint 3A keeps institutionView and aiInterpretation independent',()=>{
  const institutionView='Institution rating and target-price thesis.';
  const aiInterpretation='MOTUS interpretation based on linked evidence.';
  const item=baseItem({contentType:'WALL_STREET_INTELLIGENCE',institutionView,aiInterpretation});
  assert.equal(validateResearchIntelligenceItem(item).valid,true);
  assert.equal(item.institutionView,institutionView);
  assert.equal(item.aiInterpretation,aiInterpretation);
  assert.notEqual(item.institutionView,item.aiInterpretation);
  const missingInstitution=baseItem({contentType:'WALL_STREET_INTELLIGENCE',institutionView:null,aiInterpretation});
  assert.equal(validateResearchIntelligenceItem(missingInstitution).valid,false);
});

test('Sprint 3A validates common company/theme/event IDs and event chains',()=>{
  const item=baseItem({companyId:'company:nvidia',themeId:'theme:ai-capex',eventId:'event:earnings:nvidia:2026-q3',parentEventId:'event:ai-capex:2026',relatedCompanies:['company:nvidia','company:sk-hynix'],relatedSectors:['Semiconductors'],relatedMarkets:['US','KR']});
  assert.equal(validateResearchIntelligenceItem(item).valid,true);
  assert.equal(validateResearchIntelligenceItem({...item,eventId:null}).valid,false);
  assert.equal(validateResearchIntelligenceItem({...item,parentEventId:item.eventId}).valid,false);
});

for(const [label,date,generatedAt] of [
  ['Golden Day','2026-09-11','2026-09-13T05:17:44Z'],
  ['current Daily','2026-09-16','2026-09-17T10:22:10.573Z']
] as const) test(`Sprint 3A ${label} compatibility preserves provenance and output`,()=>{
  const input=read<InputBundle>(`data/manual/${date}/input.json`);
  const result=runPipeline(input,sources,rules,generatedAt);
  const before=JSON.stringify({report:result.report,evidence:result.evidence,markdown:result.markdown});
  const item=adaptDailyReportToIntelligence(result.report,result.evidence);
  assert.equal(validateResearchIntelligenceItem(item).valid,true);
  assert.equal(item.provenance.legacyReportId,result.report.reportId);
  assert.equal(item.provenance.inputSha256,result.evidence.inputSha256);
  assert.deepEqual(item.claimIds,result.evidence.claims!.map(claim=>claim.claimId));
  assert.deepEqual(item.evidenceIds,result.evidence.records.map(record=>record.evidenceId));
  assert.deepEqual(item.provenance.sources.map(source=>source.sourceUrl),result.evidence.records.map(record=>record.sourceUrl));
  assert.equal(JSON.stringify({report:result.report,evidence:result.evidence,markdown:result.markdown}),before);
});

test('Sprint 3A compatibility leaves Blogger and A4 renderers unchanged',async()=>{
  const input=read<InputBundle>('data/manual/2026-09-11/input.json');
  const result=runPipeline(input,sources,rules,'2026-09-13T05:17:44Z');
  const before=JSON.stringify(result);
  const preview=createBloggerPreview(result.report,result.evidence,publishingConfig);
  assert.equal(preview.status,'PREVIEW_READY');
  assert.match(preview.html,/시장 한눈에 보기/);
  const output=await renderA4MasterOnDemand(result.report,result.evidence,mkdtempSync(join(tmpdir(),'sprint-3a-a4-')),{audience:'admin',action:'A4_REPORT_RENDER'},{regenerate:true,bloggerRecord:preview,publishingConfig});
  assert.equal(output.layout.onePage,true);
  assert.equal(output.layout.overflow,false);
  assert.equal(JSON.stringify(result),before);
});

test('Sprint 3A checked-in JSON schema exposes distinct view fields and all required common IDs',()=>{
  const schema=read<{required:string[];properties:Record<string,unknown>}>('config/motus-intelligence.schema.v1.json');
  for(const key of ['companyId','themeId','eventId','parentEventId','institutionView','aiInterpretation','relatedCompanies','relatedSectors','relatedMarkets']) assert.ok(schema.required.includes(key),key);
  assert.notDeepEqual(schema.properties.institutionView,schema.properties.aiInterpretation);
});

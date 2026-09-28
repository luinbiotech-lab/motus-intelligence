import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { InputBundle, Rule, Source } from '../src/domain/models.js';
import { runPipeline } from '../src/services/pipeline.js';
import { createBloggerPreview, type BloggerPublishingConfig } from '../src/services/blogger.js';
import { renderA4MasterOnDemand } from '../src/services/a4-visual.js';
import {
  FixtureAIIntakeAdapter,
  aiIntakeSourceTypes,
  collectAIIntelligence,
  canonicalThemeId,
  headlineFingerprint,
  runAIIntelligenceIntake,
  type AIIntakeSourceRecord,
  type AIIntakeSourceType
} from '../src/intelligence/ai-intake.js';
import { validateResearchIntelligenceItem } from '../src/intelligence/schema.js';

const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;
const sources=read<Source[]>('config/sources.json');
const rules=read<Rule[]>('config/us-korea-rules.v1.json');
const publishingConfig=read<{blogger:BloggerPublishingConfig}>('config/publishing.json').blogger;

const sourceRecord=(overrides:Partial<AIIntakeSourceRecord>={}):AIIntakeSourceRecord=>({
  sourceRecordId:'SAMPLE-OFFICIAL-OPENAI-1',sourceType:'OFFICIAL',source:'OpenAI official fixture',publisher:'OpenAI',analyst:null,
  sourceUrl:'https://example.org/openai/platform-update',publishedAt:'2026-09-20T14:00:00Z',collectedAt:'2026-09-20T14:05:00Z',
  market:'US',country:'US',region:'North America',companyKey:'openai',company:'OpenAI',ticker:null,
  sector:'Technology',industry:'Artificial Intelligence',themeKey:'ai-infrastructure',theme:'AI Infrastructure',
  eventKey:'openai-platform-update-2026-09-20',parentEventKey:'ai-infrastructure-cycle-2026',
  relatedCompanyKeys:['microsoft'],relatedSectors:['Cloud','Data Center'],relatedMarkets:['US'],
  headline:'OpenAI platform infrastructure update',summary:'Fixture summary derived from the linked official sample.',
  sourceFacts:['The fixture source describes a platform infrastructure update.'],claimIds:['CLAIM-SAMPLE-OPENAI-1'],evidenceIds:['EVIDENCE-SAMPLE-OPENAI-1'],
  verificationStatus:'PRIMARY_SOURCE_ONLY',confidence:85,
  aiInterpretation:'The event belongs to the AI infrastructure theme and needs independent verification before publication.',
  institutionView:null,validityHorizon:'MEDIUM_TERM',...overrides
});

test('Sprint 3B official AI news intake normalizes to the common schema',()=>{
  const result=runAIIntelligenceIntake([sourceRecord()]);
  assert.equal(result.rejected.length,0); assert.equal(result.items.length,1);
  const item=result.items[0]!;
  assert.equal(item.contentType,'AI_INTELLIGENCE'); assert.equal(item.sourceType,'OFFICIAL');
  assert.equal(item.companyId,'company:openai'); assert.equal(item.themeId,'theme:ai-infrastructure');
  assert.equal(item.eventId,'event:openai-platform-update-2026-09-20');
  assert.equal(result.eventGroups[0]!.primaryThemeId,'theme:ai-infrastructure');
  assert.deepEqual(result.eventGroups[0]!.relatedThemeIds,[]);
  assert.equal(validateResearchIntelligenceItem(item).valid,true);
});

test('Sprint 3B company IR intake preserves company and source provenance',()=>{
  const record=sourceRecord({sourceRecordId:'SAMPLE-NVIDIA-IR-1',sourceType:'COMPANY_IR',source:'NVIDIA investor relations fixture',publisher:'NVIDIA',sourceUrl:'https://example.org/nvidia/investor-update',companyKey:'nvidia',company:'NVIDIA',ticker:'NVDA',themeKey:'ai-capex',theme:'AI CAPEX',eventKey:'nvidia-capex-update-2026-09-20',headline:'NVIDIA investor update on AI infrastructure',claimIds:['CLAIM-SAMPLE-NVIDIA-1'],evidenceIds:['EVIDENCE-SAMPLE-NVIDIA-1']});
  const item=runAIIntelligenceIntake([record]).items[0]!;
  assert.equal(item.sourceType,'COMPANY_IR'); assert.equal(item.companyId,'company:nvidia');
  assert.equal(item.provenance.sources[0]!.sourceType,'COMPANY_IR');
  assert.equal(item.provenance.sources[0]!.sourceUrl,record.sourceUrl);
});

test('Sprint 3B media intake distinguishes primary and secondary provenance while mapping to NEWS',()=>{
  for(const sourceType of ['PRIMARY_MEDIA','SECONDARY_MEDIA'] as const){
    const record=sourceRecord({sourceRecordId:`SAMPLE-${sourceType}`,sourceType,source:`${sourceType} fixture`,publisher:'Fixture Publisher',sourceUrl:`https://example.org/media/${sourceType.toLowerCase()}`,eventKey:`media-event-${sourceType.toLowerCase()}`,headline:`Media fixture ${sourceType}`,claimIds:[`CLAIM-${sourceType}`],evidenceIds:[`EVIDENCE-${sourceType}`]});
    const item=runAIIntelligenceIntake([record]).items[0]!;
    assert.equal(item.sourceType,'NEWS'); assert.equal(item.institutionView,null);
    assert.equal(item.provenance.sources[0]!.sourceType,sourceType);
  }
});

test('Sprint 3B adapter interface supports all intake source types without changing the common enum',async()=>{
  const records=aiIntakeSourceTypes.map((sourceType,index)=>sourceRecord({
    sourceRecordId:`SAMPLE-TYPE-${sourceType}`,sourceType,source:`${sourceType} fixture`,sourceUrl:`https://example.org/types/${sourceType.toLowerCase()}`,
    companyKey:null,company:null,eventKey:`source-type-${index}`,headline:`Source type fixture ${index}`,publishedAt:`2026-09-${String(10+index).padStart(2,'0')}T14:00:00Z`,
    claimIds:[`CLAIM-TYPE-${index}`],evidenceIds:[`EVIDENCE-TYPE-${index}`]
  }));
  const result=await collectAIIntelligence(new FixtureAIIntakeAdapter(records));
  assert.equal(result.items.length,aiIntakeSourceTypes.length); assert.equal(result.rejected.length,0);
  assert.deepEqual(new Set(result.items.flatMap(item=>item.provenance.sources.map(source=>source.sourceType))),new Set<AIIntakeSourceType>(aiIntakeSourceTypes));
});

test('Sprint 3B duplicate layer detects URL, headline, and company/theme/time-window duplicates',()=>{
  const original=sourceRecord();
  const sameUrl=sourceRecord({sourceRecordId:'DUP-URL',headline:'Different headline',sourceUrl:'https://example.org/openai/platform-update?utm_source=test',eventKey:'different-event-url',claimIds:['CLAIM-DUP-URL'],evidenceIds:['EVIDENCE-DUP-URL']});
  const sameHeadline=sourceRecord({sourceRecordId:'DUP-HEADLINE',sourceUrl:'https://example.org/other/headline',eventKey:'different-event-headline',claimIds:['CLAIM-DUP-HEADLINE'],evidenceIds:['EVIDENCE-DUP-HEADLINE']});
  const sameWindow=sourceRecord({sourceRecordId:'DUP-WINDOW',sourceUrl:'https://example.org/other/window',headline:'A wholly different headline',eventKey:'different-event-window',publishedAt:'2026-09-20T15:00:00Z',claimIds:['CLAIM-DUP-WINDOW'],evidenceIds:['EVIDENCE-DUP-WINDOW']});
  const result=runAIIntelligenceIntake([original,sameUrl,sameHeadline,sameWindow]);
  assert.equal(result.items.length,1); assert.equal(result.duplicates.length,3);
  assert.ok(result.duplicates[0]!.reasons.includes('SAME_URL'));
  assert.ok(result.duplicates[1]!.reasons.includes('SAME_HEADLINE_FINGERPRINT'));
  assert.ok(result.duplicates[2]!.reasons.includes('SAME_COMPANY_THEME_TIME_WINDOW'));
  assert.equal(headlineFingerprint(original.headline),headlineFingerprint(`  ${original.headline.toUpperCase()}! `));
});

test('Sprint 3B merges independent sources for one event and retains every claim, evidence, and provenance record',()=>{
  const official=sourceRecord();
  const media=sourceRecord({sourceRecordId:'SAMPLE-PRIMARY-MEDIA-OPENAI-1',sourceType:'PRIMARY_MEDIA',source:'Primary media fixture',publisher:'Fixture Wire',sourceUrl:'https://example.net/reporting/openai-platform',publishedAt:'2026-09-20T14:30:00Z',collectedAt:'2026-09-20T14:35:00Z',headline:'Independent report on OpenAI infrastructure',summary:'Fixture media summary from an independently linked source.',sourceFacts:['The fixture media source separately reports the infrastructure event.'],claimIds:['CLAIM-SAMPLE-OPENAI-2'],evidenceIds:['EVIDENCE-SAMPLE-OPENAI-2'],verificationStatus:'PARTIALLY_VERIFIED',confidence:78,aiInterpretation:'The second source supports event grouping while verification remains conservative.'});
  const result=runAIIntelligenceIntake([official,media]);
  assert.equal(result.items.length,1); assert.equal(result.duplicates.length,0);
  const item=result.items[0]!; const group=result.eventGroups[0]!;
  assert.equal(group.sourceCount,2); assert.deepEqual(group.sourceTypes,['OFFICIAL','PRIMARY_MEDIA']);
  assert.deepEqual(item.claimIds,['CLAIM-SAMPLE-OPENAI-1','CLAIM-SAMPLE-OPENAI-2']);
  assert.deepEqual(item.evidenceIds,['EVIDENCE-SAMPLE-OPENAI-1','EVIDENCE-SAMPLE-OPENAI-2']);
  assert.equal(item.provenance.sources.length,2); assert.equal(item.verificationStatus,'PARTIALLY_VERIFIED');
  assert.deepEqual(item.relatedThemeIds,[]);
  assert.equal(item.provenance.themeLinks!.length,1);
  assert.equal(result.duplicateThemeLinks.length,1);
  assert.equal(result.duplicateThemeLinks[0]!.themeId,'theme:ai-infrastructure');
  assert.equal(result.duplicateThemeLinks[0]!.duplicateSourceRecordId,'SAMPLE-PRIMARY-MEDIA-OPENAI-1');
  assert.deepEqual(item.provenance.themeLinks![0]!.evidenceIds,['EVIDENCE-SAMPLE-OPENAI-1','EVIDENCE-SAMPLE-OPENAI-2']);
  assert.equal(group.eventId,item.eventId); assert.equal(group.themeId,item.themeId);
});

test('Sprint 3B follow-up supports one event linked to multiple legitimate themes',()=>{
  const robotics=sourceRecord({sourceRecordId:'SAMPLE-ROBOTICS-THEME',sourceType:'PRIMARY_MEDIA',source:'Robotics media fixture',publisher:'Fixture Wire',sourceUrl:'https://example.net/robotics-theme',headline:'Independent robotics impact analysis',themeKey:'robotics',theme:'Robotics',claimIds:['CLAIM-ROBOTICS-THEME'],evidenceIds:['EVIDENCE-ROBOTICS-THEME'],verificationStatus:'PARTIALLY_VERIFIED',confidence:75});
  const result=runAIIntelligenceIntake([robotics,sourceRecord()]);
  assert.equal(result.items.length,1); assert.equal(result.rejected.length,0);
  const item=result.items[0]!; const group=result.eventGroups[0]!;
  assert.equal(item.themeId,'theme:ai-infrastructure');
  assert.equal(group.primaryThemeId,'theme:ai-infrastructure');
  assert.deepEqual(item.relatedThemeIds,['theme:robotics']);
  assert.deepEqual(group.relatedThemeIds,['theme:robotics']);
  assert.deepEqual(item.provenance.themeLinks!.map(link=>link.themeId),['theme:ai-infrastructure','theme:robotics']);
  assert.deepEqual(item.provenance.themeLinks!.find(link=>link.themeId==='theme:robotics')!.evidenceIds,['EVIDENCE-ROBOTICS-THEME']);
});

test('Sprint 3B follow-up canonicalizes theme aliases and deduplicates repeated theme links',()=>{
  const alias=sourceRecord({sourceRecordId:'SAMPLE-AI-INFRA-ALIAS',sourceType:'PRIMARY_MEDIA',source:'Alias media fixture',publisher:'Fixture Wire',sourceUrl:'https://example.net/ai-infra-alias',headline:'Independent AI infrastructure theme coverage',themeKey:'AI Infra',theme:'AI Infrastructure',claimIds:['CLAIM-AI-INFRA-ALIAS'],evidenceIds:['EVIDENCE-AI-INFRA-ALIAS'],verificationStatus:'PARTIALLY_VERIFIED',confidence:74});
  const result=runAIIntelligenceIntake([sourceRecord(),alias]);
  const item=result.items[0]!;
  assert.equal(canonicalThemeId('AI Infra'),'theme:ai-infrastructure');
  assert.equal(item.themeId,'theme:ai-infrastructure');
  assert.deepEqual(item.relatedThemeIds,[]);
  assert.equal(item.provenance.themeLinks!.length,1);
  assert.equal(result.duplicateThemeLinks.length,1);
  assert.equal(result.duplicateThemeLinks[0]!.themeId,'theme:ai-infrastructure');
  assert.equal(result.duplicateThemeLinks[0]!.duplicateSourceRecordId,'SAMPLE-AI-INFRA-ALIAS');
  assert.deepEqual(item.provenance.themeLinks![0]!.sourceIds,['SAMPLE-OFFICIAL-OPENAI-1','SAMPLE-AI-INFRA-ALIAS']);
  assert.deepEqual(item.provenance.themeLinks![0]!.evidenceIds,['EVIDENCE-SAMPLE-OPENAI-1','EVIDENCE-AI-INFRA-ALIAS']);
});

test('Sprint 3B rejects missing source URL or published time without fabricating either value',()=>{
  const missingUrl=sourceRecord({sourceRecordId:'MISSING-URL',sourceUrl:''});
  const missingTime=sourceRecord({sourceRecordId:'MISSING-TIME',publishedAt:''});
  const result=runAIIntelligenceIntake([missingUrl,missingTime]);
  assert.equal(result.items.length,0); assert.equal(result.rejected.length,2);
  assert.ok(result.rejected[0]!.errors.some(error=>error.startsWith('sourceUrl:')));
  assert.ok(result.rejected[1]!.errors.some(error=>error.startsWith('publishedAt:')));
  assert.doesNotMatch(JSON.stringify(result),/example\.invalid|1970-01-01/);
});

test('Sprint 3B keeps source facts, institution view, and AI interpretation separate',()=>{
  const news=sourceRecord({sourceRecordId:'MEDIA-INSTITUTION-GUARD',sourceType:'PRIMARY_MEDIA',institutionView:'Buy rating'});
  const copiedInterpretation=sourceRecord({sourceRecordId:'COPIED-INTERPRETATION',aiInterpretation:'Fixture summary derived from the linked official sample.'});
  const result=runAIIntelligenceIntake([news,copiedInterpretation]);
  assert.equal(result.items.length,0); assert.equal(result.rejected.length,2);
  assert.ok(result.rejected[0]!.errors.some(error=>error.includes('media news must remain null')));
  assert.ok(result.rejected[1]!.errors.some(error=>error.includes('distinct from source-derived facts')));
  const accepted=runAIIntelligenceIntake([sourceRecord()]);
  assert.notEqual(accepted.audit[0]!.sourceFacts[0],accepted.audit[0]!.aiInterpretation);
  assert.equal(accepted.items[0]!.institutionView,null);
});

test('Sprint 3B preserves Golden Day, current Daily, Blogger, and A4 behavior',async()=>{
  for(const [date,generatedAt] of [['2026-09-11','2026-09-13T05:17:44Z'],['2026-09-16','2026-09-17T10:22:10.573Z']] as const){
    const input=read<InputBundle>(`data/manual/${date}/input.json`); const original=JSON.stringify(input);
    const result=runPipeline(input,sources,rules,generatedAt);
    assert.equal(JSON.stringify(input),original); assert.equal(result.report.tradingDate,date);
    const preview=createBloggerPreview(result.report,result.evidence,publishingConfig);
    assert.equal(preview.status,'PREVIEW_READY'); assert.doesNotMatch(preview.html,/sourceFacts|sourceRecordId|aiInterpretation/);
    if(date==='2026-09-11'){
      const a4=await renderA4MasterOnDemand(result.report,result.evidence,mkdtempSync(join(tmpdir(),'sprint-3b-a4-')),{audience:'admin',action:'A4_REPORT_RENDER'},{regenerate:true,bloggerRecord:preview,publishingConfig});
      assert.equal(a4.layout.onePage,true); assert.equal(a4.layout.overflow,false);
    }
  }
});

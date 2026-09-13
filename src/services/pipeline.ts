import { createHash } from 'node:crypto';
import type { EvidencePackage, EvidenceRecord, FieldProvenance, InputBundle, KoreaImpactCandidate, Outcome, Rule, Source, StageResult, ValidationResult } from '../domain/models.js';
import { normalize, validate, worst, groups } from './validation.js';
import { analyze } from './analysis.js';
import { generateReport, markdown } from './report.js';
import { marketChange } from '../utils/calculations.js';
import { entitySchemas, ruleSchema, schemaErrors, sourceSchema } from '../data/schemas.js';
export function configurationErrors(sources:Source[],rules:Rule[]): string[] {
  const errors=[...sources.flatMap(s=>schemaErrors(s,sourceSchema)),...rules.flatMap(r=>schemaErrors(r,ruleSchema))];
  if(new Set(sources.map(s=>s.sourceId)).size!==sources.length) errors.push('중복 출처 ID');
  if(new Set(rules.map(r=>r.ruleId)).size!==rules.length) errors.push('중복 Rule ID');
  if(rules.some(r=>!Number.isInteger(r.baseStrength)||!Number.isInteger(r.evidenceRequirements.minimumSources))) errors.push('규칙 강도/최소 출처 수는 정수');
  return errors;
}
export function runPipeline(raw:unknown,sources:Source[],rules:Rule[],generatedAt=new Date().toISOString()): Outcome {
  const stages:StageResult[]=[]; const step=(stage:string,status:StageResult['status'],detail='')=>stages.push({stage,status,detail});
  step('Input','OK','원본 입력 보존');
  const normalized=normalize(raw); step('Normalize',normalized.input?'OK':'BLOCKED','자동 보간/수치 변환 없음');
  const configErrors=configurationErrors(sources,rules);
  const fallback:InputBundle={schemaVersion:'1.0',sample:true,tradingDate:'1970-01-01',asOf:generatedAt,session:{status:'HOLIDAY',closeAt:'1970-01-01T00:00:00Z',sourceId:'UNAVAILABLE',sourceUrl:'https://example.invalid/unavailable'},market:[],macro:[],companyEvents:[],filings:[],news:[],signals:[],koreaContext:{calendar:[],counterFactors:[]}};
  const input=normalized.input??fallback;
  const validation:ValidationResult=normalized.input?validate(input,sources):{status:'BLOCKED',issues:normalized.issues,excludedIds:['input']};
  for(const message of configErrors) validation.issues.push({recordId:'configuration',field:'schema',status:'BLOCKED',message});
  validation.status=worst(validation.issues.map(i=>i.status));
  step('Validate',validation.status);
  step('Deduplicate',validation.issues.some(i=>i.field==='duplicate'||i.field==='id')?'REVIEW_REQUIRED':'OK','중복 레코드 분석 제외');
  step('Detect Conflict',validation.issues.some(i=>i.status==='CONFLICT')?'CONFLICT':'OK');
  const safeInput=structuredClone(input);
  const names=['MarketSnapshot','MacroRelease','CompanyEvent','FilingRecord','NewsReference'] as const;
  groups.forEach((group,index)=>{
    const usable=input[group].filter(r=>schemaErrors(r,entitySchemas[names[index]!]).length===0&&!validation.excludedIds.includes(r.id));
    // Each group retains only its own validated runtime entity type.
    Object.assign(safeInput,{[group]:usable});
  });
  if(validation.excludedIds.includes('session')||configErrors.length) {for(const group of groups) Object.assign(safeInput,{[group]:[]});safeInput.signals=[];}
  let candidates:KoreaImpactCandidate[]=[];
  if(normalized.input&&!configErrors.length) {
    try {
      const result=analyze(safeInput,validation,rules,sources);candidates=result.candidates;validation.issues.push(...result.issues);
      step('Identify Major Drivers',result.issues.length?'REVIEW_REQUIRED':'OK','수동 근거 연결 신호. 자동 원인 추정 없음');
      step('Apply US-Korea Rules','OK');
      step('Score Evidence',worst(candidates.map(c=>c.status)));
      step('Generate Impact Candidates',worst(candidates.map(c=>c.status)),`${candidates.length}건`);
    } catch(error) {validation.issues.push({recordId:'analysis',field:'pipeline',status:'REVIEW_REQUIRED',message:String(error)});for(const s of ['Identify Major Drivers','Apply US-Korea Rules','Score Evidence','Generate Impact Candidates']) step(s,'REVIEW_REQUIRED','분석 부분 실패: 원고 및 근거 생성 계속');}
  } else for(const s of ['Identify Major Drivers','Apply US-Korea Rules','Score Evidence','Generate Impact Candidates']) step(s,'BLOCKED');
  for(const c of candidates.filter(c=>c.status!=='OK')) validation.issues.push({recordId:c.id,field:'confidenceScore',status:c.status,message:'근거 부족 또는 반대변수 누적으로 HOLD 처리'});
  validation.status=worst(validation.issues.map(i=>i.status));
  const inputSha256=createHash('sha256').update(JSON.stringify(raw)).digest('hex');
  // Never persist article body/unknown news fields, even when rejected by validation.
  const storedInput=structuredClone(raw);
  const redactedFields:string[]=[];
  if(storedInput&&typeof storedInput==='object'&&!Array.isArray(storedInput)) {
    const obj=storedInput as Record<string,unknown>;
    if(Array.isArray(obj.news)) obj.news=obj.news.map((n:unknown,index:number)=>{
      if(!n||typeof n!=='object'||Array.isArray(n)) {redactedFields.push(`news[${index}]`);return null;}
      return Object.fromEntries(Object.entries(n).filter(([key])=>{const keep=Object.hasOwn(entitySchemas.NewsReference.properties!,key);if(!keep) redactedFields.push(`news[${index}].${key}`);return keep;}));
    });
  }
  const reportId=`${input.sample?'SAMPLE':'MANUAL'}-${normalized.input?input.tradingDate:'INVALID-INPUT'}-${createHash('sha256').update(JSON.stringify({raw,rules,sources})).digest('hex').slice(0,12)}`;
  const report=generateReport(safeInput,validation,candidates,reportId,generatedAt);
  if(!normalized.input) {report.tradingDate='INVALID_INPUT';report.seoTitle='BLOCKED — 입력 형식 오류';report.threeLineSummary=['입력 형식 오류','시장 해석 생성 안 함','근거 패키지의 원본 및 검증 오류 확인'];report.sections=report.sections.map(s=>({...s,items:[{text:'BLOCKED — 입력 형식 오류로 생성 불가',nature:'CONFIRMED_FACT',evidenceIds:[]}]}));}
  const blocked=!normalized.input||configErrors.length>0||validation.issues.some(i=>i.status==='BLOCKED');
  if(blocked) report.status='BLOCKED';
  step('Generate Blog Draft',blocked?'BLOCKED':'OK');
  const evidenceRecords:EvidenceRecord[]=[];
  if(normalized.input) for(const group of groups) for(const [position,rawRecord] of input[group].entries()) {
    const r=rawRecord && typeof rawRecord==='object'?rawRecord:{};
    const record=r as unknown as Record<string,unknown>;
    const id=typeof record.id==='string'?record.id:`${group}[${position}]`;
    const field=(name:string)=>typeof record[name]==='string'?record[name] as string:'UNAVAILABLE';
    let calculation:unknown=null;
    if(group==='market'&&typeof record.close==='number'&&typeof record.previousClose==='number') calculation=marketChange(record.close,record.previousClose);
    const originalValue=group==='news'?(storedInput as InputBundle).news[position]:rawRecord;
    const fieldProvenance=record.fieldProvenance&&typeof record.fieldProvenance==='object'&&!Array.isArray(record.fieldProvenance)?record.fieldProvenance as Record<string,FieldProvenance>:undefined;
    evidenceRecords.push({evidenceId:id,reportId,sourceType:group,sourceId:field('sourceId'),sourceUrl:field('sourceUrl'),observedAt:field('observedAt'),collectedAt:field('collectedAt'),originalValue,unit:field('unit'),calculation,ruleVersion:'1.0.0',usedInSections:report.sections.filter(s=>s.items.some(i=>i.evidenceIds.includes(id))).map(s=>s.id),verificationStatus:worst(validation.issues.filter(i=>i.recordId===id).map(i=>i.status)),...(fieldProvenance?{fieldProvenance}: {})});
  }
  step('Generate Evidence Package','OK','JSON 원본/계산/규칙/검수상태 보관');
  const evidence:EvidencePackage={reportId,reportMetadata:report,sourceMetadata:sources,records:evidenceRecords,originalInput:storedInput,inputSha256,redactedFields,analysisRules:rules,impactJudgments:candidates,aiGeneratedText:{used:false,text:null,reason:'결정론적 템플릿 생성; 외부 AI 호출 없음. 생성 문장은 reportMetadata.sections에 보존.'},validationResult:validation,manualReviewStatus:'PENDING',publishStatus:'BLOCKED',stages,reviewMetrics:{automaticGeneratedAt:generatedAt,humanReviewStartedAt:null,humanReviewCompletedAt:null,durationMinutes:null,measurementStatus:'NOT_MEASURED',edits:{NUMERIC_ERROR:[],SOURCE_ERROR:[],CAUSE_INTERPRETATION:[],KOREA_LINK:[],WORDING:[],SEO:[],LINK:[],OTHER:[]}}};
  const operationalStatus=blocked?'BLOCKED':validation.issues.some(i=>i.status==='INVALID_VALUE')?'FAILED':validation.issues.some(i=>!['HOLIDAY','EARLY_CLOSE'].includes(i.status))?'REVIEW_REQUIRED':'PASS';
  return {operationalStatus,report,evidence,markdown:markdown(report,validation),stages};
}

import { createHash } from 'node:crypto';
import type { ClaimVerificationStatus } from '../domain/models.js';
import {
  createCommonIntelligenceId,
  INTELLIGENCE_SCHEMA_VERSION,
  validateResearchIntelligenceItem,
  type IntelligenceSourceType,
  type ResearchIntelligenceItem
} from './schema.js';

export const AI_INTAKE_ADAPTER_VERSION='3B.AI-INTAKE.1.0' as const;
export const aiIntakeSourceTypes=['OFFICIAL','COMPANY_IR','REGULATORY','PRIMARY_MEDIA','SECONDARY_MEDIA','MANUAL'] as const;
export type AIIntakeSourceType=typeof aiIntakeSourceTypes[number];
export const AI_INTAKE_INITIAL_COVERAGE={
  companies:['OpenAI','Google / DeepMind','NVIDIA','Microsoft','Meta','Anthropic','Amazon / AWS','AI startups'],
  domains:['Semiconductors','Data centers','Cloud','Power','Robotics','AI regulation / policy','AI investment / M&A / CAPEX']
} as const;

export interface AIIntakeSourceRecord {
  sourceRecordId:string;
  sourceType:AIIntakeSourceType;
  source:string;
  publisher:string|null;
  analyst:string|null;
  sourceUrl:string;
  publishedAt:string;
  collectedAt:string;
  market:string|null;
  country:string|null;
  region:string|null;
  companyKey:string|null;
  company:string|null;
  ticker:string|null;
  sector:string|null;
  industry:string|null;
  themeKey:string;
  theme:string;
  eventKey:string;
  parentEventKey:string|null;
  relatedCompanyKeys:string[];
  relatedSectors:string[];
  relatedMarkets:string[];
  headline:string;
  summary:string;
  sourceFacts:string[];
  claimIds:string[];
  evidenceIds:string[];
  verificationStatus:ClaimVerificationStatus;
  confidence:number;
  aiInterpretation:string;
  institutionView:string|null;
  validityHorizon:ResearchIntelligenceItem['validityHorizon'];
}

export interface AIIntakeAdapter {
  readonly adapterId:string;
  collect():Promise<AIIntakeSourceRecord[]>;
}

export class FixtureAIIntakeAdapter implements AIIntakeAdapter {
  readonly adapterId='fixture-manual-ai-intake';
  constructor(private readonly records:readonly AIIntakeSourceRecord[]) {}
  async collect():Promise<AIIntakeSourceRecord[]> { return [...structuredClone(this.records)]; }
}

export type DuplicateReason='SAME_URL'|'SAME_HEADLINE_FINGERPRINT'|'SAME_COMPANY_THEME_TIME_WINDOW';
export interface AIIntakeDuplicate {
  duplicateSourceRecordId:string;
  retainedSourceRecordId:string;
  reasons:DuplicateReason[];
}
export interface AIThemeLinkDuplicate {
  eventId:NonNullable<ResearchIntelligenceItem['eventId']>;
  themeId:NonNullable<ResearchIntelligenceItem['themeId']>;
  duplicateSourceRecordId:string;
  retainedSourceRecordId:string;
}
export interface AIIntakeRejection { sourceRecordId:string; errors:string[] }
export interface AIIntakeEventGroup {
  eventId:ResearchIntelligenceItem['eventId'];
  /** Backwards-compatible alias for primaryThemeId. */
  themeId:ResearchIntelligenceItem['themeId'];
  primaryThemeId:ResearchIntelligenceItem['themeId'];
  relatedThemeIds:NonNullable<ResearchIntelligenceItem['relatedThemeIds']>;
  intelligenceId:string;
  sourceCount:number;
  sourceTypes:AIIntakeSourceType[];
}
export interface AIIntakeAuditRecord {
  sourceRecordId:string;
  intelligenceId:string;
  eventId:ResearchIntelligenceItem['eventId'];
  sourceFacts:string[];
  aiInterpretation:string;
  sourceUrl:string;
}
export interface AIIntakeResult {
  items:ResearchIntelligenceItem[];
  eventGroups:AIIntakeEventGroup[];
  duplicates:AIIntakeDuplicate[];
  duplicateThemeLinks:AIThemeLinkDuplicate[];
  rejected:AIIntakeRejection[];
  audit:AIIntakeAuditRecord[];
}
export interface AIIntakeOptions {
  timeWindowHours?:number;
  themeAliases?:Readonly<Record<string,string>>;
}

const nonEmpty=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0;
const unique=<T>(values:T[])=>[...new Set(values)];
const isoTime=(value:unknown)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));
const idSeed=(value:unknown)=>nonEmpty(value)&&/[a-z0-9]/i.test(value);
const sourcePriority:Record<AIIntakeSourceType,number>={OFFICIAL:1,COMPANY_IR:2,REGULATORY:3,PRIMARY_MEDIA:4,SECONDARY_MEDIA:5,MANUAL:6};
const verificationPriority:ClaimVerificationStatus[]=['CONFLICT','REJECTED','REVIEW_REQUIRED','UNVERIFIED','INSUFFICIENT_SOURCES'];
export const DEFAULT_AI_THEME_ALIASES:Readonly<Record<string,string>>={
  'ai-infra':'ai-infrastructure','artificial-intelligence-infrastructure':'ai-infrastructure',
  'ai-capital-expenditure':'ai-capex','capex':'ai-capex',
  'semiconductor':'semiconductors','chips':'semiconductors',
  'data-center':'data-centers','datacenter':'data-centers','datacenters':'data-centers',
  'cloud-computing':'cloud','robot':'robotics',
  'ai-policy':'ai-regulation-policy','ai-regulation':'ai-regulation-policy',
  'm-a':'ai-investment-ma','mergers-acquisitions':'ai-investment-ma'
};

const normalizedThemeKey=(value:string)=>value.normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
function themeAliasMap(custom:Readonly<Record<string,string>>={}):Map<string,string> {
  return new Map(Object.entries({...DEFAULT_AI_THEME_ALIASES,...custom}).map(([alias,canonical])=>[normalizedThemeKey(alias),normalizedThemeKey(canonical)]));
}
export function canonicalThemeId(value:string,custom:Readonly<Record<string,string>>={}):NonNullable<ResearchIntelligenceItem['themeId']> {
  const normalized=normalizedThemeKey(value); const canonical=themeAliasMap(custom).get(normalized)??normalized;
  return createCommonIntelligenceId('theme',canonical);
}

function canonicalUrl(raw:unknown):string|null {
  if(typeof raw!=='string') return null;
  try {
    const url=new URL(raw);
    if(!['https:','http:'].includes(url.protocol)) return null;
    for(const key of [...url.searchParams.keys()]) if(key.toLowerCase().startsWith('utm_')) url.searchParams.delete(key);
    url.hash='';
    if(url.pathname.length>1) url.pathname=url.pathname.replace(/\/+$/,'');
    return url.toString();
  } catch { return null; }
}

export function headlineFingerprint(headline:string):string {
  const normalized=headline.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
  return createHash('sha256').update(normalized).digest('hex').slice(0,20);
}

function inputErrors(record:AIIntakeSourceRecord):string[] {
  const errors:string[]=[];
  for(const key of ['sourceRecordId','source','themeKey','theme','eventKey','headline','summary','aiInterpretation'] as const) if(!nonEmpty(record[key])) errors.push(`${key}: required`);
  if(!aiIntakeSourceTypes.includes(record.sourceType)) errors.push('sourceType: unsupported');
  if(!canonicalUrl(record.sourceUrl)) errors.push('sourceUrl: valid HTTP(S) URL required; no fallback is generated');
  if(!isoTime(record.publishedAt)) errors.push('publishedAt: timezone-aware source time required; no fallback is generated');
  if(!isoTime(record.collectedAt)) errors.push('collectedAt: timezone-aware collection time required');
  if(!idSeed(record.themeKey)||!idSeed(record.eventKey)||record.companyKey!==null&&!idSeed(record.companyKey)||record.parentEventKey!==null&&!idSeed(record.parentEventKey)) errors.push('company/theme/event keys: canonical ASCII identifier required');
  if(!Array.isArray(record.sourceFacts)||!record.sourceFacts.length||record.sourceFacts.some(fact=>!nonEmpty(fact))) errors.push('sourceFacts: at least one source-derived fact required');
  if(!Array.isArray(record.claimIds)||!record.claimIds.length||record.claimIds.some(id=>!nonEmpty(id))) errors.push('claimIds: at least one traceable ID required');
  if(!Array.isArray(record.evidenceIds)||!record.evidenceIds.length||record.evidenceIds.some(id=>!nonEmpty(id))) errors.push('evidenceIds: at least one traceable ID required');
  if(nonEmpty(record.aiInterpretation)&&nonEmpty(record.summary)&&(record.aiInterpretation.trim()===record.summary.trim()||(Array.isArray(record.sourceFacts)&&record.sourceFacts.some(fact=>nonEmpty(fact)&&fact.trim()===record.aiInterpretation.trim())))) errors.push('aiInterpretation: must remain distinct from source-derived facts');
  if(record.institutionView!==null&&(!nonEmpty(record.institutionView)||!nonEmpty(record.analyst)||!nonEmpty(record.publisher))) errors.push('institutionView: analyst and publisher required when present');
  if(['PRIMARY_MEDIA','SECONDARY_MEDIA'].includes(record.sourceType)&&record.institutionView!==null) errors.push('institutionView: media news must remain null');
  if(!Number.isFinite(record.confidence)||record.confidence<0||record.confidence>100) errors.push('confidence: 0..100 required');
  for(const key of ['relatedCompanyKeys','relatedSectors','relatedMarkets','claimIds','evidenceIds'] as const) {
    const values=record[key];
    if(!Array.isArray(values)||values.some(value=>!nonEmpty(value))) errors.push(`${key}: string array required`);
    else if(new Set(values).size!==values.length) errors.push(`${key}: duplicates are not allowed`);
  }
  if(Array.isArray(record.relatedCompanyKeys)&&record.relatedCompanyKeys.some(key=>!idSeed(key))) errors.push('relatedCompanyKeys: canonical ASCII identifiers required');
  return errors;
}

function schemaSourceType(type:AIIntakeSourceType):IntelligenceSourceType {
  if(type==='OFFICIAL') return 'OFFICIAL';
  if(type==='COMPANY_IR') return 'COMPANY_IR';
  if(type==='REGULATORY') return 'REGULATORY_FILING';
  return 'NEWS';
}

function normalize(record:AIIntakeSourceRecord,aliases:Readonly<Record<string,string>>):ResearchIntelligenceItem {
  const companyId=record.companyKey===null?null:createCommonIntelligenceId('company',record.companyKey);
  const themeId=canonicalThemeId(record.themeKey,aliases);
  const eventId=createCommonIntelligenceId('event',record.eventKey);
  const parentEventId=record.parentEventKey===null?null:createCommonIntelligenceId('event',record.parentEventKey);
  const relatedCompanies=unique([...(companyId?[companyId]:[]),...record.relatedCompanyKeys.map(key=>createCommonIntelligenceId('company',key))]);
  const fieldProvenance=Object.fromEntries(['headline','summary','publishedAt','company','theme'].map(field=>[field,{sourceId:record.sourceRecordId,sourceUrl:record.sourceUrl,observedAt:record.publishedAt,collectedAt:record.collectedAt}]));
  return {
    schemaVersion:INTELLIGENCE_SCHEMA_VERSION,
    intelligenceId:`intel:ai:${eventId.slice('event:'.length)}`,
    contentType:'AI_INTELLIGENCE',sourceType:schemaSourceType(record.sourceType),source:record.source,
    publisher:record.publisher,analyst:record.analyst,publishedAt:record.publishedAt,collectedAt:record.collectedAt,
    market:record.market,country:record.country,region:record.region,companyId,company:record.company,ticker:record.ticker,
    sector:record.sector,industry:record.industry,themeId,theme:record.theme,eventId,parentEventId,
    relatedCompanies,relatedSectors:unique(record.relatedSectors),relatedMarkets:unique(record.relatedMarkets),
    headline:record.headline,summary:record.summary,claimIds:unique(record.claimIds),evidenceIds:unique(record.evidenceIds),
    stance:'NEUTRAL',targetPrice:null,rating:null,ratingChange:null,targetPriceChange:null,
    institutionView:record.institutionView,aiInterpretation:record.aiInterpretation,sourceUrl:record.sourceUrl,
    verificationStatus:record.verificationStatus,confidence:record.confidence,validityHorizon:record.validityHorizon,
    provenance:{legacyReportId:null,inputSha256:null,adapterVersion:AI_INTAKE_ADAPTER_VERSION,sources:record.evidenceIds.map(evidenceId=>({
      evidenceId,sourceType:record.sourceType,sourceId:record.sourceRecordId,sourceUrl:record.sourceUrl,
      observedAt:record.publishedAt,collectedAt:record.collectedAt,verificationStatus:record.verificationStatus,fieldProvenance
    })),themeLinks:[{themeId,evidenceIds:unique(record.evidenceIds),sourceIds:[record.sourceRecordId],sourceUrls:[record.sourceUrl]}]}
  };
}

function mergeStatus(items:ResearchIntelligenceItem[]):ClaimVerificationStatus {
  if(items.every(item=>item.verificationStatus==='VERIFIED')) return 'VERIFIED';
  for(const status of verificationPriority) if(items.some(item=>item.verificationStatus===status)) return status;
  if(items.length>1) return 'PARTIALLY_VERIFIED';
  if(items[0]?.verificationStatus==='PRIMARY_SOURCE_ONLY') return 'PRIMARY_SOURCE_ONLY';
  return 'PARTIALLY_VERIFIED';
}

function mergeEvent(entries:{record:AIIntakeSourceRecord;item:ResearchIntelligenceItem}[]):ResearchIntelligenceItem {
  const sorted=[...entries].sort((a,b)=>sourcePriority[a.record.sourceType]-sourcePriority[b.record.sourceType]||a.record.sourceRecordId.localeCompare(b.record.sourceRecordId));
  const primary=sorted[0]!;
  const items=sorted.map(entry=>entry.item);
  if(items.length===1) return primary.item;
  const latestCollected=[...items].sort((a,b)=>Date.parse(b.collectedAt)-Date.parse(a.collectedAt))[0]!.collectedAt;
  const earliestPublished=[...items].sort((a,b)=>Date.parse(a.publishedAt!)-Date.parse(b.publishedAt!))[0]!.publishedAt;
  const relatedThemeIds=unique(items.flatMap(item=>[...(item.themeId?[item.themeId]:[]),...(item.relatedThemeIds??[])])).filter(themeId=>themeId!==primary.item.themeId);
  const themeLinks=[...new Set(items.flatMap(item=>item.provenance.themeLinks??[]).map(link=>link.themeId))].map(themeId=>{
    const links=items.flatMap(item=>item.provenance.themeLinks??[]).filter(link=>link.themeId===themeId);
    return {themeId,evidenceIds:unique(links.flatMap(link=>link.evidenceIds)),sourceIds:unique(links.flatMap(link=>link.sourceIds)),sourceUrls:unique(links.flatMap(link=>link.sourceUrls))};
  });
  return {
    ...primary.item,
    source:`${primary.item.source} + ${items.length-1} corroborating source${items.length===2?'':'s'}`,
    publisher:null,analyst:null,publishedAt:earliestPublished,collectedAt:latestCollected,
    relatedCompanies:unique(items.flatMap(item=>item.relatedCompanies)),
    relatedThemeIds,
    relatedSectors:unique(items.flatMap(item=>item.relatedSectors)),
    relatedMarkets:unique(items.flatMap(item=>item.relatedMarkets)),
    claimIds:unique(items.flatMap(item=>item.claimIds)),evidenceIds:unique(items.flatMap(item=>item.evidenceIds)),
    institutionView:items.find(item=>item.institutionView!==null)?.institutionView??null,
    verificationStatus:mergeStatus(items),confidence:Number(Math.min(...items.map(item=>item.confidence)).toFixed(2)),
    provenance:{...primary.item.provenance,sources:items.flatMap(item=>item.provenance.sources),themeLinks}
  };
}

export function runAIIntelligenceIntake(records:readonly AIIntakeSourceRecord[],options:AIIntakeOptions={}):AIIntakeResult {
  const timeWindowMs=Math.max(0,options.timeWindowHours??24)*60*60*1000;
  const accepted:{record:AIIntakeSourceRecord;item:ResearchIntelligenceItem;canonicalUrl:string;headlineFingerprint:string}[]=[];
  const duplicates:AIIntakeDuplicate[]=[]; const rejected:AIIntakeRejection[]=[];
  for(const sourceRecord of records) {
    const record=structuredClone(sourceRecord);
    const errors=inputErrors(record);
    if(errors.length){rejected.push({sourceRecordId:record.sourceRecordId||'(missing)',errors});continue;}
    const url=canonicalUrl(record.sourceUrl)!; const fingerprint=headlineFingerprint(record.headline);
    const companyId=record.companyKey===null?null:createCommonIntelligenceId('company',record.companyKey);
    const themeId=canonicalThemeId(record.themeKey,options.themeAliases);
    const eventId=createCommonIntelligenceId('event',record.eventKey);
    const duplicate=accepted.find(entry=>{
      const sameWindow=Math.abs(Date.parse(entry.record.publishedAt)-Date.parse(record.publishedAt))<=timeWindowMs;
      const entryCompany=entry.record.companyKey===null?null:createCommonIntelligenceId('company',entry.record.companyKey);
      const entryTheme=canonicalThemeId(entry.record.themeKey,options.themeAliases);
      const entryEvent=createCommonIntelligenceId('event',entry.record.eventKey);
      return entry.canonicalUrl===url||entry.headlineFingerprint===fingerprint||(entryEvent!==eventId&&companyId!==null&&entryCompany===companyId&&entryTheme===themeId&&sameWindow);
    });
    if(duplicate){
      const entryCompany=duplicate.record.companyKey===null?null:createCommonIntelligenceId('company',duplicate.record.companyKey);
      const reasons:DuplicateReason[]=[];
      if(duplicate.canonicalUrl===url) reasons.push('SAME_URL');
      if(duplicate.headlineFingerprint===fingerprint) reasons.push('SAME_HEADLINE_FINGERPRINT');
      if(createCommonIntelligenceId('event',duplicate.record.eventKey)!==eventId&&companyId!==null&&entryCompany===companyId&&canonicalThemeId(duplicate.record.themeKey,options.themeAliases)===themeId&&Math.abs(Date.parse(duplicate.record.publishedAt)-Date.parse(record.publishedAt))<=timeWindowMs) reasons.push('SAME_COMPANY_THEME_TIME_WINDOW');
      duplicates.push({duplicateSourceRecordId:record.sourceRecordId,retainedSourceRecordId:duplicate.record.sourceRecordId,reasons});continue;
    }
    const item=normalize(record,options.themeAliases??{}); const validation=validateResearchIntelligenceItem(item);
    if(!validation.valid){rejected.push({sourceRecordId:record.sourceRecordId,errors:validation.errors});continue;}
    accepted.push({record,item,canonicalUrl:url,headlineFingerprint:fingerprint});
  }
  const groups=new Map<string,{record:AIIntakeSourceRecord;item:ResearchIntelligenceItem}[]>();
  for(const entry of accepted){const key=entry.item.eventId!;groups.set(key,[...(groups.get(key)??[]),entry]);}
  const duplicateThemeLinks:AIThemeLinkDuplicate[]=[];
  for(const [eventId,entries] of groups){
    const retainedByTheme=new Map<string,string>();
    for(const entry of [...entries].sort((a,b)=>sourcePriority[a.record.sourceType]-sourcePriority[b.record.sourceType]||a.record.sourceRecordId.localeCompare(b.record.sourceRecordId))){
      const themeId=entry.item.themeId!; const retained=retainedByTheme.get(themeId);
      if(retained) duplicateThemeLinks.push({eventId:eventId as NonNullable<ResearchIntelligenceItem['eventId']>,themeId,duplicateSourceRecordId:entry.record.sourceRecordId,retainedSourceRecordId:retained});
      else retainedByTheme.set(themeId,entry.record.sourceRecordId);
    }
  }
  const items=[...groups.values()].map(mergeEvent).sort((a,b)=>a.intelligenceId.localeCompare(b.intelligenceId));
  for(const item of items){const validation=validateResearchIntelligenceItem(item);if(!validation.valid) throw new Error(`merged AI Intelligence item invalid: ${validation.errors.join('; ')}`);}
  const eventGroups=items.map(item=>{const group=groups.get(item.eventId!)!;return {eventId:item.eventId,themeId:item.themeId,primaryThemeId:item.themeId,relatedThemeIds:item.relatedThemeIds??[],intelligenceId:item.intelligenceId,sourceCount:group.length,sourceTypes:unique(group.map(entry=>entry.record.sourceType))};});
  const audit=accepted.map(entry=>({sourceRecordId:entry.record.sourceRecordId,intelligenceId:entry.item.intelligenceId,eventId:entry.item.eventId,sourceFacts:structuredClone(entry.record.sourceFacts),aiInterpretation:entry.record.aiInterpretation,sourceUrl:entry.record.sourceUrl}));
  return {items,eventGroups,duplicates,duplicateThemeLinks,rejected,audit};
}

export async function collectAIIntelligence(adapter:AIIntakeAdapter,options:AIIntakeOptions={}):Promise<AIIntakeResult> {
  return runAIIntelligenceIntake(await adapter.collect(),options);
}

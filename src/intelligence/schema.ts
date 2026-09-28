import type { ClaimVerificationStatus, FieldProvenance, Horizon } from '../domain/models.js';

export const INTELLIGENCE_SCHEMA_VERSION = '1.0.0' as const;
export const intelligenceContentTypes = ['AI_INTELLIGENCE','WALL_STREET_INTELLIGENCE','KOREA_MARKET_INTELLIGENCE','US_MARKET_DAILY'] as const;
export type IntelligenceContentType = typeof intelligenceContentTypes[number];
export const intelligenceSourceTypes = ['OFFICIAL','MARKET_DATA','REGULATORY_FILING','COMPANY_IR','NEWS','SELL_SIDE_RESEARCH','AGGREGATED_VERIFIED_SOURCES'] as const;
export type IntelligenceSourceType = typeof intelligenceSourceTypes[number];
export const intelligenceStances = ['BULLISH','BEARISH','NEUTRAL','MIXED','NOT_APPLICABLE'] as const;
export type IntelligenceStance = typeof intelligenceStances[number];
export type IntelligenceValidityHorizon = Horizon|'LONG_TERM';
export type CompanyId=`company:${string}`;
export type ThemeId=`theme:${string}`;
export type EventId=`event:${string}`;
export type CommonIntelligenceId=CompanyId|ThemeId|EventId;

export function createCommonIntelligenceId(kind:'company',value:string):CompanyId;
export function createCommonIntelligenceId(kind:'theme',value:string):ThemeId;
export function createCommonIntelligenceId(kind:'event',value:string):EventId;
export function createCommonIntelligenceId(kind:'company'|'theme'|'event',value:string):CommonIntelligenceId {
  const normalized=value.normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'');
  if(!normalized) throw new Error(`${kind} ID source must contain an ASCII letter or number`);
  return `${kind}:${normalized}` as CommonIntelligenceId;
}

export interface IntelligenceSourceProvenance {
  evidenceId:string; sourceType:string; sourceId:string; sourceUrl:string;
  observedAt:string; collectedAt:string; verificationStatus:string;
  fieldProvenance:Record<string,FieldProvenance>;
}
export interface IntelligenceProvenance {
  legacyReportId:string|null; inputSha256:string|null; adapterVersion:string|null;
  sources:IntelligenceSourceProvenance[];
  themeLinks?:IntelligenceThemeLinkProvenance[];
}
export interface IntelligenceThemeLinkProvenance {
  themeId:ThemeId; evidenceIds:string[]; sourceIds:string[]; sourceUrls:string[];
}

/** Stable cross-domain contract. Nullable values stay explicit; no missing fact is inferred. */
export interface ResearchIntelligenceItem {
  schemaVersion:typeof INTELLIGENCE_SCHEMA_VERSION;
  intelligenceId:string; contentType:IntelligenceContentType; sourceType:IntelligenceSourceType;
  source:string; publisher:string|null; analyst:string|null; publishedAt:string|null; collectedAt:string;
  market:string|null; country:string|null; region:string|null;
  companyId:CompanyId|null; company:string|null; ticker:string|null; sector:string|null; industry:string|null;
  /** Backwards-compatible primary theme. */
  themeId:ThemeId|null; theme:string|null;
  /** Additional legitimate themes for the same event; never repeats themeId. */
  relatedThemeIds?:ThemeId[];
  eventId:EventId|null; parentEventId:EventId|null;
  relatedCompanies:CompanyId[]; relatedSectors:string[]; relatedMarkets:string[];
  headline:string; summary:string; claimIds:string[]; evidenceIds:string[];
  stance:IntelligenceStance; targetPrice:number|null; rating:string|null; ratingChange:string|null;
  targetPriceChange:number|null;
  /** The source institution's view. Never populated from aiInterpretation. */
  institutionView:string|null;
  /** MOTUS AI analysis. Never populated from institutionView. */
  aiInterpretation:string|null;
  sourceUrl:string; verificationStatus:ClaimVerificationStatus; confidence:number;
  validityHorizon:IntelligenceValidityHorizon; provenance:IntelligenceProvenance;
}

export interface IntelligenceValidationResult { valid:boolean; errors:string[] }
const nonEmpty=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0;
const nullableText=(value:unknown)=>value===null||nonEmpty(value);
const isoTime=(value:unknown)=>nonEmpty(value)&&Number.isFinite(Date.parse(value));
const httpUrl=(value:unknown)=>{if(!nonEmpty(value))return false;try{return ['http:','https:'].includes(new URL(value).protocol);}catch{return false;}};
const stringList=(value:unknown)=>Array.isArray(value)&&value.every(nonEmpty)&&new Set(value).size===value.length;
const commonId=(value:unknown,kind:'company'|'theme'|'event')=>nonEmpty(value)&&new RegExp(`^${kind}:[a-z0-9][a-z0-9._:-]*$`).test(value);

export function validateResearchIntelligenceItem(value:unknown):IntelligenceValidationResult {
  if(!value||typeof value!=='object'||Array.isArray(value)) return {valid:false,errors:['$: object required']};
  const item=value as Record<string,unknown>; const errors:string[]=[];
  const required=['schemaVersion','intelligenceId','contentType','sourceType','source','publisher','analyst','publishedAt','collectedAt','market','country','region','companyId','company','ticker','sector','industry','themeId','theme','eventId','parentEventId','relatedCompanies','relatedSectors','relatedMarkets','headline','summary','claimIds','evidenceIds','stance','targetPrice','rating','ratingChange','targetPriceChange','institutionView','aiInterpretation','sourceUrl','verificationStatus','confidence','validityHorizon','provenance'];
  for(const key of required) if(!Object.hasOwn(item,key)) errors.push(`$.${key}: required`);
  if(item.schemaVersion!==INTELLIGENCE_SCHEMA_VERSION) errors.push('$.schemaVersion: unsupported');
  if(!nonEmpty(item.intelligenceId)) errors.push('$.intelligenceId: non-empty string required');
  if(!intelligenceContentTypes.includes(item.contentType as IntelligenceContentType)) errors.push('$.contentType: unsupported');
  if(!intelligenceSourceTypes.includes(item.sourceType as IntelligenceSourceType)) errors.push('$.sourceType: unsupported');
  for(const key of ['source','headline','summary'] as const) if(!nonEmpty(item[key])) errors.push(`$.${key}: non-empty string required`);
  for(const key of ['publisher','analyst','market','country','region','companyId','company','ticker','sector','industry','themeId','theme','eventId','parentEventId','rating','ratingChange','institutionView','aiInterpretation'] as const) if(!nullableText(item[key])) errors.push(`$.${key}: string or null required`);
  for(const [key,kind] of [['companyId','company'],['themeId','theme'],['eventId','event'],['parentEventId','event']] as const) if(item[key]!==null&&!commonId(item[key],kind)) errors.push(`$.${key}: namespaced ${kind} ID required`);
  if(item.publishedAt!==null&&!isoTime(item.publishedAt)) errors.push('$.publishedAt: ISO timestamp or null required');
  if(!isoTime(item.collectedAt)) errors.push('$.collectedAt: ISO timestamp required');
  for(const key of ['relatedCompanies','relatedSectors','relatedMarkets','claimIds','evidenceIds'] as const) if(!stringList(item[key])) errors.push(`$.${key}: unique string array required`);
  if(Array.isArray(item.relatedCompanies)&&item.relatedCompanies.some(value=>!commonId(value,'company'))) errors.push('$.relatedCompanies: namespaced company IDs required');
  if(item.relatedThemeIds!==undefined){
    if(!stringList(item.relatedThemeIds)||(item.relatedThemeIds as unknown[]).some(value=>!commonId(value,'theme'))) errors.push('$.relatedThemeIds: unique namespaced theme ID array required');
    if(Array.isArray(item.relatedThemeIds)&&item.themeId!==null&&item.relatedThemeIds.includes(item.themeId)) errors.push('$.relatedThemeIds: primary themeId must not be repeated');
  }
  if(!intelligenceStances.includes(item.stance as IntelligenceStance)) errors.push('$.stance: unsupported');
  for(const key of ['targetPrice','targetPriceChange'] as const) if(item[key]!==null&&(typeof item[key]!=='number'||!Number.isFinite(item[key]))) errors.push(`$.${key}: finite number or null required`);
  if(typeof item.targetPrice==='number'&&item.targetPrice<0) errors.push('$.targetPrice: negative value');
  if(!httpUrl(item.sourceUrl)) errors.push('$.sourceUrl: HTTP(S) URL required');
  const statuses:ClaimVerificationStatus[]=['VERIFIED','PARTIALLY_VERIFIED','CONFLICT','UNVERIFIED','INSUFFICIENT_SOURCES','PRIMARY_SOURCE_ONLY','REVIEW_REQUIRED','REJECTED'];
  if(!statuses.includes(item.verificationStatus as ClaimVerificationStatus)) errors.push('$.verificationStatus: unsupported');
  if(typeof item.confidence!=='number'||!Number.isFinite(item.confidence)||item.confidence<0||item.confidence>100) errors.push('$.confidence: 0..100 required');
  if(!['INTRADAY','SHORT_TERM','MEDIUM_TERM','LONG_TERM'].includes(item.validityHorizon as string)) errors.push('$.validityHorizon: unsupported');
  if(item.parentEventId!==null&&item.eventId===null) errors.push('$.eventId: required when parentEventId is present');
  if(item.parentEventId!==null&&item.parentEventId===item.eventId) errors.push('$.parentEventId: must differ from eventId');
  if(!item.provenance||typeof item.provenance!=='object'||Array.isArray(item.provenance)) errors.push('$.provenance: object required');
  else {
    const provenance=item.provenance as Record<string,unknown>;
    for(const key of ['legacyReportId','inputSha256','adapterVersion'] as const) if(!nullableText(provenance[key])) errors.push(`$.provenance.${key}: string or null required`);
    if(!Array.isArray(provenance.sources)) errors.push('$.provenance.sources: array required');
    else provenance.sources.forEach((source,index)=>{
      if(!source||typeof source!=='object'||Array.isArray(source)){errors.push(`$.provenance.sources[${index}]: object required`);return;}
      const record=source as Record<string,unknown>;
      for(const key of ['evidenceId','sourceType','sourceId','verificationStatus'] as const) if(!nonEmpty(record[key])) errors.push(`$.provenance.sources[${index}].${key}: non-empty string required`);
      if(!httpUrl(record.sourceUrl)) errors.push(`$.provenance.sources[${index}].sourceUrl: HTTP(S) URL required`);
      if(!isoTime(record.observedAt)||!isoTime(record.collectedAt)) errors.push(`$.provenance.sources[${index}]: ISO timestamps required`);
      if(!record.fieldProvenance||typeof record.fieldProvenance!=='object'||Array.isArray(record.fieldProvenance)) errors.push(`$.provenance.sources[${index}].fieldProvenance: object required`);
    });
    if(provenance.themeLinks!==undefined){
      if(!Array.isArray(provenance.themeLinks)) errors.push('$.provenance.themeLinks: array required');
      else {
        provenance.themeLinks.forEach((link,index)=>{
          if(!link||typeof link!=='object'||Array.isArray(link)){errors.push(`$.provenance.themeLinks[${index}]: object required`);return;}
          const record=link as Record<string,unknown>;
          if(!commonId(record.themeId,'theme')) errors.push(`$.provenance.themeLinks[${index}].themeId: namespaced theme ID required`);
          for(const key of ['evidenceIds','sourceIds','sourceUrls'] as const) if(!stringList(record[key])) errors.push(`$.provenance.themeLinks[${index}].${key}: unique string array required`);
          if(Array.isArray(record.sourceUrls)&&record.sourceUrls.some(url=>!httpUrl(url))) errors.push(`$.provenance.themeLinks[${index}].sourceUrls: HTTP(S) URLs required`);
        });
        const linkThemeIds=provenance.themeLinks.flatMap(link=>link&&typeof link==='object'&&!Array.isArray(link)&&typeof (link as Record<string,unknown>).themeId==='string'?[(link as Record<string,unknown>).themeId as string]:[]);
        if(new Set(linkThemeIds).size!==linkThemeIds.length) errors.push('$.provenance.themeLinks: duplicate theme linkage');
        const itemThemeIds=[...(typeof item.themeId==='string'?[item.themeId]:[]),...(Array.isArray(item.relatedThemeIds)?item.relatedThemeIds.filter((theme):theme is string=>typeof theme==='string'):[])];
        if(itemThemeIds.some(themeId=>!linkThemeIds.includes(themeId))||linkThemeIds.some(themeId=>!itemThemeIds.includes(themeId))) errors.push('$.provenance.themeLinks: must match primary and related themes');
      }
    }
  }
  if(item.contentType==='AI_INTELLIGENCE'&&!nonEmpty(item.aiInterpretation)) errors.push('$.aiInterpretation: required for AI Intelligence');
  if(item.contentType==='WALL_STREET_INTELLIGENCE'&&!nonEmpty(item.institutionView)) errors.push('$.institutionView: required for Wall Street Intelligence');
  if(item.contentType==='KOREA_MARKET_INTELLIGENCE'&&(!nonEmpty(item.market)||!nonEmpty(item.country))) errors.push('$.market/country: required for Korea Market Intelligence');
  return {valid:errors.length===0,errors};
}

import type { MajorIndexHistory } from '../content/publisher-schema.js';
import type { CompanyId, EventId, ResearchIntelligenceItem, ThemeId } from './schema.js';

export const newsletterAssetLayers=['DAILY','TOPIC','WEEKLY','EVERGREEN'] as const;
export type NewsletterAssetLayer=typeof newsletterAssetLayers[number];
export const legacyAINewsSourceKinds=['GOOGLE_ALERTS','GMAIL','RSS','OFFICIAL_SOURCES','EXISTING_DAILY_COLLECTION','CONTENT_LIBRARY'] as const;
export type LegacyAINewsSourceKind=typeof legacyAINewsSourceKinds[number];

export interface NewsletterSourceLink { label:string; url:string; publisher:string|null }
export interface NewsletterContentAsset {
  assetId:string; layer:NewsletterAssetLayer; title:string;
  companyIds:CompanyId[]; themeIds:ThemeId[]; eventIds:EventId[]; intelligenceIds:string[];
  parentAssetIds:string[];
}
export interface LegacyAINewsAssetAdapter {
  readonly adapterId:string;
  readonly sourceKind:LegacyAINewsSourceKind;
  collect():Promise<NewsletterContentAsset[]>;
}

export class StaticLegacyAINewsAssetAdapter implements LegacyAINewsAssetAdapter {
  constructor(readonly adapterId:string,readonly sourceKind:LegacyAINewsSourceKind,private readonly assets:readonly NewsletterContentAsset[]) {}
  async collect():Promise<NewsletterContentAsset[]> { return [...structuredClone(this.assets)]; }
}

export interface NewsletterIntelligenceEntry {
  intelligenceId:string; headline:string; summary:string;
  company:string|null; companyId:CompanyId|null; primaryThemeId:ThemeId|null; relatedThemeIds:ThemeId[]; eventId:EventId|null;
  institutionView:string|null; aiInterpretation:string|null;
  sourceFacts:string[]; sources:NewsletterSourceLink[]; assetIds:string[];
}
export interface NewsletterAtAGlance { headline:string; summary:string; bullets:string[] }
export interface NewsletterMarketMetric { label:string; value:string; change:string|null; direction:'UP'|'DOWN'|'FLAT' }
export interface NewsletterMarketSnapshot { summary:string; metrics:NewsletterMarketMetric[]; marketHistory?:MajorIndexHistory }
export interface NewsletterCrossIntelligence { headline:string; summary:string; linkedIntelligenceIds:string[]; sourceIds:string[] }
export interface NewsletterInvestmentMapEntry { theme:string; upstream:string[]; beneficiaries:string[]; risks:string[] }
export interface NewsletterWatchItem { headline:string; watchFor:string; validityHorizon:string }

export interface NewsletterViewModel {
  newsletterId:string; issueDate:string; issueNumber:number; title:string; subtitle:string; editorialSummary:string;
  todayAtAGlance?:NewsletterAtAGlance;
  marketSnapshot?:NewsletterMarketSnapshot;
  aiIntelligence?:NewsletterIntelligenceEntry[];
  wallStreetIntelligence?:NewsletterIntelligenceEntry[];
  koreaMarketIntelligence?:NewsletterIntelligenceEntry[];
  crossIntelligence?:NewsletterCrossIntelligence[];
  investmentMap?:NewsletterInvestmentMapEntry[];
  whatToWatch?:NewsletterWatchItem[];
  sources:NewsletterSourceLink[];
  assets:NewsletterContentAsset[];
}

export interface NewsletterBuildInput extends Omit<NewsletterViewModel,'aiIntelligence'|'wallStreetIntelligence'|'koreaMarketIntelligence'|'crossIntelligence'|'investmentMap'|'whatToWatch'> {
  aiIntelligence?:NewsletterIntelligenceEntry[];
  wallStreetIntelligence?:NewsletterIntelligenceEntry[];
  koreaMarketIntelligence?:NewsletterIntelligenceEntry[];
  crossIntelligence?:NewsletterCrossIntelligence[];
  investmentMap?:NewsletterInvestmentMapEntry[];
  whatToWatch?:NewsletterWatchItem[];
}

const nonEmpty=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0;
const url=(value:unknown)=>{if(!nonEmpty(value))return false;try{return ['http:','https:'].includes(new URL(value).protocol);}catch{return false;}};
const uniqueStrings=(values:string[])=>[...new Set(values.map(value=>value.trim()).filter(Boolean))];

export function newsletterEntryFromIntelligence(item:ResearchIntelligenceItem,input:{sourceFacts:string[];sources:NewsletterSourceLink[];assetIds?:string[]}):NewsletterIntelligenceEntry {
  return {
    intelligenceId:item.intelligenceId,headline:item.headline,summary:item.summary,company:item.company,companyId:item.companyId,
    primaryThemeId:item.themeId,relatedThemeIds:[...(item.relatedThemeIds??[])],eventId:item.eventId,
    institutionView:item.institutionView,aiInterpretation:item.aiInterpretation,
    sourceFacts:uniqueStrings(input.sourceFacts),sources:structuredClone(input.sources),assetIds:uniqueStrings(input.assetIds??[])
  };
}

const optionalArray=<T>(value:T[]|undefined):T[]|undefined=>value?.length?structuredClone(value):undefined;
export function createNewsletterViewModel(input:NewsletterBuildInput):NewsletterViewModel {
  const model:NewsletterViewModel={
    newsletterId:input.newsletterId,issueDate:input.issueDate,issueNumber:input.issueNumber,title:input.title,subtitle:input.subtitle,
    editorialSummary:input.editorialSummary,sources:structuredClone(input.sources),assets:structuredClone(input.assets),
    ...(input.todayAtAGlance?{todayAtAGlance:structuredClone(input.todayAtAGlance)}:{}),
    ...(input.marketSnapshot?{marketSnapshot:structuredClone(input.marketSnapshot)}:{}),
    ...(optionalArray(input.aiIntelligence)?{aiIntelligence:optionalArray(input.aiIntelligence)!}:{}),
    ...(optionalArray(input.wallStreetIntelligence)?{wallStreetIntelligence:optionalArray(input.wallStreetIntelligence)!}:{}),
    ...(optionalArray(input.koreaMarketIntelligence)?{koreaMarketIntelligence:optionalArray(input.koreaMarketIntelligence)!}:{}),
    ...(optionalArray(input.crossIntelligence)?{crossIntelligence:optionalArray(input.crossIntelligence)!}:{}),
    ...(optionalArray(input.investmentMap)?{investmentMap:optionalArray(input.investmentMap)!}:{}),
    ...(optionalArray(input.whatToWatch)?{whatToWatch:optionalArray(input.whatToWatch)!}:{})
  };
  const errors=validateNewsletterViewModel(model);
  if(errors.length) throw new Error(`invalid NewsletterViewModel: ${errors.join('; ')}`);
  return model;
}

export function validateNewsletterViewModel(value:unknown):string[] {
  if(!value||typeof value!=='object'||Array.isArray(value)) return ['$: object required'];
  const model=value as Record<string,unknown>; const errors:string[]=[];
  for(const key of ['newsletterId','title','subtitle','editorialSummary'] as const) if(!nonEmpty(model[key])) errors.push(`${key}: required`);
  if(!nonEmpty(model.issueDate)||!/^\d{4}-\d{2}-\d{2}$/.test(model.issueDate)||!Number.isFinite(Date.parse(model.issueDate))||new Date(model.issueDate).toISOString().slice(0,10)!==model.issueDate) errors.push('issueDate: valid date required');
  if(typeof model.issueNumber!=='number'||!Number.isInteger(model.issueNumber)||model.issueNumber<1) errors.push('issueNumber: positive integer required');
  for(const section of ['aiIntelligence','wallStreetIntelligence','koreaMarketIntelligence','crossIntelligence','investmentMap','whatToWatch'] as const) if(model[section]!==undefined&&(!Array.isArray(model[section])||model[section].length===0)) errors.push(`${section}: omit empty sections`);
  for(const section of ['aiIntelligence','wallStreetIntelligence','koreaMarketIntelligence'] as const) if(Array.isArray(model[section])) (model[section] as unknown[]).forEach((entry,index)=>errors.push(...validateEntry(entry,`${section}[${index}]`)));
  if(model.todayAtAGlance!==undefined){
    if(!model.todayAtAGlance||typeof model.todayAtAGlance!=='object'||Array.isArray(model.todayAtAGlance)) errors.push('todayAtAGlance: object required');
    else {const section=model.todayAtAGlance as Record<string,unknown>;if(!nonEmpty(section.headline)||!nonEmpty(section.summary)||!stringArray(section.bullets)) errors.push('todayAtAGlance: headline, summary and bullets required');}
  }
  if(model.marketSnapshot!==undefined){
    if(!model.marketSnapshot||typeof model.marketSnapshot!=='object'||Array.isArray(model.marketSnapshot)) errors.push('marketSnapshot: object required');
    else {const section=model.marketSnapshot as Record<string,unknown>;if(!nonEmpty(section.summary)||!Array.isArray(section.metrics)) errors.push('marketSnapshot: summary and metrics required');else section.metrics.forEach((metric,index)=>{
      if(!metric||typeof metric!=='object'||Array.isArray(metric)){errors.push(`marketSnapshot.metrics[${index}]: object required`);return;}
      const record=metric as Record<string,unknown>;if(!nonEmpty(record.label)||!nonEmpty(record.value)||record.change!==null&&!nonEmpty(record.change)||!['UP','DOWN','FLAT'].includes(record.direction as string)) errors.push(`marketSnapshot.metrics[${index}]: invalid metric`);
    });}
  }
  if(Array.isArray(model.crossIntelligence)) model.crossIntelligence.forEach((item,index)=>{
    if(!item||typeof item!=='object'||Array.isArray(item)){errors.push(`crossIntelligence[${index}]: object required`);return;}
    const record=item as Record<string,unknown>;if(!nonEmpty(record.headline)||!nonEmpty(record.summary)||!stringArray(record.linkedIntelligenceIds)||!stringArray(record.sourceIds)) errors.push(`crossIntelligence[${index}]: invalid cross-intelligence item`);
  });
  if(Array.isArray(model.investmentMap)) model.investmentMap.forEach((item,index)=>{
    if(!item||typeof item!=='object'||Array.isArray(item)){errors.push(`investmentMap[${index}]: object required`);return;}
    const record=item as Record<string,unknown>;if(!nonEmpty(record.theme)||!stringArray(record.upstream)||!stringArray(record.beneficiaries)||!stringArray(record.risks)) errors.push(`investmentMap[${index}]: invalid investment map item`);
  });
  if(Array.isArray(model.whatToWatch)) model.whatToWatch.forEach((item,index)=>{
    if(!item||typeof item!=='object'||Array.isArray(item)){errors.push(`whatToWatch[${index}]: object required`);return;}
    const record=item as Record<string,unknown>;if(!nonEmpty(record.headline)||!nonEmpty(record.watchFor)||!nonEmpty(record.validityHorizon)) errors.push(`whatToWatch[${index}]: invalid watch item`);
  });
  if(!Array.isArray(model.sources)) errors.push('sources: array required');
  else (model.sources as unknown[]).forEach((source,index)=>errors.push(...validateSource(source,`sources[${index}]`)));
  if(!Array.isArray(model.assets)) errors.push('assets: array required');
  else (model.assets as unknown[]).forEach((asset,index)=>{
    if(!asset||typeof asset!=='object'||Array.isArray(asset)){errors.push(`assets[${index}]: object required`);return;}
    const record=asset as Record<string,unknown>;
    if(!nonEmpty(record.assetId)||!nonEmpty(record.title)||!newsletterAssetLayers.includes(record.layer as NewsletterAssetLayer)) errors.push(`assets[${index}]: valid asset metadata required`);
    for(const key of ['companyIds','themeIds','eventIds','intelligenceIds','parentAssetIds'] as const) if(!stringArray(record[key])) errors.push(`assets[${index}].${key}: unique string array required`);
  });
  return errors;
}
function stringArray(value:unknown):value is string[] { return Array.isArray(value)&&value.every(nonEmpty)&&new Set(value).size===value.length; }

function validateEntry(value:unknown,path:string):string[] {
  if(!value||typeof value!=='object'||Array.isArray(value)) return [`${path}: object required`];
  const entry=value as Record<string,unknown>; const errors:string[]=[];
  for(const key of ['intelligenceId','headline','summary'] as const) if(!nonEmpty(entry[key])) errors.push(`${path}.${key}: required`);
  for(const key of ['institutionView','aiInterpretation'] as const) if(entry[key]!==null&&!nonEmpty(entry[key])) errors.push(`${path}.${key}: string or null required`);
  if(nonEmpty(entry.institutionView)&&nonEmpty(entry.aiInterpretation)&&entry.institutionView.trim()===entry.aiInterpretation.trim()) errors.push(`${path}: institutionView and aiInterpretation must remain separate`);
  if(!Array.isArray(entry.sourceFacts)||entry.sourceFacts.some(fact=>!nonEmpty(fact))) errors.push(`${path}.sourceFacts: string array required`);
  if(!Array.isArray(entry.sources)) errors.push(`${path}.sources: array required`); else entry.sources.forEach((source,index)=>errors.push(...validateSource(source,`${path}.sources[${index}]`)));
  return errors;
}
function validateSource(value:unknown,path:string):string[] {
  if(!value||typeof value!=='object'||Array.isArray(value)) return [`${path}: object required`];
  const source=value as Record<string,unknown>;
  return [...(!nonEmpty(source.label)?[`${path}.label: required`]:[]),...(!url(source.url)?[`${path}.url: HTTP(S) required`]:[]),...(source.publisher!==null&&!nonEmpty(source.publisher)?[`${path}.publisher: string or null required`]:[])];
}

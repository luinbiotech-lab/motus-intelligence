import type { ClaimVerificationStatus } from '../domain/models.js';
import { createCommonIntelligenceId, type CompanyId, type EventId, type ThemeId } from './schema.js';

export const brokerageResearchTypes=['MORNING_BRIEF','MARKET_STRATEGY','INDUSTRY_REPORT','COMPANY_REPORT','INVESTMENT_STRATEGY','TARGET_PRICE_CHANGE','RATING_CHANGE'] as const;
export type BrokerageResearchType=typeof brokerageResearchTypes[number];
export const brokerageSourceKinds=['OFFICIAL_RESEARCH_PAGE','OFFICIAL_PDF','OFFICIAL_DISTRIBUTION','VERIFIED_MIRROR'] as const;
export type BrokerageSourceKind=typeof brokerageSourceKinds[number];
export const brokerageRatings=['BUY','HOLD','SELL','OUTPERFORM','NEUTRAL','UNDERPERFORM','OTHER'] as const;
export type BrokerageRating=typeof brokerageRatings[number];
export const targetPriceChanges=['UP','DOWN','UNCHANGED','UNKNOWN'] as const;
export type TargetPriceChange=typeof targetPriceChanges[number];
export const ratingChanges=['UPGRADE','DOWNGRADE','UNCHANGED','INITIATED','WITHDRAWN','UNKNOWN'] as const;
export type RatingChange=typeof ratingChanges[number];
export type BrokerageSourceFormat='HTML'|'PDF'|'DISTRIBUTION'|'MIRROR';

export interface BrokerageInstitution { institutionId:string; name:string; aliases:string[] }
export const koreaBrokerageInstitutions:readonly BrokerageInstitution[]=[
  {institutionId:'mirae-asset-securities',name:'미래에셋증권',aliases:['미래에셋','Mirae Asset Securities']},
  {institutionId:'nh-investment-securities',name:'NH투자증권',aliases:['NH투자','NH Investment & Securities']},
  {institutionId:'samsung-securities',name:'삼성증권',aliases:['Samsung Securities']},
  {institutionId:'shinhan-securities',name:'신한투자증권',aliases:['신한금융투자','Shinhan Securities']},
  {institutionId:'hana-securities',name:'하나증권',aliases:['하나금융투자','Hana Securities']},
  {institutionId:'kiwoom-securities',name:'키움증권',aliases:['Kiwoom Securities']},
  {institutionId:'daishin-securities',name:'대신증권',aliases:['Daishin Securities']},
  {institutionId:'yuanta-securities-korea',name:'유안타증권',aliases:['유안타증권코리아','Yuanta Securities Korea']},
  {institutionId:'ls-securities',name:'LS증권',aliases:['이베스트투자증권','LS Securities']},
  {institutionId:'db-financial-investment',name:'DB금융투자',aliases:['DB Financial Investment']}
] as const;

export class BrokerageInstitutionRegistry {
  private readonly aliases=new Map<string,BrokerageInstitution>();
  constructor(readonly institutions:readonly BrokerageInstitution[]){
    for(const institution of institutions){
      if(!asciiKey(institution.institutionId)||!nonEmpty(institution.name)) throw new Error('invalid brokerage institution registry entry');
      for(const value of [institution.institutionId,institution.name,...institution.aliases]){
        const key=lookupKey(value); const existing=this.aliases.get(key);
        if(existing&&existing.institutionId!==institution.institutionId) throw new Error(`duplicate brokerage alias: ${value}`);
        this.aliases.set(key,structuredClone(institution));
      }
    }
  }
  resolve(value:string):BrokerageInstitution|null { return structuredClone(this.aliases.get(lookupKey(value))??null); }
}
export const defaultBrokerageInstitutionRegistry=new BrokerageInstitutionRegistry(koreaBrokerageInstitutions);

export interface BrokerageMoney { value:number; currency:string }
export interface BrokerageEvidence { evidenceId:string; text:string; sourceRecordId:string; sourceUrl:string; page:string|null; section:string|null }
export interface BrokerageSourceProvenance {
  sourceRecordId:string; sourceKind:BrokerageSourceKind; sourceFormat:BrokerageSourceFormat; sourceUrl:string;
  publishedAt:string; collectedAt:string; page:string|null; section:string|null; extractedFields:string[];
}
export interface BrokerageResearchItem {
  researchId:string; institutionId:string; publisher:string; analyst:string|null; publishedAt:string; collectedAt:string;
  researchType:BrokerageResearchType; headline:string; summary:string; market:string|null; sector:string|null; industry:string|null;
  companyId:CompanyId|null; company:string|null; ticker:string|null; themeId:ThemeId|null; eventId:EventId|null;
  institutionView:string; evidence:BrokerageEvidence[];
  targetPrice:BrokerageMoney|null; previousTargetPrice:BrokerageMoney|null; targetPriceChange:TargetPriceChange;
  rating:BrokerageRating|null; previousRating:BrokerageRating|null; ratingChange:RatingChange;
  investmentStrategy:string[]; riskFactors:string[]; aiInterpretation:string|null;
  sourceUrl:string; verificationStatus:ClaimVerificationStatus; provenance:BrokerageSourceProvenance[];
}
export interface BrokerageResearchSourceRecord {
  researchId:string; sourceRecordId:string; publisher:string; analyst:string|null; publishedAt:string; collectedAt:string;
  researchType:BrokerageResearchType; headline:string; summary:string; market:string|null; sector:string|null; industry:string|null;
  companyKey:string|null; company:string|null; ticker:string|null; themeKey:string|null; eventKey:string|null;
  institutionView:string; evidence:{evidenceId:string;text:string}[];
  targetPrice:BrokerageMoney|null; previousTargetPrice:BrokerageMoney|null; targetPriceChange:TargetPriceChange;
  rating:BrokerageRating|null; previousRating:BrokerageRating|null; ratingChange:RatingChange;
  investmentStrategy:string[]; riskFactors:string[]; aiInterpretation:string|null;
  sourceKind:BrokerageSourceKind; sourceFormat:BrokerageSourceFormat; sourceUrl:string;
  sourcePage:string|null; sourceSection:string|null; extractedFields:string[]; verificationStatus:ClaimVerificationStatus;
}
export interface BrokerageResearchAdapter { readonly adapterId:string; collect():Promise<unknown[]> }
export class FixtureBrokerageResearchAdapter implements BrokerageResearchAdapter {
  readonly adapterId='fixture-manual-korea-brokerage-research';
  constructor(private readonly records:readonly unknown[]) {}
  async collect():Promise<unknown[]> { return [...structuredClone(this.records)]; }
}
export interface BrokerageResearchDuplicate { duplicateSourceRecordId:string; retainedResearchId:string; reason:'SAME_CANONICAL_URL'|'SAME_REPORT_IDENTITY' }
export interface BrokerageResearchIntakeResult { items:BrokerageResearchItem[]; duplicates:BrokerageResearchDuplicate[]; rejected:{sourceRecordId:string;errors:string[]}[] }

export interface KoreaResearchNewsletterEntry {
  researchId:string; publisher:string; analyst:string|null; headline:string; summary:string; institutionView:string;
  evidence:string[]; interests:string[]; investmentStrategy:string[]; riskFactors:string[];
  targetPriceLabel:string|null; ratingLabel:string|null; aiInterpretation:string|null;
  sources:{label:string;url:string;publisher:string|null}[];
}

function nonEmpty(value:unknown):value is string { return typeof value==='string'&&value.trim().length>0; }
const nullableText=(value:unknown)=>value===null||nonEmpty(value);
function asciiKey(value:unknown):value is string { return nonEmpty(value)&&/^[a-z0-9][a-z0-9-]*$/.test(value); }
function lookupKey(value:string):string { return value.normalize('NFKC').trim().toLowerCase().replace(/[\s._&-]+/g,''); }
const isoTime=(value:unknown)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));
const httpUrl=(value:unknown)=>{if(!nonEmpty(value))return false;try{return ['http:','https:'].includes(new URL(value).protocol);}catch{return false;}};
const unique=<T>(values:T[])=>[...new Set(values)];
const verificationStatuses:ClaimVerificationStatus[]=['VERIFIED','PARTIALLY_VERIFIED','CONFLICT','UNVERIFIED','INSUFFICIENT_SOURCES','PRIMARY_SOURCE_ONLY','REVIEW_REQUIRED','REJECTED'];
const sourcePriority:Record<BrokerageSourceKind,number>={OFFICIAL_RESEARCH_PAGE:1,OFFICIAL_PDF:2,OFFICIAL_DISTRIBUTION:3,VERIFIED_MIRROR:4};

export function runBrokerageResearchIntake(records:readonly unknown[],registry:BrokerageInstitutionRegistry=defaultBrokerageInstitutionRegistry):BrokerageResearchIntakeResult {
  const items:BrokerageResearchItem[]=[]; const duplicates:BrokerageResearchDuplicate[]=[]; const rejected:BrokerageResearchIntakeResult['rejected']=[];
  const byUrl=new Map<string,BrokerageResearchItem>(); const byIdentity=new Map<string,BrokerageResearchItem>();
  for(const raw of records){
    const object=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
    const sourceRecordId=nonEmpty(object.sourceRecordId)?object.sourceRecordId:'(missing)'; const errors=validateRaw(object,registry);
    if(errors.length){rejected.push({sourceRecordId,errors});continue;}
    const record=object as unknown as BrokerageResearchSourceRecord; const institution=registry.resolve(record.publisher)!;
    const url=canonicalUrl(record.sourceUrl)!; const urlKey=`${institution.institutionId}\u0000${url}`; const identity=reportIdentity(record,institution.institutionId);
    const existing=byUrl.get(urlKey)??byIdentity.get(identity);
    if(existing){
      mergeSource(existing,record,url);
      duplicates.push({duplicateSourceRecordId:record.sourceRecordId,retainedResearchId:existing.researchId,reason:byUrl.has(urlKey)?'SAME_CANONICAL_URL':'SAME_REPORT_IDENTITY'});
      byUrl.set(urlKey,existing); byIdentity.set(identity,existing); continue;
    }
    const item=normalizeResearch(record,institution,url); items.push(item); byUrl.set(urlKey,item); byIdentity.set(identity,item);
  }
  return {items,duplicates,rejected};
}
export async function collectBrokerageResearch(adapter:BrokerageResearchAdapter,registry?:BrokerageInstitutionRegistry):Promise<BrokerageResearchIntakeResult> { return runBrokerageResearchIntake(await adapter.collect(),registry); }

function validateRaw(record:Record<string,unknown>,registry:BrokerageInstitutionRegistry):string[] {
  const errors:string[]=[];
  if(Object.hasOwn(record,'factType')||Object.hasOwn(record,'marketId')||Object.hasOwn(record,'investorType')) errors.push('Korea Market Fact fields are prohibited in Brokerage Research');
  for(const key of ['researchId','sourceRecordId','publisher','headline','summary','institutionView'] as const) if(!nonEmpty(record[key])) errors.push(`${key}: required`);
  if(nonEmpty(record.publisher)&&!registry.resolve(record.publisher)) errors.push('publisher: not found in institution registry');
  if(!isoTime(record.publishedAt)) errors.push('publishedAt: timezone-aware source timestamp required; no fallback is generated');
  if(!isoTime(record.collectedAt)) errors.push('collectedAt: timezone-aware collection timestamp required');
  if(!httpUrl(record.sourceUrl)) errors.push('sourceUrl: valid HTTP(S) URL required; no fallback is generated');
  if(!brokerageResearchTypes.includes(record.researchType as BrokerageResearchType)) errors.push('researchType: unsupported');
  if(!brokerageSourceKinds.includes(record.sourceKind as BrokerageSourceKind)) errors.push('sourceKind: unsupported');
  if(!['HTML','PDF','DISTRIBUTION','MIRROR'].includes(record.sourceFormat as string)) errors.push('sourceFormat: unsupported');
  if(!verificationStatuses.includes(record.verificationStatus as ClaimVerificationStatus)) errors.push('verificationStatus: unsupported');
  for(const key of ['analyst','market','sector','industry','companyKey','company','ticker','themeKey','eventKey','sourcePage','sourceSection','aiInterpretation'] as const) if(!nullableText(record[key])) errors.push(`${key}: string or null required`);
  for(const key of ['investmentStrategy','riskFactors','extractedFields'] as const) if(!stringArray(record[key])) errors.push(`${key}: unique string array required`);
  if(!Array.isArray(record.evidence)||record.evidence.length===0) errors.push('evidence: non-empty array required'); else record.evidence.forEach((value,index)=>{
    if(!value||typeof value!=='object'||Array.isArray(value)||!nonEmpty((value as Record<string,unknown>).evidenceId)||!nonEmpty((value as Record<string,unknown>).text)) errors.push(`evidence[${index}]: evidenceId and text required`);
  });
  validateMoney(record.targetPrice,'targetPrice',errors); validateMoney(record.previousTargetPrice,'previousTargetPrice',errors);
  if(!targetPriceChanges.includes(record.targetPriceChange as TargetPriceChange)) errors.push('targetPriceChange: unsupported');
  if(record.rating!==null&&!brokerageRatings.includes(record.rating as BrokerageRating)) errors.push('rating: unsupported');
  if(record.previousRating!==null&&!brokerageRatings.includes(record.previousRating as BrokerageRating)) errors.push('previousRating: unsupported');
  if(!ratingChanges.includes(record.ratingChange as RatingChange)) errors.push('ratingChange: unsupported');
  if(record.targetPriceChange!=='UNKNOWN'&&record.targetPrice===null) errors.push('targetPrice: required for a stated target price change');
  if(['UP','DOWN','UNCHANGED'].includes(record.targetPriceChange as string)&&record.previousTargetPrice===null) errors.push('previousTargetPrice: required to structure target price comparison');
  if(record.targetPrice&&record.previousTargetPrice&&(record.targetPrice as Record<string,unknown>).currency!==(record.previousTargetPrice as Record<string,unknown>).currency) errors.push('targetPrice currency: current and previous must match');
  if(!['UNKNOWN','WITHDRAWN'].includes(record.ratingChange as string)&&record.rating===null) errors.push('rating: required for a stated rating change');
  if(['UPGRADE','DOWNGRADE','UNCHANGED'].includes(record.ratingChange as string)&&record.previousRating===null) errors.push('previousRating: required to structure rating comparison');
  if(record.ratingChange==='WITHDRAWN'&&record.previousRating===null) errors.push('previousRating: required when a rating is withdrawn');
  if(nonEmpty(record.aiInterpretation)&&nonEmpty(record.institutionView)&&record.aiInterpretation.trim()===record.institutionView.trim()) errors.push('aiInterpretation: must remain distinct from institutionView');
  if(isMoney(record.targetPrice)&&isMoney(record.previousTargetPrice)&&record.targetPriceChange!=='UNKNOWN'){
    const actual=record.targetPrice.value>record.previousTargetPrice.value?'UP':record.targetPrice.value<record.previousTargetPrice.value?'DOWN':'UNCHANGED';
    if(record.targetPriceChange!==actual) errors.push(`targetPriceChange: conflicts with structured values (${actual})`);
  }
  return errors;
}
function isMoney(value:unknown):value is BrokerageMoney { return Boolean(value)&&typeof value==='object'&&!Array.isArray(value)&&typeof (value as Record<string,unknown>).value==='number'&&typeof (value as Record<string,unknown>).currency==='string'; }
function validateMoney(value:unknown,path:string,errors:string[]):void {
  if(value===null)return;
  if(!value||typeof value!=='object'||Array.isArray(value)){errors.push(`${path}: money object or null required`);return;}
  const record=value as Record<string,unknown>;
  if(typeof record.value!=='number'||!Number.isFinite(record.value)||record.value<0) errors.push(`${path}.value: non-negative finite number required`);
  if(!nonEmpty(record.currency)||!/^[A-Z]{3}$/.test(record.currency)) errors.push(`${path}.currency: ISO-style currency code required`);
}
function stringArray(value:unknown):value is string[] { return Array.isArray(value)&&value.every(nonEmpty)&&new Set(value).size===value.length; }
function canonicalUrl(value:string):string|null { try { const url=new URL(value); if(!['http:','https:'].includes(url.protocol))return null; for(const key of [...url.searchParams.keys()])if(key.toLowerCase().startsWith('utm_'))url.searchParams.delete(key);url.hash='';if(url.pathname.length>1)url.pathname=url.pathname.replace(/\/+$/,'');return url.toString(); } catch{return null;} }
function fingerprint(value:string):string { return value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9가-힣]+/g,' ').trim().replace(/\s+/g,' '); }
function reportIdentity(record:BrokerageResearchSourceRecord,institutionId:string):string {
  return [institutionId,fingerprint(record.headline),record.publishedAt,record.companyKey??'',record.themeKey??''].join('\u0000');
}
function normalizeResearch(record:BrokerageResearchSourceRecord,institution:BrokerageInstitution,url:string):BrokerageResearchItem {
  const companyId=record.companyKey?createCommonIntelligenceId('company',record.companyKey):null;
  const themeId=record.themeKey?createCommonIntelligenceId('theme',record.themeKey):null;
  const eventId=record.eventKey?createCommonIntelligenceId('event',record.eventKey):null;
  return {
    researchId:record.researchId,institutionId:institution.institutionId,publisher:institution.name,analyst:record.analyst,publishedAt:record.publishedAt,collectedAt:record.collectedAt,
    researchType:record.researchType,headline:record.headline,summary:record.summary,market:record.market,sector:record.sector,industry:record.industry,
    companyId,company:record.company,ticker:record.ticker,themeId,eventId,institutionView:record.institutionView,
    evidence:record.evidence.map(value=>({...value,sourceRecordId:record.sourceRecordId,sourceUrl:url,page:record.sourcePage,section:record.sourceSection})),
    targetPrice:structuredClone(record.targetPrice),previousTargetPrice:structuredClone(record.previousTargetPrice),targetPriceChange:record.targetPriceChange,
    rating:record.rating,previousRating:record.previousRating,ratingChange:record.ratingChange,investmentStrategy:[...record.investmentStrategy],riskFactors:[...record.riskFactors],
    aiInterpretation:record.aiInterpretation,sourceUrl:url,verificationStatus:record.verificationStatus,provenance:[sourceProvenance(record,url)]
  };
}
function sourceProvenance(record:BrokerageResearchSourceRecord,url:string):BrokerageSourceProvenance {
  return {sourceRecordId:record.sourceRecordId,sourceKind:record.sourceKind,sourceFormat:record.sourceFormat,sourceUrl:url,publishedAt:record.publishedAt,collectedAt:record.collectedAt,page:record.sourcePage,section:record.sourceSection,extractedFields:[...record.extractedFields]};
}
function mergeSource(item:BrokerageResearchItem,record:BrokerageResearchSourceRecord,url:string):void {
  const currentPriority=Math.min(...item.provenance.map(source=>sourcePriority[source.sourceKind]));
  if(sourcePriority[record.sourceKind]<currentPriority) item.sourceUrl=url;
  if(!item.provenance.some(source=>source.sourceUrl===url&&source.sourceRecordId===record.sourceRecordId)) item.provenance.push(sourceProvenance(record,url));
  for(const evidence of record.evidence){
    if(!item.evidence.some(value=>value.evidenceId===evidence.evidenceId&&value.sourceRecordId===record.sourceRecordId)) item.evidence.push({...evidence,sourceRecordId:record.sourceRecordId,sourceUrl:url,page:record.sourcePage,section:record.sourceSection});
  }
}

export function buildKoreaResearchNewsletterEntries(items:readonly BrokerageResearchItem[]):KoreaResearchNewsletterEntry[] {
  return items.filter(item=>['VERIFIED','PARTIALLY_VERIFIED','PRIMARY_SOURCE_ONLY'].includes(item.verificationStatus)).map(item=>({
    researchId:item.researchId,publisher:item.publisher,analyst:item.analyst,headline:item.headline,summary:item.summary,institutionView:item.institutionView,
    evidence:unique(item.evidence.map(value=>value.text)),interests:unique([item.sector,item.industry,item.company,item.ticker].filter((value):value is string=>nonEmpty(value))),
    investmentStrategy:[...item.investmentStrategy],riskFactors:[...item.riskFactors],
    targetPriceLabel:priceLabel(item),ratingLabel:ratingLabel(item),aiInterpretation:item.aiInterpretation,
    sources:unique(item.provenance.map(source=>`${source.sourceUrl}\u0000${source.sourceFormat}`)).map(value=>{const [url,format]=value.split('\u0000');return {label:`${item.publisher} ${format} 원문`,url:url!,publisher:item.publisher};})
  }));
}
function priceLabel(item:BrokerageResearchItem):string|null {
  if(!item.targetPrice)return null; const current=`${item.targetPrice.value.toLocaleString('ko-KR')} ${item.targetPrice.currency}`;
  const previous=item.previousTargetPrice?`${item.previousTargetPrice.value.toLocaleString('ko-KR')} ${item.previousTargetPrice.currency}`:null;
  return `목표주가 ${current}${previous?` (이전 ${previous})`:''} · ${item.targetPriceChange}`;
}
function ratingLabel(item:BrokerageResearchItem):string|null {
  if(!item.rating)return null; return `투자의견 ${item.rating}${item.previousRating?` (이전 ${item.previousRating})`:''} · ${item.ratingChange}`;
}

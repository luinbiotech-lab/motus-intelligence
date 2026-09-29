import type { ClaimVerificationStatus } from '../domain/models.js';
import { createCommonIntelligenceId, type CompanyId, type EventId, type ThemeId } from './schema.js';

export const koreaMarketSourceCategories=['KRX','BOK_ECOS','OFFICIAL_MARKET','VERIFIED_PUBLIC','MANUAL_VERIFIED'] as const;
export type KoreaMarketSourceCategory=typeof koreaMarketSourceCategories[number];
export const koreaMarketIds=['KOSPI','KOSDAQ','USD_KRW'] as const;
export type KoreaMarketId=typeof koreaMarketIds[number];
export const koreaInvestorTypes=['FOREIGN','INSTITUTION','RETAIL'] as const;
export type KoreaInvestorType=typeof koreaInvestorTypes[number];
export const koreaFactTypes=['INDEX_LEVEL','FX_SPOT','INVESTOR_NET_FLOW','TRADING_VALUE','PROGRAM_NET_FLOW','SECTOR_CHANGE_PCT','SECURITY_CHANGE_PCT','ADVANCE_COUNT','DECLINE_COUNT'] as const;
export type KoreaMarketFactType=typeof koreaFactTypes[number];
export type KoreaCanonicalUnit='INDEX_POINT'|'PERCENT'|'KRW_PER_USD'|'KRW_MILLION'|'COUNT';
export type KoreaInputUnit=KoreaCanonicalUnit|'KRW'|'KRW_100M';
export type SectorId=`sector:${string}`;

export interface KoreaMarketRelationship {
  eventIds:EventId[]; themeIds:ThemeId[]; companyIds:CompanyId[]; sectorIds:SectorId[];
}
export interface KoreaMarketFactProvenance {
  sourceRecordId:string; sourceCategory:KoreaMarketSourceCategory; source:string; sourceUrl:string;
  observedAt:string; collectedAt:string; originalMarket:string; originalInvestor:string|null;
  originalSector:string|null; originalValue:number; originalUnit:KoreaInputUnit; normalization:string;
}
export interface KoreaMarketFact {
  factId:string; factType:KoreaMarketFactType; marketId:KoreaMarketId;
  investorType:KoreaInvestorType|null; sectorId:SectorId|null; sectorLabel:string|null;
  companyId:CompanyId|null; company:string|null; ticker:string|null;
  value:number; unit:KoreaCanonicalUnit; observedAt:string; collectedAt:string;
  sourceCategory:KoreaMarketSourceCategory; source:string; sourceUrl:string;
  verificationStatus:ClaimVerificationStatus; relationships:KoreaMarketRelationship;
  provenance:KoreaMarketFactProvenance;
}
export interface KoreaMarketRawRecord {
  sourceRecordId:string; factType:KoreaMarketFactType; market:string; investor:string|null;
  sectorKey:string|null; sectorLabel:string|null; companyKey:string|null; company:string|null; ticker:string|null;
  value:number; unit:KoreaInputUnit; observedAt:string; collectedAt:string;
  sourceCategory:KoreaMarketSourceCategory; source:string; sourceUrl:string;
  verificationStatus:ClaimVerificationStatus;
  relatedEventKeys:string[]; relatedThemeKeys:string[]; relatedCompanyKeys:string[]; relatedSectorKeys:string[];
}
export interface KoreaMarketAdapter { readonly adapterId:string; collect():Promise<unknown[]> }
export class FixtureKoreaMarketAdapter implements KoreaMarketAdapter {
  readonly adapterId='fixture-manual-korea-market';
  constructor(private readonly records:readonly unknown[]) {}
  async collect():Promise<unknown[]> { return [...structuredClone(this.records)]; }
}
export interface KoreaMarketIntakeResult { facts:KoreaMarketFact[]; rejected:{sourceRecordId:string;errors:string[]}[] }
export interface KoreaMarketNewsletterMetric { factId:string; group:'INDEX'|'FX'|'FLOW'|'VALUE'|'PROGRAM'|'SECTOR'|'MOVER'|'BREADTH'; label:string; displayValue:string; direction:'UP'|'DOWN'|'FLAT'; source:{label:string;url:string} }
export interface KoreaMarketNewsletterView { asOf:string; metrics:KoreaMarketNewsletterMetric[]; sources:{label:string;url:string}[] }

const marketAliases:Record<string,KoreaMarketId>={KOSPI:'KOSPI','KRXKOSPI':'KOSPI','코스피':'KOSPI',KOSDAQ:'KOSDAQ','KRXKOSDAQ':'KOSDAQ','코스닥':'KOSDAQ',USDKRW:'USD_KRW','USD/KRW':'USD_KRW','원달러':'USD_KRW','원/달러':'USD_KRW'};
const investorAliases:Record<string,KoreaInvestorType>={FOREIGN:'FOREIGN',FOREIGNER:'FOREIGN','외국인':'FOREIGN',INSTITUTION:'INSTITUTION','기관':'INSTITUTION','기관계':'INSTITUTION',RETAIL:'RETAIL',INDIVIDUAL:'RETAIL','개인':'RETAIL'};
const sectorAliases:Record<string,{id:SectorId;label:string}>={
  SEMICONDUCTORS:{id:'sector:semiconductors',label:'반도체'},'반도체':{id:'sector:semiconductors',label:'반도체'},
  ELECTRONICS:{id:'sector:electronics',label:'전기·전자'},'전기전자':{id:'sector:electronics',label:'전기·전자'},'전기·전자':{id:'sector:electronics',label:'전기·전자'},
  FINANCIALS:{id:'sector:financials',label:'금융'},'금융':{id:'sector:financials',label:'금융'},
  AUTOMOBILES:{id:'sector:automobiles',label:'자동차'},'자동차':{id:'sector:automobiles',label:'자동차'},
  BIOTECHNOLOGY:{id:'sector:biotechnology',label:'바이오'},'바이오':{id:'sector:biotechnology',label:'바이오'}
};
const nonEmpty=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0;
const isoTime=(value:unknown)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));
const httpUrl=(value:unknown)=>{if(!nonEmpty(value))return false;try{return ['http:','https:'].includes(new URL(value).protocol);}catch{return false;}};
const aliasKey=(value:string)=>value.normalize('NFKC').trim().toUpperCase().replace(/[\s_-]+/g,'');
const unique=<T>(values:T[])=>[...new Set(values)];

export function canonicalKoreaMarketId(value:string):KoreaMarketId {
  const resolved=marketAliases[aliasKey(value)]??marketAliases[value.normalize('NFKC').trim()];
  if(!resolved) throw new Error(`unsupported Korea market identifier: ${value}`); return resolved;
}
export function canonicalKoreaInvestorType(value:string):KoreaInvestorType {
  const resolved=investorAliases[aliasKey(value)]??investorAliases[value.normalize('NFKC').trim()];
  if(!resolved) throw new Error(`unsupported Korea investor type: ${value}`); return resolved;
}
export function canonicalKoreaSector(key:string,label:string|null):{id:SectorId;label:string} {
  const resolved=sectorAliases[key.normalize('NFKC').trim().toUpperCase()]??sectorAliases[key.normalize('NFKC').trim()]??(label?sectorAliases[label.normalize('NFKC').trim()]:undefined);
  if(resolved) return resolved;
  const normalized=key.normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  if(!normalized||!nonEmpty(label)) throw new Error('sector requires a canonical ASCII key and display label');
  return {id:`sector:${normalized}`,label:label.trim()};
}
export function normalizeKoreaMoney(value:number,unit:KoreaInputUnit):{value:number;unit:'KRW_MILLION';normalization:string} {
  if(!Number.isFinite(value)) throw new Error('finite monetary value required');
  if(unit==='KRW_MILLION') return {value,unit:'KRW_MILLION',normalization:'identity: KRW_MILLION'};
  if(unit==='KRW_100M') return {value:value*100,unit:'KRW_MILLION',normalization:'KRW_100M × 100 = KRW_MILLION'};
  if(unit==='KRW') return {value:value/1_000_000,unit:'KRW_MILLION',normalization:'KRW ÷ 1,000,000 = KRW_MILLION'};
  throw new Error(`monetary fact cannot use ${unit}`);
}

export function runKoreaMarketIntake(records:readonly unknown[]):KoreaMarketIntakeResult {
  const facts:KoreaMarketFact[]=[]; const rejected:KoreaMarketIntakeResult['rejected']=[]; const seen=new Set<string>();
  for(const raw of records){
    const object=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
    const recordId=nonEmpty(object.sourceRecordId)?object.sourceRecordId:'(missing)'; const errors=rawErrors(object);
    if(seen.has(recordId)) errors.push('sourceRecordId: duplicate');
    if(errors.length){rejected.push({sourceRecordId:recordId,errors});continue;}
    try { const fact=normalizeRecord(object as unknown as KoreaMarketRawRecord); facts.push(fact); seen.add(recordId); }
    catch(error){rejected.push({sourceRecordId:recordId,errors:[error instanceof Error?error.message:String(error)]});}
  }
  return {facts,rejected};
}
export async function collectKoreaMarketFacts(adapter:KoreaMarketAdapter):Promise<KoreaMarketIntakeResult> { return runKoreaMarketIntake(await adapter.collect()); }

function rawErrors(record:Record<string,unknown>):string[] {
  const errors:string[]=[];
  if(Object.hasOwn(record,'institutionView')) errors.push('institutionView: prohibited in Market Fact');
  if(Object.hasOwn(record,'aiInterpretation')) errors.push('aiInterpretation: prohibited in Market Fact');
  for(const key of ['sourceRecordId','market','source'] as const) if(!nonEmpty(record[key])) errors.push(`${key}: required`);
  if(!koreaFactTypes.includes(record.factType as KoreaMarketFactType)) errors.push('factType: unsupported');
  if(!koreaMarketSourceCategories.includes(record.sourceCategory as KoreaMarketSourceCategory)) errors.push('sourceCategory: unsupported');
  if(!['VERIFIED','PARTIALLY_VERIFIED','PRIMARY_SOURCE_ONLY','REVIEW_REQUIRED','UNVERIFIED','INSUFFICIENT_SOURCES','CONFLICT','REJECTED'].includes(record.verificationStatus as string)) errors.push('verificationStatus: unsupported');
  if(!httpUrl(record.sourceUrl)) errors.push('sourceUrl: valid HTTP(S) URL required; no fallback is generated');
  if(!isoTime(record.observedAt)) errors.push('observedAt: timezone-aware source time required; no fallback is generated');
  if(!isoTime(record.collectedAt)) errors.push('collectedAt: timezone-aware collection time required');
  if(typeof record.value!=='number'||!Number.isFinite(record.value)) errors.push('value: finite source value required; no fallback is generated');
  if(!['INDEX_POINT','PERCENT','KRW_PER_USD','KRW_MILLION','COUNT','KRW','KRW_100M'].includes(record.unit as string)) errors.push('unit: unsupported');
  for(const key of ['relatedEventKeys','relatedThemeKeys','relatedCompanyKeys','relatedSectorKeys'] as const) if(!Array.isArray(record[key])||(record[key] as unknown[]).some(value=>!nonEmpty(value))) errors.push(`${key}: string array required`);
  return errors;
}

function normalizeRecord(record:KoreaMarketRawRecord):KoreaMarketFact {
  const marketId=canonicalKoreaMarketId(record.market);
  if(record.factType!=='FX_SPOT'&&!['KOSPI','KOSDAQ'].includes(marketId)) throw new Error(`${record.factType} requires KOSPI or KOSDAQ`);
  const money=['INVESTOR_NET_FLOW','TRADING_VALUE','PROGRAM_NET_FLOW'].includes(record.factType);
  const normalized=money?normalizeKoreaMoney(record.value,record.unit):normalizeNonMoney(record);
  const investorType=record.factType==='INVESTOR_NET_FLOW'?(record.investor?canonicalKoreaInvestorType(record.investor):null):null;
  if(record.factType==='INVESTOR_NET_FLOW'&&!investorType) throw new Error('investor: required for investor flow');
  const sector=record.factType==='SECTOR_CHANGE_PCT'?(record.sectorKey?canonicalKoreaSector(record.sectorKey,record.sectorLabel):null):null;
  if(record.factType==='SECTOR_CHANGE_PCT'&&!sector) throw new Error('sector: required for sector performance');
  if(record.factType==='SECURITY_CHANGE_PCT'&&(!nonEmpty(record.company)||!nonEmpty(record.ticker))) throw new Error('company and ticker required for mover');
  const companyId=record.companyKey===null?null:createCommonIntelligenceId('company',record.companyKey);
  const relationSectorIds=unique(record.relatedSectorKeys.map(key=>canonicalKoreaSector(key,key).id));
  if(sector) relationSectorIds.unshift(sector.id);
  const relationships:KoreaMarketRelationship={
    eventIds:unique(record.relatedEventKeys.map(key=>createCommonIntelligenceId('event',key))),
    themeIds:unique(record.relatedThemeKeys.map(key=>createCommonIntelligenceId('theme',key))),
    companyIds:unique([...(companyId?[companyId]:[]),...record.relatedCompanyKeys.map(key=>createCommonIntelligenceId('company',key))]),sectorIds:unique(relationSectorIds)
  };
  return {
    factId:`kr-fact:${record.sourceRecordId}`,factType:record.factType,marketId,investorType,sectorId:sector?.id??null,sectorLabel:sector?.label??null,
    companyId,company:record.company,ticker:record.ticker,value:normalized.value,unit:normalized.unit,
    observedAt:record.observedAt,collectedAt:record.collectedAt,sourceCategory:record.sourceCategory,source:record.source,sourceUrl:record.sourceUrl,
    verificationStatus:record.verificationStatus,relationships,
    provenance:{sourceRecordId:record.sourceRecordId,sourceCategory:record.sourceCategory,source:record.source,sourceUrl:record.sourceUrl,observedAt:record.observedAt,collectedAt:record.collectedAt,originalMarket:record.market,originalInvestor:record.investor,originalSector:record.sectorLabel??record.sectorKey,originalValue:record.value,originalUnit:record.unit,normalization:normalized.normalization}
  };
}
function normalizeNonMoney(record:KoreaMarketRawRecord):{value:number;unit:KoreaCanonicalUnit;normalization:string} {
  const expected:Partial<Record<KoreaMarketFactType,KoreaCanonicalUnit>>={INDEX_LEVEL:'INDEX_POINT',FX_SPOT:'KRW_PER_USD',SECTOR_CHANGE_PCT:'PERCENT',SECURITY_CHANGE_PCT:'PERCENT',ADVANCE_COUNT:'COUNT',DECLINE_COUNT:'COUNT'};
  const unit=expected[record.factType]; if(!unit||record.unit!==unit) throw new Error(`${record.factType} requires ${unit}`);
  if(unit==='COUNT'&&(!Number.isInteger(record.value)||record.value<0)) throw new Error('count requires a non-negative integer');
  if(record.factType==='FX_SPOT'&&canonicalKoreaMarketId(record.market)!=='USD_KRW') throw new Error('FX_SPOT requires USD_KRW');
  if(record.factType==='INDEX_LEVEL'&&!['KOSPI','KOSDAQ'].includes(canonicalKoreaMarketId(record.market))) throw new Error('INDEX_LEVEL requires KOSPI or KOSDAQ');
  return {value:record.value,unit,normalization:`identity: ${unit}`};
}

export function buildKoreaMarketNewsletterView(facts:readonly KoreaMarketFact[]):KoreaMarketNewsletterView|null {
  const usable=facts.filter(fact=>['VERIFIED','PARTIALLY_VERIFIED','PRIMARY_SOURCE_ONLY'].includes(fact.verificationStatus));
  if(!usable.length) return null;
  const metrics=usable.map(toNewsletterMetric); const sources=unique(usable.map(fact=>`${fact.source}\u0000${fact.sourceUrl}`)).map(value=>{const [label,url]=value.split('\u0000');return {label:label!,url:url!};});
  return {asOf:[...usable].sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))[0]!.observedAt,metrics,sources};
}
function toNewsletterMetric(fact:KoreaMarketFact):KoreaMarketNewsletterMetric {
  const labels:Record<KoreaMarketId,string>={KOSPI:'KOSPI',KOSDAQ:'KOSDAQ',USD_KRW:'USD/KRW'};
  const investor:Record<KoreaInvestorType,string>={FOREIGN:'외국인 순매수',INSTITUTION:'기관 순매수',RETAIL:'개인 순매수'};
  const group:KoreaMarketNewsletterMetric['group']=fact.factType==='INDEX_LEVEL'?'INDEX':fact.factType==='FX_SPOT'?'FX':fact.factType==='INVESTOR_NET_FLOW'?'FLOW':fact.factType==='TRADING_VALUE'?'VALUE':fact.factType==='PROGRAM_NET_FLOW'?'PROGRAM':fact.factType==='SECTOR_CHANGE_PCT'?'SECTOR':fact.factType==='SECURITY_CHANGE_PCT'?'MOVER':'BREADTH';
  const label=fact.factType==='INVESTOR_NET_FLOW'?investor[fact.investorType!]:fact.factType==='SECTOR_CHANGE_PCT'?fact.sectorLabel!:fact.factType==='SECURITY_CHANGE_PCT'?`${fact.company} (${fact.ticker})`:fact.factType==='ADVANCE_COUNT'?'상승 종목':fact.factType==='DECLINE_COUNT'?'하락 종목':fact.factType==='TRADING_VALUE'?'거래대금':fact.factType==='PROGRAM_NET_FLOW'?'프로그램 순매수':labels[fact.marketId];
  const suffix:Record<KoreaCanonicalUnit,string>={INDEX_POINT:'',PERCENT:'%',KRW_PER_USD:'원',KRW_MILLION:'백만원',COUNT:'개'};
  const displayValue=`${fact.value.toLocaleString('ko-KR',{maximumFractionDigits:fact.unit==='COUNT'?0:2})}${suffix[fact.unit]}`;
  const directional=['INVESTOR_NET_FLOW','PROGRAM_NET_FLOW','SECTOR_CHANGE_PCT','SECURITY_CHANGE_PCT'].includes(fact.factType);
  return {factId:fact.factId,group,label,displayValue,direction:directional?(fact.value>0?'UP':fact.value<0?'DOWN':'FLAT'):'FLAT',source:{label:fact.source,url:fact.sourceUrl}};
}

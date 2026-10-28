import {fetchWithTransientRetry} from './http-retry.js';
export type KoreaComparedField='KOSPI'|'KOSDAQ'|'USD_KRW';
export type KoreaMetricBasis='SESSION_CLOSE'|'CURRENT_AT_COLLECTION'|'REFERENCE_RATE';
export interface KoreaPrimaryMarketSnapshot {observedDate:string;values:Partial<Record<KoreaComparedField,number>>;sourceUrls:string[];metricBasis?:Partial<Record<KoreaComparedField,KoreaMetricBasis>>}
export interface KoreaOfficialObservation {field:KoreaComparedField;observedDate:string;value:number;provider:'KRX'|'BOK_ECOS'|'YAHOO_FINANCE';sourceUrl:string;metricBasis?:KoreaMetricBasis}
export interface KoreaOfficialAudit {sourceId:string;url:string;status:'PASS'|'FAILED'|'SKIPPED';recordCount:number;error:string|null;requestedDate?:string;availableDates?:string[]}
export interface KoreaOfficialFetchResult {observations:KoreaOfficialObservation[];audit:KoreaOfficialAudit[];requiredProviderAvailable:boolean;reasonCode:string|null;phase?:'PRE_PUBLICATION'|'POST_PUBLICATION_RECONCILIATION'}
export interface KoreaOfficialSourceAdapter {readonly adapterId:string;fetch(observedDate:string,collectedAt:string):Promise<KoreaOfficialFetchResult>}
export interface KoreaFieldComparison {field:KoreaComparedField;primaryValue:number;independentValue:number;difference:number;tolerance:number;result:'PASS'|'FAIL';primarySourceUrl:string;independentSourceUrl:string;metricBasis?:KoreaMetricBasis|undefined}
export interface KoreaCrossVerificationArtifact {
 schemaVersion:'1.0';category:'KOREA_MARKET';observedDate:string;
 primarySource:{provider:'Naver Finance';domain:'naver.com';urls:string[]};
 independentSource:{providers:Array<'KRX'|'BOK_ECOS'|'YAHOO_FINANCE'>;domains:string[];urls:string[]};
 comparedFields:KoreaFieldComparison[];tolerance:{KOSPI:number;KOSDAQ:number;USD_KRW:number};
 comparisonResult:'PASS'|'FAIL'|'UNAVAILABLE';sourceDiversityPass:boolean;
 verification:'VERIFIED'|'REVIEW_REQUIRED';reasonCodes:string[];verifiedAt:string;officialPhase?:'PRE_PUBLICATION'|'POST_PUBLICATION_RECONCILIATION';reconciliation?:{status:'NOT_REQUIRED'|'PENDING'|'PASS'|'MISMATCH';officialObservedDates:string[]};
}

const KRX_ENDPOINTS={KOSPI:'https://data-dbg.krx.co.kr/svc/apis/idx/kospi_dd_trd',KOSDAQ:'https://data-dbg.krx.co.kr/svc/apis/idx/kosdaq_dd_trd'} as const;
const BOK_ENDPOINT='https://ecos.bok.or.kr/api/StatisticSearch';

export class KrxBokOfficialSourceAdapter implements KoreaOfficialSourceAdapter {
 readonly adapterId='krx-bok-official-v1';
 constructor(private readonly fetcher:typeof fetch=fetch,private readonly environment:NodeJS.ProcessEnv=process.env){}
 async fetch(observedDate:string,_collectedAt:string):Promise<KoreaOfficialFetchResult>{
  const observations:KoreaOfficialObservation[]=[],audit:KoreaOfficialAudit[]=[],krxKey=this.environment.KRX_AUTH_KEY?.trim(),compactDate=observedDate.replaceAll('-','');
  if(!krxKey){for(const [field,base] of Object.entries(KRX_ENDPOINTS))audit.push({sourceId:'krx:'+field.toLowerCase(),url:base+'?basDd='+compactDate,status:'FAILED',recordCount:0,error:'KRX_AUTH_KEY_MISSING'});return {observations,audit,requiredProviderAvailable:false,reasonCode:'KRX_AUTH_KEY_MISSING'}}
  try{
   for(const field of ['KOSPI','KOSDAQ'] as const){const base=KRX_ENDPOINTS[field],url=base+'?basDd='+compactDate,response=await this.fetcher(url,{headers:{accept:'application/json','user-agent':'MOTUS-Internal-Collector/1.0',AUTH_KEY:krxKey},signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('KRX_HTTP_'+response.status);const body=await response.json() as {OutBlock_1?:Array<{BAS_DD?:string;IDX_NM?:string;CLSPRC_IDX?:string}>},rows=body.OutBlock_1??[],row=rows.find(item=>canonicalIndexName(item.IDX_NM)===field);if(!row)throw new Error('KRX_'+field+'_ROW_MISSING');const date=normalizeDate(row.BAS_DD),value=numberValue(row.CLSPRC_IDX);observations.push({field,observedDate:date,value,provider:'KRX',sourceUrl:url,metricBasis:'SESSION_CLOSE'});audit.push({sourceId:'krx:'+field.toLowerCase(),url,status:'PASS',recordCount:1,error:date===observedDate?null:'KRX_T_PLUS_ONE_RECONCILIATION_ONLY'})}
  }catch(error){return {observations,audit:[...audit,{sourceId:'krx:official',url:'https://openapi.krx.co.kr',status:'FAILED',recordCount:0,error:errorMessage(error)}],requiredProviderAvailable:false,reasonCode:errorMessage(error)}}
  const bokKey=this.environment.BOK_ECOS_API_KEY?.trim();
  if(!bokKey)audit.push({sourceId:'bok:usd-krw',url:BOK_ENDPOINT,status:'SKIPPED',recordCount:0,error:'BOK_ECOS_API_KEY_MISSING'});
  else {const statCode=this.environment.BOK_ECOS_USD_KRW_STAT_CODE?.trim()||'731Y001',itemCode=this.environment.BOK_ECOS_USD_KRW_ITEM_CODE?.trim()||'0000001',url=`${BOK_ENDPOINT}/${encodeURIComponent(bokKey)}/json/kr/1/100/${encodeURIComponent(statCode)}/D/${compactDate}/${compactDate}/${encodeURIComponent(itemCode)}`,safeUrl='https://ecos.bok.or.kr/';try{const response=await this.fetcher(url,{headers:{accept:'application/json','user-agent':'MOTUS-Internal-Collector/1.0'},signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('BOK_HTTP_'+response.status);const body=await response.json() as {StatisticSearch?:{row?:Array<{TIME?:string;DATA_VALUE?:string}>}},row=body.StatisticSearch?.row?.[0];if(!row)throw new Error('BOK_USD_KRW_ROW_MISSING');const date=normalizeDate(row.TIME),value=numberValue(row.DATA_VALUE);if(date!==observedDate)throw new Error('BOK_USD_KRW_OBSERVED_DATE_MISMATCH');observations.push({field:'USD_KRW',observedDate:date,value,provider:'BOK_ECOS',sourceUrl:safeUrl,metricBasis:'REFERENCE_RATE'});audit.push({sourceId:'bok:usd-krw',url:safeUrl,status:'PASS',recordCount:1,error:null})}catch(error){audit.push({sourceId:'bok:usd-krw',url:safeUrl,status:'FAILED',recordCount:0,error:errorMessage(error)})}}
  const sameDay=observations.filter(item=>item.provider==='KRX').every(item=>item.observedDate===observedDate),phase=sameDay?'PRE_PUBLICATION' as const:'POST_PUBLICATION_RECONCILIATION' as const;
  return {observations,audit,requiredProviderAvailable:sameDay,reasonCode:sameDay?null:'KRX_T_PLUS_ONE_RECONCILIATION_ONLY',phase};
 }
}

export class YahooKoreaSecondarySourceAdapter implements KoreaOfficialSourceAdapter {
 readonly adapterId='yahoo-korea-secondary-v2';
 constructor(private readonly fetcher:typeof fetch=fetch){}
 async fetch(observedDate:string,_collectedAt:string):Promise<KoreaOfficialFetchResult>{
  const observations:KoreaOfficialObservation[]=[],audit:KoreaOfficialAudit[]=[],center=Date.parse(observedDate+'T00:00:00Z'),from=Math.floor((center-2*86400000)/1000),to=Math.floor((center+3*86400000)/1000);
  try{
   for(const [field,symbol] of [['KOSPI','%5EKS11'],['KOSDAQ','%5EKQ11']] as const){
    let accepted:{value:number;url:string;availableDates:string[]}|null=null,lastCode='YAHOO_FINANCE_'+field+'_ROW_MISSING';
    for(const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com']){
     const url=`https://${host}/v8/finance/chart/${symbol}?period1=${from}&period2=${to}&interval=1d`;
     const response=await fetchWithTransientRetry(this.fetcher,url,()=>({headers:{accept:'application/json','user-agent':'MOTUS-Internal-Collector/1.0'},signal:AbortSignal.timeout(20000)}));
     if(!response.ok){lastCode='YAHOO_FINANCE_HTTP_'+response.status;audit.push({sourceId:'yahoo-finance:'+field.toLowerCase()+':'+host,url,status:'FAILED',recordCount:0,error:lastCode,requestedDate:observedDate,availableDates:[]});continue}
     const body=await response.json() as {chart?:{error?:unknown;result?:Array<{meta?:{exchangeTimezoneName?:string;timezone?:string};timestamp?:number[];indicators?:{quote?:Array<{close?:Array<number|null>}>}}>}};
     const result=body.chart?.result?.[0],timestamps=result?.timestamp??[],closes=result?.indicators?.quote?.[0]?.close??[],zone=result?.meta?.exchangeTimezoneName||result?.meta?.timezone||'Asia/Seoul';
     const dates=timestamps.map(value=>yahooSessionDate(value,zone)),index=dates.indexOf(observedDate),value=index>=0?closes[index]:null;
     const code=body.chart?.error?'YAHOO_FINANCE_PROVIDER_ERROR':index<0||value==null?'YAHOO_FINANCE_'+field+'_ROW_MISSING':typeof value!=='number'||!Number.isFinite(value)||value<=0?'YAHOO_FINANCE_'+field+'_INVALID_CLOSE':null;
     audit.push({sourceId:'yahoo-finance:'+field.toLowerCase()+':'+host,url,status:code?'FAILED':'PASS',recordCount:code?0:1,error:code,requestedDate:observedDate,availableDates:[...new Set(dates.filter(Boolean))].slice(-8)});
     if(!code){accepted={value:value as number,url,availableDates:dates};break}
     lastCode=code;
    }
    if(!accepted)throw new Error(lastCode);
    observations.push({field,observedDate,value:accepted.value,provider:'YAHOO_FINANCE',sourceUrl:accepted.url,metricBasis:'SESSION_CLOSE'});
   }
   return {observations,audit,requiredProviderAvailable:true,reasonCode:null,phase:'PRE_PUBLICATION'};
  }
  catch(error){return {observations,audit:[...audit,{sourceId:'yahoo-finance:secondary',url:'https://finance.yahoo.com/',status:'FAILED',recordCount:0,error:errorMessage(error),requestedDate:observedDate,availableDates:[...new Set(audit.flatMap(item=>item.availableDates??[]))].slice(-8)}],requiredProviderAvailable:false,reasonCode:errorMessage(error),phase:'PRE_PUBLICATION'}}
 }
}

function yahooSessionDate(value:number|undefined,timeZone:string):string {
 if(typeof value!=='number'||!Number.isFinite(value))return '';
 try{
  return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value*1000));
 }catch{
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value*1000));
 }
}

export function crossVerifyKoreaMarket(primary:KoreaPrimaryMarketSnapshot,official:KoreaOfficialFetchResult,verifiedAt:string,tolerance={KOSPI:0.05,KOSDAQ:0.05,USD_KRW:2}):KoreaCrossVerificationArtifact {
 const comparedFields:KoreaFieldComparison[]=[],reasonCodes:string[]=[];
 for(const observation of official.observations){if(observation.observedDate!==primary.observedDate){reasonCodes.push('KOREA_'+observation.field+'_OBSERVED_DATE_MISMATCH');continue}const primaryValue=primary.values[observation.field];if(primaryValue===undefined)continue;const primaryBasis=primary.metricBasis?.[observation.field];if(primaryBasis&&observation.metricBasis&&primaryBasis!==observation.metricBasis){reasonCodes.push('KOREA_'+observation.field+'_METRIC_DEFINITION_MISMATCH');continue}const difference=Math.abs(primaryValue-observation.value),limit=tolerance[observation.field],result=difference<=limit?'PASS':'FAIL';comparedFields.push({field:observation.field,primaryValue,independentValue:observation.value,difference,tolerance:limit,result,primarySourceUrl:primaryUrl(primary,observation.field),independentSourceUrl:observation.sourceUrl,metricBasis:primaryBasis??observation.metricBasis});if(result==='FAIL')reasonCodes.push('KOREA_'+observation.field+'_CROSS_CHECK_MISMATCH')}
 const requiredFields=['KOSPI','KOSDAQ'] as const,hasRequired=requiredFields.every(field=>comparedFields.some(item=>item.field===field));if(!official.requiredProviderAvailable)reasonCodes.push(official.reasonCode??'KOREA_OFFICIAL_SOURCE_UNAVAILABLE');if(!hasRequired)reasonCodes.push('KOREA_OFFICIAL_INDEX_COMPARISON_INCOMPLETE');
 const independentDomains=[...new Set(official.observations.map(item=>providerDomain(item.sourceUrl)).filter(Boolean))],sourceDiversityPass=independentDomains.some(domain=>domain!=='naver.com')&&providerDomain(primary.sourceUrls[0]??'')==='naver.com',comparisonResult=!comparedFields.length?'UNAVAILABLE':reasonCodes.length?'FAIL':'PASS';if(!sourceDiversityPass)reasonCodes.push('KOREA_INDEPENDENT_SOURCE_DIVERSITY_FAILED');
 const officialObservedDates=[...new Set(official.observations.map(item=>item.observedDate))],officialPhase=official.phase??'PRE_PUBLICATION',reconciliation=officialPhase==='POST_PUBLICATION_RECONCILIATION'?{status:(reasonCodes.some(code=>code.includes('MISMATCH'))?'MISMATCH':'PENDING') as 'MISMATCH'|'PENDING',officialObservedDates}:{status:'NOT_REQUIRED' as const,officialObservedDates};
 return {schemaVersion:'1.0',category:'KOREA_MARKET',observedDate:primary.observedDate,primarySource:{provider:'Naver Finance',domain:'naver.com',urls:[...primary.sourceUrls]},independentSource:{providers:[...new Set(official.observations.map(item=>item.provider))],domains:independentDomains,urls:[...new Set(official.observations.map(item=>item.sourceUrl))]},comparedFields,tolerance,comparisonResult,sourceDiversityPass,verification:comparisonResult==='PASS'&&sourceDiversityPass&&officialPhase==='PRE_PUBLICATION'?'VERIFIED':'REVIEW_REQUIRED',reasonCodes:[...new Set(reasonCodes)],verifiedAt,officialPhase,reconciliation};
}

function canonicalIndexName(value:string|undefined):'KOSPI'|'KOSDAQ'|null {const normalized=(value??'').replace(/\s+/g,'').toUpperCase();if(normalized==='코스피'||normalized==='KOSPI')return 'KOSPI';if(normalized==='코스닥'||normalized==='KOSDAQ')return 'KOSDAQ';return null}
function normalizeDate(value:string|undefined){const digits=(value??'').replace(/\D/g,'');return digits.length===8?digits.replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3'):''}
function numberValue(value:string|undefined){const parsed=Number((value??'').replaceAll(',',''));if(!Number.isFinite(parsed))throw new Error('OFFICIAL_NUMERIC_VALUE_INVALID');return parsed}
function providerDomain(value:string){try{const parts=new URL(value).hostname.toLowerCase().split('.');return parts.slice(-2).join('.')}catch{return ''}}
function primaryUrl(primary:KoreaPrimaryMarketSnapshot,field:KoreaComparedField){const index={KOSPI:0,KOSDAQ:1,USD_KRW:2}[field];return primary.sourceUrls[index]??primary.sourceUrls[0]??''}
function errorMessage(error:unknown){return error instanceof Error?error.message:String(error)}

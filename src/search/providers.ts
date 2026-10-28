import type {GoogleAnalyticsRequest,GoogleSearchConsoleAdapter} from './measurement.js';
import {normalizeNaverDataLab,normalizeSearchConsoleDemand,type DemandSignal,type NaverDataLabResponse,type VerifiedSearchTopic} from './intelligence.js';

type FetchLike=(input:string|URL,init?:RequestInit)=>Promise<Response>;
export interface NaverDataLabRequest {startDate:string;endDate:string;timeUnit:'date'|'week'|'month';keywordGroups:Array<{groupName:string;keywords:string[]}>}
export interface SearchDemandProvider {readonly providerId:'NAVER_DATALAB'|'GOOGLE_SEARCH_CONSOLE';collect(topics:VerifiedSearchTopic[],collectedAt:string):Promise<DemandSignal[]>}

export class NaverDataLabProvider implements SearchDemandProvider {
  readonly providerId='NAVER_DATALAB' as const;
  constructor(private readonly request:NaverDataLabRequest,private readonly credentials:{clientId:string;clientSecret:string},private readonly fetcher:FetchLike=fetch){}
  async collect(topics:VerifiedSearchTopic[],collectedAt:string):Promise<DemandSignal[]>{
    if(!this.credentials.clientId.trim()||!this.credentials.clientSecret.trim())throw new Error('NAVER_DATALAB_NOT_CONFIGURED');
    const allowed=new Set(topics.flatMap(topic=>[topic.label,...topic.aliases].map(normalize)));
    const keywordGroups=this.request.keywordGroups.filter(group=>[group.groupName,...group.keywords].some(value=>allowed.has(normalize(value))));
    if(!keywordGroups.length)return [];
    const response=await this.fetcher('https://naverapihub.apigw.ntruss.com/search-trend/v1/search',{method:'POST',headers:{'content-type':'application/json','X-NCP-APIGW-API-KEY-ID':this.credentials.clientId.trim(),'X-NCP-APIGW-API-KEY':this.credentials.clientSecret.trim()},body:JSON.stringify({...this.request,keywordGroups})});
    if(!response.ok)throw new Error(await naverHubHttpError(response));
    return normalizeNaverDataLab({response:await response.json() as NaverDataLabResponse,topics,collectedAt});
  }
}

export class GoogleSearchConsoleSignalProvider implements SearchDemandProvider {
  readonly providerId='GOOGLE_SEARCH_CONSOLE' as const;
  constructor(private readonly adapter:GoogleSearchConsoleAdapter,private readonly request:GoogleAnalyticsRequest){}
  async collect(topics:VerifiedSearchTopic[],collectedAt:string):Promise<DemandSignal[]>{
    const dimensions=this.request.dimensions.includes('query')?this.request.dimensions:[...this.request.dimensions,'query' as const];
    const records=await this.adapter.getSearchAnalytics({...this.request,dimensions});
    return normalizeSearchConsoleDemand({records,topics,periodStart:this.request.startDate,periodEnd:this.request.endDate,collectedAt});
  }
}

export async function collectDemandSignals(providers:SearchDemandProvider[],topics:VerifiedSearchTopic[],collectedAt:string):Promise<{signals:DemandSignal[];states:Record<'NAVER_DATALAB'|'GOOGLE_SEARCH_CONSOLE','AVAILABLE'|'FAILED'|'NOT_CONFIGURED'>;warnings:string[]}>{
  const states={NAVER_DATALAB:'NOT_CONFIGURED' as const,GOOGLE_SEARCH_CONSOLE:'NOT_CONFIGURED' as const};const mutable:Record<keyof typeof states,'AVAILABLE'|'FAILED'|'NOT_CONFIGURED'>={...states};const signals:DemandSignal[]=[];const warnings:string[]=[];
  for(const provider of providers)try{signals.push(...await provider.collect(topics,collectedAt));mutable[provider.providerId]='AVAILABLE';}catch(error){const message=error instanceof Error?error.message:'provider failed';mutable[provider.providerId]=message.includes('NOT_CONFIGURED')?'NOT_CONFIGURED':'FAILED';warnings.push(`${provider.providerId}:${message}`);}
  return {signals,states:mutable,warnings};
}
function normalize(value:string):string{return value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9가-힣]+/g,' ').trim();}

/**
 * API HUB error detail without secrets. errorCode 200 "Authentication Failed" means the gateway rejected the Client ID/Secret pair itself
 * (wrong or mismatched pair, or Developers Center keys); a pair without Search Trend permission is reported separately by the gateway.
 */
export async function naverHubHttpError(response:Response):Promise<string> {
  let code='';try{const body=await response.json() as {error?:{errorCode?:unknown};errorCode?:unknown};const raw=body.error?.errorCode??body.errorCode;code=typeof raw==='string'||typeof raw==='number'?String(raw):''}catch{}
  // Gateway error codes are short numerics (200 auth failed, 210 permission denied, 300 not found, 4xx quota...); anything else is dropped.
  const safe=/^\d{3}$/.test(code)?code:'';
  return `NAVER_DATALAB_HTTP_${response.status}${safe?':'+safe:''}`;
}

import type { MarketSnapshot, Source, Status } from '../domain/models.js';
import { marketChange } from '../utils/calculations.js';
export interface AdapterResult { sourceId: string; status: Status; records: MarketSnapshot[]; message: string }
export interface CollectOptions { tradingDate: string; observedAt: string; collectedAt: string; timeoutMs?: number }
export interface DataAdapter { collect(source: Source, options?: CollectOptions): Promise<AdapterResult> }
export class UnconnectedAdapter implements DataAdapter {
  async collect(source: Source): Promise<AdapterResult> {
    return { sourceId: source.sourceId, status: 'DATA_NOT_CONNECTED', records: [], message: '자동 API 미연결. 출처를 기재한 수동 입력만 지원합니다.' };
  }
}

interface FetchResponse { ok: boolean; status: number; text(): Promise<string> }
type Fetcher = (url:string, init:{signal:AbortSignal;headers:Record<string,string>})=>Promise<FetchResponse>;
const treasuryUrl=(date:string)=>`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/all/${date.slice(0,4)}${date.slice(5,7)}?type=daily_treasury_yield_curve&field_tdr_date_value_month=${date.slice(0,4)}${date.slice(5,7)}`;
const parseDate=(value:string):string|null=>{const match=value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return match?`${match[3]}-${match[1]}-${match[2]}`:null;};
const splitCsv=(line:string)=>line.split(',').map(value=>value.trim().replace(/^"|"$/g,''));
export class TreasuryYieldAdapter implements DataAdapter {
  constructor(private readonly fetcher:Fetcher=globalThis.fetch as unknown as Fetcher) {}
  async collect(source:Source,options?:CollectOptions):Promise<AdapterResult> {
    if(!options) return {sourceId:source.sourceId,status:'REVIEW_REQUIRED',records:[],message:'tradingDate/observedAt/collectedAt 옵션 필요'};
    const url=treasuryUrl(options.tradingDate);
    try {
      const response=await this.fetcher(url,{signal:AbortSignal.timeout(options.timeoutMs??10000),headers:{Accept:'text/csv','User-Agent':'us-market-close-report/0.2'}});
      if(response.status===429) return {sourceId:source.sourceId,status:'REVIEW_REQUIRED',records:[],message:'Treasury rate limit'};
      if(!response.ok) return {sourceId:source.sourceId,status:'SOURCE_UNAVAILABLE',records:[],message:`Treasury HTTP ${response.status}`};
      const body=await response.text();
      if(!body.trim()) return {sourceId:source.sourceId,status:'NO_DATA',records:[],message:'Treasury empty response'};
      const lines=body.replace(/^\uFEFF/,'').trim().split(/\r?\n/).filter(Boolean);
      const header=splitCsv(lines[0]??'');
      const dateIndex=header.indexOf('Date'), twoIndex=header.indexOf('2 Yr'), tenIndex=header.indexOf('10 Yr');
      if(dateIndex<0||twoIndex<0||tenIndex<0) return {sourceId:source.sourceId,status:'REVIEW_REQUIRED',records:[],message:'Treasury malformed header'};
      const rows=lines.slice(1).map(splitCsv).map(values=>({values,date:parseDate(values[dateIndex]??'')})).filter((row):row is {values:string[];date:string}=>row.date!==null).sort((a,b)=>a.date.localeCompare(b.date));
      const position=rows.findIndex(row=>row.date===options.tradingDate);
      if(position<0) return {sourceId:source.sourceId,status:'NO_DATA',records:[],message:'Treasury requested date absent'};
      const current=rows[position]!, previous=rows[position-1];
      if(!previous) return {sourceId:source.sourceId,status:'NO_DATA',records:[],message:'Treasury previous trading day absent'};
      const make=(symbol:string,index:number):MarketSnapshot|null=>{
        const close=Number(current.values[index]),previousClose=Number(previous.values[index]);
        const calculation=marketChange(close,previousClose);
        if(!Number.isFinite(close)||!Number.isFinite(previousClose)||calculation.status!=='OK') return null;
        return {id:`TREASURY-${symbol}-${options.tradingDate}`,sample:false,sourceId:source.sourceId,sourceUrl:url,observedAt:options.observedAt,collectedAt:options.collectedAt,unit:'percent',status:'OK',missingReasons:{volume:'금리 지표에는 거래량 미적용'},collectionMode:'API',verificationUrls:[url],market:'US',tradingDate:options.tradingDate,symbol,instrumentType:'YIELD',close,previousClose,change:calculation.raw.change,changePct:calculation.display.changePct,volume:null,currency:'USD'};
      };
      const records=[make('US2Y',twoIndex),make('US10Y',tenIndex)].filter((record):record is MarketSnapshot=>record!==null);
      if(records.length!==2) return {sourceId:source.sourceId,status:'REVIEW_REQUIRED',records:[],message:'Treasury invalid numeric response'};
      const age=Date.parse(options.collectedAt)-Date.parse(options.observedAt);
      if(age>source.maxAgeMinutes*60000) return {sourceId:source.sourceId,status:'DELAYED',records,message:'Treasury data exceeds source freshness threshold'};
      return {sourceId:source.sourceId,status:'OK',records,message:'Treasury 2Y/10Y normalized'};
    } catch(error) {
      const name=error instanceof Error?error.name:'';
      return {sourceId:source.sourceId,status:'SOURCE_UNAVAILABLE',records:[],message:name==='TimeoutError'||name==='AbortError'?'Treasury timeout':`Treasury unavailable: ${String(error)}`};
    }
  }
}

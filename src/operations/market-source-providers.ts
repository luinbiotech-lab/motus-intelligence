export interface MarketSeriesPoint {date:string;value:number;sourceId:string;sourceUrl:string}
export interface MarketSeriesRequest {symbol:string;count:number;requestedAt:string}
export interface MarketSeriesResult {url:string;points:MarketSeriesPoint[]}
export interface MarketTimeSeriesProvider {readonly providerId:string;fetchSeries(request:MarketSeriesRequest):Promise<MarketSeriesResult>}

export class TwelveDataTimeSeriesProvider implements MarketTimeSeriesProvider {
 readonly providerId='twelve-data-v1';
 constructor(private readonly environment:NodeJS.ProcessEnv=process.env,private readonly fetcher:typeof fetch=fetch){}
 async fetchSeries(request:MarketSeriesRequest):Promise<MarketSeriesResult>{
  const safeUrl=`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(request.symbol)}&interval=1day`,key=this.environment.TWELVE_DATA_API_KEY?.trim();
  if(!key)throw new Error('TWELVE_DATA_API_KEY_MISSING');
  const response=await this.fetcher(safeUrl+`&outputsize=${Math.max(request.count,2)}&apikey=${encodeURIComponent(key)}`,{headers:{accept:'application/json','user-agent':'MOTUS-Internal-Collector/1.0'},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('TWELVE_DATA_HTTP_'+response.status);
  const data=await response.json() as {status?:string;message?:string;values?:Array<{datetime?:string;close?:string}>};if(data.status==='error'||!data.values?.length)throw new Error(data.message??'TWELVE_DATA_EMPTY');
  const points=data.values.map(row=>({date:row.datetime??'',value:Number(row.close),sourceId:'TWELVE:'+request.symbol,sourceUrl:safeUrl})).filter(point=>/^\d{4}-\d{2}-\d{2}$/.test(point.date)&&Number.isFinite(point.value)).sort((a,b)=>a.date.localeCompare(b.date));
  if(points.length<Math.min(request.count,2))throw new Error(request.symbol+'_OBSERVATIONS_INSUFFICIENT');
  const latest=points.at(-1)!.date,age=(Date.parse(request.requestedAt.slice(0,10)+'T00:00:00Z')-Date.parse(latest+'T00:00:00Z'))/86400000;if(age<0||age>4)throw new Error('TWELVE_'+request.symbol+'_STALE');
  return {url:safeUrl,points};
 }
}

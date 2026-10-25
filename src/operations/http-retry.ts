/**
 * Retries a GET only on transient throttling/unavailability (429/503) so that a rate-limited
 * public market-data endpoint does not turn a verifiable session into a HOLD. The request URL,
 * parsing and every downstream verification stay unchanged; non-transient statuses return at once.
 */
export interface RetryOptions {retries?:number;baseDelayMs?:number;maxDelayMs?:number;sleep?:(ms:number)=>Promise<void>}

const TRANSIENT=new Set([429,503]);

export async function fetchWithTransientRetry(fetcher:typeof fetch,url:string,init:()=>RequestInit,options:RetryOptions={}):Promise<Response> {
  const retries=options.retries??2,base=options.baseDelayMs??4000,max=options.maxDelayMs??15000,sleep=options.sleep??((ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms)));
  for(let attempt=0;;attempt++){
    const response=await fetcher(url,init());
    if(!TRANSIENT.has(response.status)||attempt>=retries)return response;
    await response.body?.cancel().catch(()=>undefined);
    await sleep(Math.min(max,retryAfterMs(response.headers.get('retry-after'))??base*(attempt+1)));
  }
}

export function retryAfterMs(value:string|null):number|null {
  if(!value)return null;
  const seconds=Number(value.trim());
  if(Number.isFinite(seconds)&&seconds>=0)return seconds*1000;
  const date=Date.parse(value);
  return Number.isFinite(date)?Math.max(0,date-Date.now()):null;
}

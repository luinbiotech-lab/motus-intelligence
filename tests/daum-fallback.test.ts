import test from 'node:test';import assert from 'node:assert/strict';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {RepositoryInternalDailyBuilder,usProvider,type InternalSourceAuditEntry} from '../src/operations/internal-live-daily.js';
import {YahooKoreaSecondarySourceAdapter,parseDaumDays} from '../src/operations/korea-official.js';

type YahooReader={yahooUsIndex(symbol:string,label:string,sourceId:string,at:string,audit:InternalSourceAuditEntry[],expectedDate:string):Promise<{url:string;points:Array<{date:string;value:number}>}>};
function daumDays(last:string,count:number,base=7300){const end=Date.parse(last+'T00:00:00Z');return {code:200,message:'OK',data:Array.from({length:count},(_,i)=>({date:new Date(end-i*86400000).toISOString().slice(0,10)+' 00:00:00',tradePrice:base-i}))}}
const builder=(fetcher:typeof fetch)=>new RepositoryInternalDailyBuilder(fetcher,{},undefined,undefined,undefined,join(tmpdir(),'motus-none-'+Date.now())) as unknown as YahooReader;

test('11/19: both Yahoo hosts 429 → U.S. index closes come from Daum with the same session check',async()=>{
 const calls:string[]=[];
 const fetcher=(async(input:string|URL,init?:RequestInit)=>{const url=String(input);calls.push(url);if(url.includes('yahoo.com'))return new Response('rate',{status:429,headers:{'retry-after':'0'}});assert.equal(new Headers(init?.headers).get('referer'),'https://finance.daum.net/global/quotes/US.SP500');return new Response(JSON.stringify(daumDays('2026-11-18',100)))}) as typeof fetch;
 const audit:InternalSourceAuditEntry[]=[],result=await builder(fetcher).yahooUsIndex('^GSPC','S&P 500','sp500','2026-11-18T23:46:00Z',audit,'2026-11-18');
 assert.match(result.url,/finance\.daum\.net\/api\/quote\/US\.SP500\/days/);
 assert.equal(result.points.at(-1)?.date,'2026-11-18');assert.equal(result.points.at(-1)?.value,7300);assert.ok(result.points[0]!.date<result.points.at(-1)!.date);
 assert.deepEqual(audit.map(item=>[item.sourceId,item.status]),[['yahoo-us:sp500','FAILED'],['yahoo-us:sp500:query2','FAILED'],['daum-us:sp500','PASS']]);
});

test('Daum never supplies a stale U.S. session or a short history',async()=>{
 for(const [body,pattern] of [[daumDays('2026-11-17',100),/DAUM_US_SP500_SESSION_MISMATCH/],[daumDays('2026-11-18',40),/HISTORY_INSUFFICIENT/]] as const){
  const fetcher=(async(input:string|URL)=>String(input).includes('yahoo.com')?new Response('x',{status:404}):new Response(JSON.stringify(body))) as typeof fetch,audit:InternalSourceAuditEntry[]=[];
  await assert.rejects(builder(fetcher).yahooUsIndex('^GSPC','S&P 500','sp500','2026-11-18T23:46:00Z',audit,'2026-11-18'));
  assert.match(String(audit.at(-1)?.error),pattern);
 }
});

test('Korea cross-verification never uses Daum (shared Koscom upstream with Naver)',async()=>{
 const calls:string[]=[];const fetcher=(async(input:string|URL)=>{const url=String(input);calls.push(url);const kospi=url.includes('%5EKS11'),ts=[Date.parse('2026-11-18T06:30:00Z')/1000];return new Response(JSON.stringify({chart:{result:[{meta:{exchangeTimezoneName:'Asia/Seoul'},timestamp:ts,indicators:{quote:[{close:kospi?[5067.44]:[null]}]}}]}}))}) as typeof fetch;
 const result=await new YahooKoreaSecondarySourceAdapter(fetcher).fetch('2026-11-18','2026-11-18T08:12:40Z');
 assert.equal(result.requiredProviderAvailable,false);assert.equal(result.reasonCode,'YAHOO_FINANCE_KOSDAQ_ROW_MISSING');
 assert.ok(calls.every(url=>!url.includes('daum.net')));
});

test('parseDaumDays drops malformed rows',()=>{
 assert.deepEqual(parseDaumDays({data:[{date:'2026-11-18 00:00:00',tradePrice:1},{date:'bad',tradePrice:2},{date:'2026-11-17 00:00:00',tradePrice:'3'}]}),[{date:'2026-11-18',value:1}]);
 assert.deepEqual(parseDaumDays(null),[]);
});

test('Daum 403 (missing Referer / blocked) keeps the U.S. edition on HOLD with an audited reason',async()=>{
 const fetcher=(async(input:string|URL)=>String(input).includes('yahoo.com')?new Response('rate',{status:429,headers:{'retry-after':'0'}}):new Response('forbidden',{status:403})) as typeof fetch,audit:InternalSourceAuditEntry[]=[];
 await assert.rejects(builder(fetcher).yahooUsIndex('^GSPC','S&P 500','sp500','2026-11-18T23:46:00Z',audit,'2026-11-18'),/YAHOO_US_HTTP_429/);
 assert.deepEqual(audit.map(item=>[item.sourceId,item.status,item.error]),[['yahoo-us:sp500','FAILED','YAHOO_US_HTTP_429'],['yahoo-us:sp500:query2','FAILED','YAHOO_US_HTTP_429'],['daum-us:sp500','FAILED','DAUM_US_HTTP_403']]);
});

test('a Daum-served series is named as Daum Finance in the published sources (single-source fallback, not corroboration)',()=>{
 assert.deepEqual(usProvider('https://finance.daum.net/api/quote/US.SP500/days?page=1&perPage=100'),{label:'Daum Finance',publisher:'Daum Finance'});
 assert.equal(usProvider('https://query2.finance.yahoo.com/v8/finance/chart/%5EGSPC').label,'Yahoo Finance');
});

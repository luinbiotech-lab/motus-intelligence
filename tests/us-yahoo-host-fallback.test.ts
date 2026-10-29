import test from 'node:test';import assert from 'node:assert/strict';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {RepositoryInternalDailyBuilder,type InternalSourceAuditEntry} from '../src/operations/internal-live-daily.js';

function chart(lastDate:string,count=70){const end=Date.parse(lastDate+'T20:00:00Z'),timestamp:number[]=[],close:number[]=[];for(let i=count-1;i>=0;i--){timestamp.push(Math.floor((end-i*86400000)/1000));close.push(5000+i)}return {chart:{result:[{timestamp,indicators:{quote:[{close}]}}]}}}
type YahooReader={yahooUsIndex(symbol:string,label:string,sourceId:string,at:string,audit:InternalSourceAuditEntry[],expectedDate:string):Promise<{url:string;points:unknown[]}>};

test('U.S. Yahoo path falls back to the second public host and keeps identical session validation',async()=>{
 const calls:string[]=[];
 const fetcher=(async(input:string|URL)=>{const url=String(input);calls.push(new URL(url).host);return url.includes('query1.')?new Response('unavailable',{status:404}):new Response(JSON.stringify(chart('2026-10-29')),{status:200})}) as typeof fetch;
 const builder=new RepositoryInternalDailyBuilder(fetcher,{},undefined,undefined,undefined,join(tmpdir(),'motus-none-'+Date.now())) as unknown as YahooReader,audit:InternalSourceAuditEntry[]=[];
 const result=await builder.yahooUsIndex('^GSPC','S&P 500','sp500','2026-10-29T22:00:00Z',audit,'2026-10-29');
 assert.deepEqual(calls,['query1.finance.yahoo.com','query2.finance.yahoo.com']);assert.match(result.url,/query2\.finance\.yahoo\.com/);
 assert.deepEqual(audit.map(item=>item.status),['FAILED','PASS']);
});

test('the second host never accepts a different session than the one requested',async()=>{
 const fetcher=(async(input:string|URL)=>String(input).includes('query1.')?new Response('x',{status:404}):new Response(JSON.stringify(chart('2026-10-28')),{status:200})) as typeof fetch;
 const builder=new RepositoryInternalDailyBuilder(fetcher,{},undefined,undefined,undefined,join(tmpdir(),'motus-none-'+Date.now())) as unknown as YahooReader,audit:InternalSourceAuditEntry[]=[];
 await assert.rejects(builder.yahooUsIndex('^GSPC','S&P 500','sp500','2026-10-29T22:00:00Z',audit,'2026-10-29'),/SESSION_MISMATCH/);
 assert.deepEqual(audit.map(item=>item.status),['FAILED','FAILED']);
});

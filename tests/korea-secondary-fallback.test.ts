import test from 'node:test';
import assert from 'node:assert/strict';
import {YahooKoreaSecondarySourceAdapter} from '../src/operations/korea-official.js';

test('Yahoo Korea secondary uses exchange timezone and query2 fallback',async()=>{
  const calls:string[]=[];
  const fetcher=(async(input:string|URL)=>{
    const url=String(input);calls.push(url);
    const symbol=url.includes('%5EKS11')?'KOSPI':'KOSDAQ';
    if(url.includes('query1.finance.yahoo.com')){
      return new Response(JSON.stringify({chart:{result:[{meta:{exchangeTimezoneName:'Asia/Seoul'},timestamp:[Date.parse('2026-10-23T15:00:00Z')/1000],indicators:{quote:[{close:[symbol==='KOSPI'?4100:900]}]}}]}}));
    }
    return new Response(JSON.stringify({chart:{result:[{meta:{exchangeTimezoneName:'Asia/Seoul'},timestamp:[Date.parse('2026-10-25T15:00:00Z')/1000],indicators:{quote:[{close:[symbol==='KOSPI'?4200.25:925.5]}]}}]}}));
  }) as typeof fetch;
  const result=await new YahooKoreaSecondarySourceAdapter(fetcher).fetch('2026-10-26','2026-10-27T00:24:59Z');
  assert.equal(result.requiredProviderAvailable,true);
  assert.equal(result.reasonCode,null);
  assert.deepEqual(result.observations.map(x=>[x.field,x.observedDate,x.value]),[['KOSPI','2026-10-26',4200.25],['KOSDAQ','2026-10-26',925.5]]);
  assert.ok(calls.some(url=>url.includes('query2.finance.yahoo.com')));
});

test('Yahoo Korea secondary remains fail-closed after both hosts miss the requested session',async()=>{
  const fetcher=(async()=>new Response(JSON.stringify({chart:{result:[{meta:{exchangeTimezoneName:'Asia/Seoul'},timestamp:[Date.parse('2026-10-23T15:00:00Z')/1000],indicators:{quote:[{close:[3000]}]}}]}}))) as typeof fetch;
  const result=await new YahooKoreaSecondarySourceAdapter(fetcher).fetch('2026-10-26','2026-10-27T00:24:59Z');
  assert.equal(result.requiredProviderAvailable,false);
  assert.equal(result.reasonCode,'YAHOO_FINANCE_KOSPI_ROW_MISSING');
  assert.equal(result.observations.length,0);
  assert.ok(result.audit.filter(x=>x.sourceId.includes('kospi')).length>=2);
  assert.ok(result.audit.every(x=>!JSON.stringify(x).includes('apikey=')));
});

test('KRX official adapter requests the actual approved data host and preserves authentication',async()=>{
  const {KrxBokOfficialSourceAdapter}=await import('../src/operations/korea-official.js');
  const calls:Array<{url:string;auth:string|null}>=[];
  const fetcher=(async(input:string|URL,init?:RequestInit)=>{
    const url=String(input);calls.push({url,auth:new Headers(init?.headers).get('AUTH_KEY')});
    const field=url.includes('kospi_dd_trd')?'코스피':'코스닥';
    return new Response(JSON.stringify({OutBlock_1:[{BAS_DD:'20261027',IDX_NM:field,CLSPRC_IDX:field==='코스피'?'4100.15':'925.40'}]}),{status:200});
  }) as typeof fetch;
  const result=await new KrxBokOfficialSourceAdapter(fetcher,{KRX_AUTH_KEY:'local-test-key'} as NodeJS.ProcessEnv).fetch('2026-10-27','2026-10-28T01:00:00Z');
  assert.equal(result.requiredProviderAvailable,true);
  assert.deepEqual(result.observations.map(item=>item.field),['KOSPI','KOSDAQ']);
  assert.equal(calls.length,2);
  assert.ok(calls.every(item=>item.url.startsWith('https://data-dbg.krx.co.kr/svc/apis/idx/')));
  assert.ok(calls.every(item=>item.url.endsWith('?basDd=20261027')&&item.auth==='local-test-key'));
});

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

for(const failure of ['NETWORK','MALFORMED_JSON','INVALID_TIMESTAMP'] as const){
 test(`Yahoo query2 still runs after query1 ${failure}`,async()=>{
  const calls:string[]=[];
  const fetcher=(async(input:string|URL)=>{
   const url=String(input);calls.push(url);
   if(url.includes('query1.finance.yahoo.com')){
    if(failure==='NETWORK')throw Error('sentinel-private-provider-message');
    if(failure==='MALFORMED_JSON')return new Response('not JSON');
    return new Response(JSON.stringify({chart:{result:[{timestamp:[Number.MAX_SAFE_INTEGER],indicators:{quote:[{close:[3000]}]}}]}}));
   }
   return new Response(JSON.stringify({chart:{result:[{meta:{exchangeTimezoneName:'Asia/Seoul'},timestamp:[Date.parse('2026-10-26T00:00:00Z')/1000],indicators:{quote:[{close:[url.includes('%5EKS11')?4200:900]}]}}]}}));
  }) as typeof fetch;
  const result=await new YahooKoreaSecondarySourceAdapter(fetcher).fetch('2026-10-26','2026-10-27T00:24:59Z');
  assert.equal(result.requiredProviderAvailable,true);assert.equal(result.observations.length,2);
  assert.equal(result.audit.filter(x=>x.status==='PASS').length,2);
  assert.ok(calls.some(x=>x.includes('query2.finance.yahoo.com')));
  assert.doesNotMatch(JSON.stringify(result),/sentinel-private-provider-message/);
 });
}

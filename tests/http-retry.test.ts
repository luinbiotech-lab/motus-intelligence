import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchWithTransientRetry,retryAfterMs} from '../src/operations/http-retry.js';

function scripted(statuses:number[],headers:Record<string,string>={}){
  const calls:string[]=[];
  const fetcher=(async(input:string|URL)=>{calls.push(String(input));const status=statuses.shift()??200;return new Response(status===200?'{"ok":true}':'busy',{status,headers})}) as typeof fetch;
  return {fetcher,calls};
}

test('transient 429 is retried against the same URL and then succeeds',async()=>{
  const waits:number[]=[],{fetcher,calls}=scripted([429,429,200]);
  const response=await fetchWithTransientRetry(fetcher,'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC',()=>({}),{sleep:async ms=>{waits.push(ms)}});
  assert.equal(response.status,200);assert.equal(calls.length,3);assert.ok(calls.every(url=>url==='https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC'));assert.deepEqual(waits,[4000,8000]);
});

test('retries are bounded and the final throttled response is returned for fail-closed handling',async()=>{
  const {fetcher,calls}=scripted([429,429,429,200]);
  const response=await fetchWithTransientRetry(fetcher,'https://example.test/a',()=>({}),{sleep:async()=>undefined});
  assert.equal(response.status,429);assert.equal(calls.length,3);
});

test('non-transient errors are not retried',async()=>{
  const {fetcher,calls}=scripted([404]);
  assert.equal((await fetchWithTransientRetry(fetcher,'https://example.test/b',()=>({}),{sleep:async()=>undefined})).status,404);assert.equal(calls.length,1);
});

test('Retry-After is honoured and capped',async()=>{
  const waits:number[]=[],{fetcher}=scripted([503,200],{'retry-after':'120'});
  await fetchWithTransientRetry(fetcher,'https://example.test/c',()=>({}),{sleep:async ms=>{waits.push(ms)}});
  assert.deepEqual(waits,[15000]);
  assert.equal(retryAfterMs('2'),2000);assert.equal(retryAfterMs(null),null);assert.equal(retryAfterMs('soon'),null);
});

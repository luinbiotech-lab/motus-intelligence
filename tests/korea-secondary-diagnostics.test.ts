import test from 'node:test';
import assert from 'node:assert/strict';
import {YahooKoreaSecondarySourceAdapter} from '../src/operations/korea-official.js';

test('missing Yahoo session keeps HOLD and records requested and returned dates without provider prose',async()=>{
  const fetcher=(async()=>new Response(JSON.stringify({chart:{result:[{timestamp:[Date.parse('2026-10-23T00:00:00Z')/1000],indicators:{quote:[{close:[3000]}]}}]}}))) as typeof fetch;
  const result=await new YahooKoreaSecondarySourceAdapter(fetcher).fetch('2026-10-26','2026-10-27T00:24:59Z');
  assert.equal(result.requiredProviderAvailable,false);assert.equal(result.reasonCode,'YAHOO_FINANCE_KOSPI_ROW_MISSING');
  assert.equal(result.audit[0]!.requestedDate,'2026-10-26');assert.deepEqual(result.audit[0]!.availableDates,['2026-10-23']);assert.equal(result.observations.length,0);
});

test('Yahoo provider error and zero close never masquerade as a verified row',async()=>{
  for(const [body,code] of [[{chart:{error:{description:'apikey=must-not-log'}}},'YAHOO_FINANCE_PROVIDER_ERROR'],[{chart:{result:[{timestamp:[Date.parse('2026-10-26T00:00:00Z')/1000],indicators:{quote:[{close:[0]}]}}]}},'YAHOO_FINANCE_KOSPI_INVALID_CLOSE']] as const){
    const fetcher=(async()=>new Response(JSON.stringify(body))) as typeof fetch;
    const result=await new YahooKoreaSecondarySourceAdapter(fetcher).fetch('2026-10-26','2026-10-27T00:24:59Z');
    assert.equal(result.requiredProviderAvailable,false);assert.equal(result.reasonCode,code);assert.doesNotMatch(JSON.stringify(result),/must-not-log/);
  }
});

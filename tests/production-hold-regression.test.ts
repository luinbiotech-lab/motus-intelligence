import test from 'node:test';
import assert from 'node:assert/strict';
import {RepositoryInternalDailyBuilder,koreaReferenceDate} from '../src/operations/internal-live-daily.js';
import {TwelveDataTimeSeriesProvider} from '../src/operations/market-source-providers.js';
import {buildProductionVerification} from '../src/production/verification-artifact.js';
import type {AIIntelligenceDailyViewModel} from '../src/intelligence/daily-masters.js';
import {readFile} from 'node:fs/promises';

const at='2026-10-13T18:03:18Z';
test('encoded RSS image markup cannot leak into AI prose while citation and sentence survive',async()=>{
 const fetcher=(async(input:RequestInfo|URL)=>{
  const parsed=new URL(String(input)),host=parsed.hostname;
  if(!['blog.google','blogs.nvidia.com'].includes(host))return new Response('<rss/>');
  if(parsed.pathname==='/announcement'){const evidence=host==='blog.google'?'Developers, enterprises, scientists, and consumers gain access to Gemini 4 Argon, the latest frontier model for research and enterprise deployment.':'European partners are using accelerated computing and models to build AI agent applications that improve city operations and public services.';return new Response(`<html><head><meta name="description" content="${evidence}"></head></html>`);}
  const description=host==='blog.google'?'&lt;img src="https://images.example/image.webp"&gt;Developers gain access to the new model.':'<![CDATA[<a href="https://example.com/context">Infrastructure capacity expands.</a>]]>';
  const title=host==='blog.google'?'Gemini 4 Argon: Built to solve hard problems':'European Cities Deploy NVIDIA-Powered AI Agents';
  return new Response(`<rss><item><title>${title}</title><link>https://${host}/announcement</link><pubDate>Tue, 13 Oct 2026 16:00:00 GMT</pubDate><description>${description}</description></item></rss>`);
 }) as typeof fetch;
 const result=await new RepositoryInternalDailyBuilder(fetcher,{}).build('AI_INTELLIGENCE',at);
 assert.equal(result.state,'LIVE_READY');const payload=result.payload!;
 const view=payload.unit.viewModel as AIIntelligenceDailyViewModel;
 assert.ok(view.issues.every(item=>item.whatHappened.join(' ').length>=80)); assert.ok(view.issues.every(item=>/[가-힣]/.test(item.whatHappened.join(' ')))); assert.doesNotMatch(view.issues.flatMap(item=>item.whatHappened).join(' '),/Developers, enterprises|European partners are using/i);
 assert.doesNotMatch(payload.unit.render.html,/images\.example|&amp;lt;img/);
 for(const source of view.sources){assert.ok(payload.unit.render.html.includes(`href="${source.url}"`));assert.ok(view.issues.some(issue=>issue.evidenceRefs.includes(source.url)));}
 assert.equal(buildProductionVerification(payload,'internal',result.audit,at).verification,'VERIFIED');
});

for(const [http,code,reason] of [[404,404,'DATA_NOT_FOUND'],[403,403,'ACCESS_DENIED'],[200,404,'DATA_NOT_FOUND'],[429,429,'RATE_LIMITED']] as const){
 test(`Twelve Data ${http}/${code} distinguishes provider failure without leaking response secrets`,async()=>{
  const provider=new TwelveDataTimeSeriesProvider({TWELVE_DATA_API_KEY:'sentinel-secret'},(async()=>new Response(JSON.stringify({status:'error',code,message:'request apikey=sentinel-secret'}),{status:http})) as typeof fetch);
  await assert.rejects(()=>provider.fetchSeries({symbol:'RUT',count:63,requestedAt:at}),(error:Error)=>{assert.match(error.message,new RegExp(reason));assert.match(error.message,/symbol=RUT endpoint=\/time_series/);assert.doesNotMatch(error.message,/sentinel-secret|apikey=/);return true;});
 });
}
test('optional Russell and DXY failures are audited without a fabricated fallback',async()=>{
 const seen:string[]=[];
 const provider={providerId:'test',async fetchSeries(request:{symbol:string}){seen.push(request.symbol);throw new Error('TWELVE_DATA_DATA_NOT_FOUND symbol='+request.symbol);}};
 const result=await new RepositoryInternalDailyBuilder((async()=>{throw Error('unexpected fallback')}) as typeof fetch,{},undefined,provider).build('US_MARKET',at);
 assert.equal(result.state,'HOLD');assert.equal(result.payload,null);assert.deepEqual(seen,['RUT','DXY']);const twelve=result.audit.filter(entry=>entry.sourceId.startsWith('twelve:'));assert.equal(twelve.length,2);assert.ok(twelve.every(entry=>entry.status==='FAILED'));
});
test('Korea reference dates use KST for offset timestamps, preserve explicit provider dates',()=>{
 assert.equal(koreaReferenceDate('2026-10-13T18:03:00Z'),'2026-10-14');
 assert.equal(koreaReferenceDate('2026-10-14T03:03:00+09:00'),'2026-10-14');
 assert.equal(koreaReferenceDate('20261013200504'),'2026-10-13');
 assert.equal(koreaReferenceDate('20261013'),'2026-10-13');
});
test('Korea next-day FX versus prior close remains HOLD and records the source pair dates',async()=>{
 let officialCalls=0;
 const official={adapterId:'test',async fetch(){officialCalls++;throw Error('must not cross-verify different days');}};
 const fetcher=(async(input:RequestInfo|URL)=>{
  const url=String(input);let data:unknown;
  if(url.includes('/basic'))data={localTradedAt:'2026-10-13T20:15:00+09:00',closePrice:'3000',fluctuationsRatio:'1',marketStatus:'CLOSE'};
  else if(url.includes('FX_USDKRW'))data={exchangeInfo:{localTradedAt:'2026-10-14T03:05:54+09:00',closePrice:'1343.10',fluctuations:'7.10'}};
  else if(url.includes('/trend'))data={bizdate:'20261013',personalValue:'1',foreignValue:'2',institutionalValue:'-3'};
  else if(url.includes('/upjong/'))data=[{name:'업종',changeRate:'1',thistime:'20261013200504'}];
  else data={stocks:[{stockName:'종목',fluctuationsRatio:'1',localTradedAt:'2026-10-13T20:20:18+09:00'}]};
  return new Response(JSON.stringify(data));
 }) as typeof fetch;
 const result=await new RepositoryInternalDailyBuilder(fetcher,{},official).build('KOREA_MARKET',at);
 assert.equal(result.state,'HOLD');assert.equal(result.reason,'KOREA_REFERENCE_DATE_MISMATCH');assert.equal(result.payload,null);assert.equal(officialCalls,0);
 const fx=result.audit.find(entry=>entry.sourceId==='naver:usd-krw')!;
 assert.equal(fx.observedDate,'2026-10-14');assert.equal(fx.referenceDate,'2026-10-13');assert.equal(fx.dateField,'exchangeInfo.localTradedAt');
 assert.ok(result.audit.filter(entry=>entry!==fx).every(entry=>entry.observedDate==='2026-10-13'));
});
test('production schedules remain simulation-only until controlled acceptance is complete',async()=>{
 const workflow=await readFile('.github/workflows/motus-daily-production.yml','utf8');
 assert.match(workflow,/MOTUS_LIVE_PUBLISH_ENABLED:\s*'false'/);
 assert.doesNotMatch(workflow,/SCHEDULE" == "(?:45 21|30 3|30 8) \* \* 1-5"[^\n]*LIVE_PUBLISH=true/);
 assert.match(workflow,/INPUT_EXECUTE_PUBLISH" == "true"/);
});

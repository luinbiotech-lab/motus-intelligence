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
  if(parsed.pathname==='/announcement'){const evidence=host==='blog.google'?'Developers, enterprises, scientists, and consumers gain access to Gemini 4 Argon, the latest frontier model for research and enterprise deployment.':'European partners are using accelerated computing and models to build AI agent applications that improve city operations and public services.';return new Response(`<html><head><meta name="description" content="${evidence}"></head><body><article><p>${evidence} ${evidence}</p></article></body></html>`);}
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
 // A sanitized short fixture remains below the strengthened editorial depth gate.
 // Clean markup alone must never be promoted to a publishable deep analysis.
 assert.equal(buildProductionVerification(payload,'internal',result.audit,at).verification,'REVIEW_REQUIRED');
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
test('Korea morning edition accepts current FX separately from prior-session close',async()=>{
 let officialCalls=0;
 const official={adapterId:'test',async fetch(){officialCalls++;throw Error('must not cross-verify different days');}};
 const fetcher=(async(input:RequestInfo|URL)=>{
  const url=String(input);let data:unknown;
  if(url.includes('/price?'))data=[{localTradedAt:'2026-10-13',closePrice:'3000',fluctuationsRatio:'1'}];
  else if(url.includes('/basic'))data={localTradedAt:'2026-10-13T20:15:00+09:00',closePrice:'3000',fluctuationsRatio:'1',marketStatus:'CLOSE'};
  else if(url.includes('FX_USDKRW'))data={exchangeInfo:{localTradedAt:'2026-10-14T03:05:54+09:00',closePrice:'1343.10',fluctuations:'7.10'}};
  else if(url.includes('/trend'))data={bizdate:'20261013',personalValue:'1',foreignValue:'2',institutionalValue:'-3'};
  else if(url.includes('/upjong/'))data=[{name:'업종',changeRate:'1',thistime:'20261013200504'}];
  else data={stocks:[{stockName:'종목',fluctuationsRatio:'1',localTradedAt:'2026-10-13T20:20:18+09:00'}]};
  return new Response(JSON.stringify(data));
 }) as typeof fetch;
 const result=await new RepositoryInternalDailyBuilder(fetcher,{},official).build('KOREA_MARKET',at);
 assert.equal(result.state,'HOLD');assert.notEqual(result.reason,'KOREA_REFERENCE_DATE_MISMATCH');assert.equal(result.payload,null);assert.equal(officialCalls,1);
 const fx=result.audit.find(entry=>entry.sourceId==='naver:usd-krw')!;
 assert.equal(fx.observedDate,'2026-10-14');assert.equal(fx.referenceDate,'2026-10-14');assert.equal(fx.dateField,'exchangeInfo.localTradedAt');
 assert.ok(result.audit.filter(entry=>entry!==fx).every(entry=>entry.observedDate==='2026-10-13'));
});
test('Korea 08:45 KST production model uses prior session, explicit FX basis and morning editorial',async()=>{
 const morning='2026-10-14T23:45:00Z';
 const official={adapterId:'test-krx',async fetch(){return {requiredProviderAvailable:true,reasonCode:null,phase:'PRE_PUBLICATION' as const,audit:[],observations:[{field:'KOSPI' as const,observedDate:'2026-10-14',value:3000,provider:'KRX' as const,sourceUrl:'https://openapi.krx.co.kr/kospi',metricBasis:'SESSION_CLOSE' as const},{field:'KOSDAQ' as const,observedDate:'2026-10-14',value:900,provider:'KRX' as const,sourceUrl:'https://openapi.krx.co.kr/kosdaq',metricBasis:'SESSION_CLOSE' as const}]}}};
 const fetcher=(async(input:RequestInfo|URL)=>{const url=String(input);let data:unknown;
  if(url.includes('/index/KOSPI/price?'))data=[{localTradedAt:'2026-10-14',closePrice:'3000',fluctuationsRatio:'1'}];
  else if(url.includes('/index/KOSDAQ/price?'))data=[{localTradedAt:'2026-10-14',closePrice:'900',fluctuationsRatio:'-0.5'}];
  else if(url.includes('/index/KOSPI/basic'))data={localTradedAt:'2026-10-14T20:15:00+09:00',closePrice:'3000',fluctuationsRatio:'1',marketStatus:'CLOSE'};
  else if(url.includes('/index/KOSDAQ/basic'))data={localTradedAt:'2026-10-14T20:15:00+09:00',closePrice:'900',fluctuationsRatio:'-0.5',marketStatus:'CLOSE'};
  else if(url.includes('FX_USDKRW'))data={exchangeInfo:{localTradedAt:'2026-10-15T08:40:00+09:00',closePrice:'1343.10',fluctuations:'7.10'}};
  else if(url.includes('/trend'))data={bizdate:'20261014',personalValue:'100',foreignValue:'200',institutionalValue:'-300'};
  else if(url.includes('/upjong/'))data=[{name:'반도체',changeRate:'2.4',thistime:'20261014200504'}];
  else data={stocks:[{stockName:'대표 종목',fluctuationsRatio:'1.2',localTradedAt:'2026-10-14T20:20:18+09:00'}]};
  return new Response(JSON.stringify(data));}) as typeof fetch;
 const result=await new RepositoryInternalDailyBuilder(fetcher,{},official).build('KOREA_MARKET',morning);
 assert.equal(result.state,'LIVE_READY');assert.equal(result.payload?.session.observedDate,'2026-10-14');assert.equal(result.crossVerification?.verification,'VERIFIED');
 const view=result.payload!.unit.viewModel as import('../src/intelligence/daily-masters.js').KoreaMarketDailyViewModel;
 assert.equal(view.operationDate,'2026-10-15');assert.equal(view.sessionDate,'2026-10-14');assert.equal(view.issueDate,'2026-10-15');assert.equal(view.edition,'PREVIOUS_SESSION_MORNING');assert.equal(view.fxBasis,'CURRENT_AT_COLLECTION');assert.ok(view.indexMetrics.every(item=>item.source.label==='한국거래소'));assert.match(view.marketSummary,/전일 국내증시/);assert.doesNotMatch(view.title,/^\d{4}-\d{2}-\d{2}/);assert.match(result.payload!.unit.render.html,/오늘 체크포인트/);assert.match(result.payload!.unit.render.html,/USD\/KRW 수집 시점 현재가/);
});
test('Korea Monday morning accepts the Saturday-stamped FX quote from the extended Friday session',async()=>{
 const morning='2026-10-25T21:20:00Z';
 const official={adapterId:'test-krx',async fetch(){return {requiredProviderAvailable:true,reasonCode:null,phase:'PRE_PUBLICATION' as const,audit:[],observations:[{field:'KOSPI' as const,observedDate:'2026-10-23',value:3000,provider:'KRX' as const,sourceUrl:'https://openapi.krx.co.kr/kospi',metricBasis:'SESSION_CLOSE' as const},{field:'KOSDAQ' as const,observedDate:'2026-10-23',value:900,provider:'KRX' as const,sourceUrl:'https://openapi.krx.co.kr/kosdaq',metricBasis:'SESSION_CLOSE' as const}]}}};
 const fetcher=(async(input:RequestInfo|URL)=>{const url=String(input);let data:unknown;
  if(url.includes('/index/KOSPI/price?'))data=[{localTradedAt:'2026-10-23',closePrice:'3000',fluctuationsRatio:'1'}];
  else if(url.includes('/index/KOSDAQ/price?'))data=[{localTradedAt:'2026-10-23',closePrice:'900',fluctuationsRatio:'-0.5'}];
  else if(url.includes('/index/KOSPI/basic'))data={localTradedAt:'2026-10-23T20:15:00+09:00',closePrice:'3000',fluctuationsRatio:'1',marketStatus:'CLOSE'};
  else if(url.includes('/index/KOSDAQ/basic'))data={localTradedAt:'2026-10-23T20:15:00+09:00',closePrice:'900',fluctuationsRatio:'-0.5',marketStatus:'CLOSE'};
  else if(url.includes('FX_USDKRW'))data={exchangeInfo:{localTradedAt:'2026-10-24T02:00:00+09:00',closePrice:'1343.10',fluctuations:'7.10'}};
  else if(url.includes('/trend'))data={bizdate:'20261023',personalValue:'100',foreignValue:'200',institutionalValue:'-300'};
  else if(url.includes('/upjong/'))data=[{name:'반도체',changeRate:'2.4',thistime:'20261023200504'}];
  else data={stocks:[{stockName:'대표 종목',fluctuationsRatio:'1.2',localTradedAt:'2026-10-23T20:20:18+09:00'}]};
  return new Response(JSON.stringify(data));}) as typeof fetch;
 const result=await new RepositoryInternalDailyBuilder(fetcher,{},official).build('KOREA_MARKET',morning);
 assert.equal(result.state,'LIVE_READY',String(result.reason));assert.equal(result.payload?.session.observedDate,'2026-10-23');
});
test('Korea morning still rejects an FX quote older than the completed session',async()=>{
 const morning='2026-10-25T21:20:00Z';
 const official={adapterId:'test-krx',async fetch(){return {requiredProviderAvailable:true,reasonCode:null,phase:'PRE_PUBLICATION' as const,audit:[],observations:[{field:'KOSPI' as const,observedDate:'2026-10-23',value:3000,provider:'KRX' as const,sourceUrl:'https://openapi.krx.co.kr/kospi',metricBasis:'SESSION_CLOSE' as const},{field:'KOSDAQ' as const,observedDate:'2026-10-23',value:900,provider:'KRX' as const,sourceUrl:'https://openapi.krx.co.kr/kosdaq',metricBasis:'SESSION_CLOSE' as const}]}}};
 const fetcher=(async(input:RequestInfo|URL)=>{const url=String(input);let data:unknown;
  if(url.includes('/index/KOSPI/price?'))data=[{localTradedAt:'2026-10-23',closePrice:'3000',fluctuationsRatio:'1'}];
  else if(url.includes('/index/KOSDAQ/price?'))data=[{localTradedAt:'2026-10-23',closePrice:'900',fluctuationsRatio:'-0.5'}];
  else if(url.includes('/index/KOSPI/basic'))data={localTradedAt:'2026-10-23T20:15:00+09:00',closePrice:'3000',fluctuationsRatio:'1',marketStatus:'CLOSE'};
  else if(url.includes('/index/KOSDAQ/basic'))data={localTradedAt:'2026-10-23T20:15:00+09:00',closePrice:'900',fluctuationsRatio:'-0.5',marketStatus:'CLOSE'};
  else if(url.includes('FX_USDKRW'))data={exchangeInfo:{localTradedAt:'2026-10-22T15:30:00+09:00',closePrice:'1343.10',fluctuations:'7.10'}};
  else if(url.includes('/trend'))data={bizdate:'20261023',personalValue:'100',foreignValue:'200',institutionalValue:'-300'};
  else if(url.includes('/upjong/'))data=[{name:'반도체',changeRate:'2.4',thistime:'20261023200504'}];
  else data={stocks:[{stockName:'대표 종목',fluctuationsRatio:'1.2',localTradedAt:'2026-10-23T20:20:18+09:00'}]};
  return new Response(JSON.stringify(data));}) as typeof fetch;
 const result=await new RepositoryInternalDailyBuilder(fetcher,{},official).build('KOREA_MARKET',morning);
 assert.equal(result.state,'HOLD');assert.match(String(result.reason),/KOREA_FX_REFERENCE_DATE_MISMATCH:2026-10-22:2026-10-23:2026-10-26/);
});
test('all three approved schedules enable live publication with credential preflight',async()=>{
 const workflow=await readFile('.github/workflows/motus-daily-production.yml','utf8');
 assert.match(workflow,/MOTUS_LIVE_PUBLISH_ENABLED:\s*'false'/);
 assert.match(workflow,/SCHEDULE" == "30 3 \* \* 1-5" && "\$CATEGORY" == "ai"/);
 assert.match(workflow,/17 21 \* \* 0-4/);
 assert.match(workflow,/45 21 \* \* 1-5[^\n]*CATEGORY=us/);assert.match(workflow,/30 3 \* \* 1-5[^\n]*CATEGORY=ai/);assert.match(workflow,/SCHEDULE" == "17 21 \* \* 0-4" && "\$CATEGORY" == "korea"/);
 assert.match(workflow,/Require Blogger credentials before live publication/);
 assert.match(workflow,/INPUT_EXECUTE_PUBLISH" == "true"/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {YahooKoreaSecondarySourceAdapter,yahooClosedSession} from '../src/operations/korea-official.js';
import {hasBrokerCause} from '../src/operations/market-deep-sections.js';
import type {BrokerBrief} from '../src/operations/broker-briefs.js';

// MOT-044 (2026-11-12): morning Korea runs held with YAHOO_FINANCE_KOSPI_ROW_MISSING while Yahoo's latest daily
// row was not yet filled; the regular-market quote after the 15:30 KST close is that session's close.
const at=(iso:string)=>Date.parse(iso)/1000;
function yahoo(row:'absent'|'null'|'value',quoteTime:string){
  return (async(input:string|URL)=>{
    const kospi=String(input).includes('%5EKS11');
    const timestamp=[at('2026-11-10T00:00:00Z'),...(row==='absent'?[]:[at('2026-11-11T00:00:00Z')])];
    const close=[kospi?4000:900,...(row==='absent'?[]:[row==='null'?null:(kospi?4100:910)])];
    return new Response(JSON.stringify({chart:{result:[{meta:{exchangeTimezoneName:'Asia/Seoul',regularMarketPrice:kospi?4123.45:912.3,regularMarketTime:at(quoteTime)},timestamp,indicators:{quote:[{close}]}}]}}));
  }) as typeof fetch;
}

test('Yahoo Korea: an empty latest row falls back to the post-close regular-market quote',async()=>{
  for(const row of ['absent','null'] as const){
    const result=await new YahooKoreaSecondarySourceAdapter(yahoo(row,'2026-11-11T06:31:00Z')).fetch('2026-11-11','2026-11-11T21:18:00Z');
    assert.equal(result.requiredProviderAvailable,true,row);
    assert.deepEqual(result.observations.map(x=>[x.field,x.value]),[['KOSPI',4123.45],['KOSDAQ',912.3]],row);
    assert.ok(result.audit.some(x=>x.sourceId.endsWith(':quote')&&x.status==='PASS'),row);
  }
});

test('Yahoo Korea: a filled row is used as before, and an intraday quote never stands in for the close',async()=>{
  const filled=await new YahooKoreaSecondarySourceAdapter(yahoo('value','2026-11-11T06:31:00Z')).fetch('2026-11-11','2026-11-11T21:18:00Z');
  assert.deepEqual(filled.observations.map(x=>x.value),[4100,910]);
  const intraday=await new YahooKoreaSecondarySourceAdapter(yahoo('null','2026-11-11T05:00:00Z')).fetch('2026-11-11','2026-11-11T05:10:00Z');
  assert.equal(intraday.requiredProviderAvailable,false);
  assert.equal(intraday.reasonCode,'YAHOO_FINANCE_KOSPI_ROW_MISSING');
  const otherDay=await new YahooKoreaSecondarySourceAdapter(yahoo('absent','2026-11-10T06:31:00Z')).fetch('2026-11-11','2026-11-11T21:18:00Z');
  assert.equal(otherDay.requiredProviderAvailable,false);
});

test('yahooClosedSession only dates quotes at or after the 15:30 KST close',()=>{
  assert.equal(yahooClosedSession(at('2026-11-11T06:30:00Z'),'Asia/Seoul'),'2026-11-11');
  assert.equal(yahooClosedSession(at('2026-11-11T06:29:00Z'),'Asia/Seoul'),'');
  assert.equal(yahooClosedSession(undefined,'Asia/Seoul'),'');
});

const brief=(texts:string[],region:'US'|'KOREA'):BrokerBrief=>({report:{kind:'MARKET',date:'2026-11-12',title:'Daily',broker:'테스트증권',analysts:'',url:'https://example.com/r.pdf',summary:[],targetPrice:null,rating:null,stockCode:null,company:null},statements:texts.map(text=>({region,text,heading:null})),digests:[]});

test('MOT-044: statements without a driver do not count as a broker explanation (wire fallback stays open)',()=>{
  assert.equal(hasBrokerCause([],'KOREA'),false);
  assert.equal(hasBrokerCause([brief(['코스피 4,100.25(+1.2%), 코스닥 910.33(+0.8%)'],'KOREA')],'KOREA'),false);
  assert.equal(hasBrokerCause([brief(['반도체 실적 기대에 외국인 순매수가 이어지며 코스피가 상승했다'],'KOREA')],'KOREA'),true);
  assert.equal(hasBrokerCause([brief(['반도체 실적 기대에 외국인 순매수가 이어지며 코스피가 상승했다'],'KOREA')],'US'),false);
});

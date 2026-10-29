import test from 'node:test';
import assert from 'node:assert/strict';
import {renderMarketResearchEntries} from '../src/publishers/editorial-article.js';
test('Blogger cites concrete publisher, date and official link without invented market views',()=>{
 const html=renderMarketResearchEntries([
 {publisher:'KB증권',headline:'금리와 인플레이션 전망',url:'https://rc.kbsec.com/detailView.able?documentid=20261021144128693K',publishedAt:'2026-10-21T00:00:00Z',kind:'BROKER_RESEARCH'},
 {publisher:'CNBC',headline:'Stocks rally after earnings beat',url:'https://www.cnbc.com/2026/10/28/stocks.html',publishedAt:'2026-10-28T09:00:00Z',kind:'FINANCIAL_MEDIA'},
 ],'2026-10-29');
 assert.match(html,/증권사 공개 리서치 자료/);
 assert.match(html,/KB증권/);
 assert.match(html,/금리와 인플레이션 전망/);
 assert.match(html,/과거 자료/);
 assert.match(html,/금융 전문 언론 원문/);
 assert.match(html,/공식 원문 확인/);
 assert.match(html,/https:\/\/www.cnbc.com/);
 assert.doesNotMatch(html,/목표주가 상향|강력 매수|실적 기대와 금리의 줄다리기/);
});
test('unverifiable or future-dated market research never appears in Blogger HTML',()=>{
 const html=renderMarketResearchEntries([
 {publisher:'Future',headline:'미래 정보',url:'https://example.org/story',publishedAt:'2026-11-01T00:00:00Z',kind:'FINANCIAL_MEDIA'},
 {publisher:'Broken',headline:'사실 정보',url:'javascript:alert(1)',publishedAt:'2026-10-28T00:00:00Z',kind:'BROKER_RESEARCH'},
 ],'2026-10-29');
 assert.equal(html,'');
});

test('Blogger renders dated first-party KB published evidence, not an inferred analyst rating',()=>{
 const html=renderMarketResearchEntries([{publisher:'KB증권 리서치',headline:'금리와 인플레이션 전망',url:'https://rc.kbsec.com/detailView.able?documentid=20261021144128693K',publishedAt:'2026-10-21T00:00:00Z',kind:'BROKER_RESEARCH',evidence:['주식: 견조한 실적 흐름과 AI 투자','채권: 금리 변동성에 유의']}],'2026-10-29');
 assert.match(html,/공식 공개 요약/);
 assert.match(html,/견조한 실적 흐름/);
 assert.match(html,/금리 변동성/);
 assert.match(html,/과거 자료/);
 assert.doesNotMatch(html,/강력매수|목표주가 상향/);
});

test('broker and media research sections do not repeat identical prose blocks',async()=>{
 const {evaluateEditorialQuality}=await import('../src/production/editorial-quality.js');
 const html=renderMarketResearchEntries([
 {publisher:'KB증권',headline:'국내 주식과 금리 분석',url:'https://rc.kbsec.com/detailView.able?documentid=20261021144128693K',publishedAt:'2026-10-21T00:00:00Z',kind:'BROKER_RESEARCH'},
 {publisher:'CNBC',headline:'U.S. stocks rise amid Fed guidance',url:'https://www.cnbc.com/2026/10/28/markets.html',publishedAt:'2026-10-28T13:00:00Z',kind:'FINANCIAL_MEDIA'}
 ],'2026-10-29');
 const check=evaluateEditorialQuality('국내증시 마감 후 주요 금융시장 분석 자료',html);
 assert.ok(!check.reasons.includes('boilerplate prose repetition detected'),check.reasons.join('; '));
});

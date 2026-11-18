import test from 'node:test';
import assert from 'node:assert/strict';
import {articleText,collectWireCloses} from '../src/operations/market-wire.js';

// Owner 2026-11-16: 11/11 evening Korea edition held (BROKER_MARKET_COMMENTARY_UNAVAILABLE) although wire close reports
// existed; 연합뉴스 RSS items carry no summary, so only reports with a causal feed summary or title could count.
const rss=(items:string)=>`<?xml version="1.0"?><rss><channel>${items}</channel></rss>`;
const item=(title:string,link:string,date:string,description='')=>`<item><title>${title}</title><link>${link}</link><pubDate>${date}</pubDate><description>${description}</description></item>`;

test('articleText keeps paragraphs and drops scripts', () => {
  const text=articleText('<html><script>var a="<p>no</p>"</script><p>(서울=연합뉴스) 기자 = 코스피가 16일 외국인 순매도에 3% 넘게 급락했다.</p><p>짧음</p></html>');
  assert.match(text,/외국인 순매도에 3% 넘게 급락했다/);assert.doesNotMatch(text,/no/);
});

test('a close report without a feed summary gets its causal sentence from the article page', async () => {
  const article='https://www.yna.co.kr/view/AKR20261116000100002';
  const calls:string[]=[];
  const fetcher=(async(url:string)=>{calls.push(url);
    if(url===article)return new Response('<div><p>(서울=연합뉴스) 홍길동 기자 = 16일 코스피는 외국인의 대규모 순매도에 밀려 급락 마감했다.</p></div>');
    if(url.includes('yna.co.kr/rss/market'))return new Response(rss(item('코스피 3.59%↓ 5,100선으로 후퇴…코스닥도 4.8%↓',article,'Mon, 16 Nov 2026 16:37:57 +0900')));
    return new Response(rss(''));
  }) as unknown as typeof fetch;
  const result=await collectWireCloses({region:'KOREA',sessionDate:'2026-11-16',change:-3.59,fetcher,now:Date.parse('2026-11-16T08:10:00Z')});
  assert.equal(result.reports.length,1);
  assert.match(result.reports[0]!.sentence??'',/순매도에 밀려 급락/);
  assert.ok(calls.includes(article));
});

test('an article that fails to load is recorded and the session still holds without a sentence', async () => {
  const article='https://www.yna.co.kr/view/AKR20261116000100003';
  const fetcher=(async(url:string)=>{
    if(url===article)return new Response('gone',{status:404});
    if(url.includes('yna.co.kr/rss/market'))return new Response(rss(item('코스피 3.59%↓ 5,100선으로 후퇴',article,'Mon, 16 Nov 2026 16:37:57 +0900')));
    return new Response(rss(''));
  }) as unknown as typeof fetch;
  const result=await collectWireCloses({region:'KOREA',sessionDate:'2026-11-16',change:-3.59,fetcher,now:Date.parse('2026-11-16T08:10:00Z')});
  assert.equal(result.reports.length,0);
  assert.ok(result.audit.some(entry=>entry.sourceId.startsWith('wire:article:')&&entry.error==='WIRE_ARTICLE_HTTP_404'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {collectMarketResearch,selectMarketResearch,type ResearchFeed} from '../src/operations/market-research-feeds.js';
const feed:ResearchFeed={publisher:'Test Finance',url:'https://news.example.com/rss',domains:['news.example.com'],region:'US_MARKET',kind:'FINANCIAL_MEDIA'};
const xml='<rss><channel>'+
'<item><title>Nasdaq stocks rise as analysts study earnings</title><link>https://news.example.com/markets/article-1</link><pubDate>Wed, 28 Oct 2026 13:00:00 GMT</pubDate><description>Headlines only</description></item>'+
'<item><title>Cooking recipes for autumn</title><link>https://news.example.com/life/recipe</link><pubDate>Wed, 28 Oct 2026 12:00:00 GMT</pubDate></item>'+
'<item><title>Stocks jump on fake third-party domain</title><link>https://other.example.org/markets</link><pubDate>Wed, 28 Oct 2026 12:00:00 GMT</pubDate></item>'+
'<item><title>Markets jump from future</title><link>https://news.example.com/markets/future</link><pubDate>Wed, 29 Oct 2026 13:00:00 GMT</pubDate></item>'+
'</channel></rss>';
test('financial media intake keeps only dated market headlines on the approved publisher domain',()=>{
 const result=selectMarketResearch(xml,feed,'2026-10-28T14:00:00Z');
 assert.equal(result.length,1);assert.equal(result[0]?.publisher,'Test Finance');assert.equal(result[0]?.kind,'FINANCIAL_MEDIA');assert.equal(result[0]?.headline,'Nasdaq stocks rise as analysts study earnings');
});
test('RSS publisher outage is recorded without fabricating research',async()=>{
 const collector=await collectMarketResearch('US_MARKET','2026-10-28T14:00:00Z',(async()=>new Response('blocked',{status:403})) as typeof fetch,[feed]);
 assert.equal(collector.entries.length,0);assert.equal(collector.audit[0]?.error,'FEED_HTTP_403');
});
test('RSS feed passes through published market headlines with provenance',async()=>{
 const collector=await collectMarketResearch('US_MARKET','2026-10-28T14:00:00Z',(async()=>new Response(xml,{status:200})) as typeof fetch,[feed]);
 assert.equal(collector.entries.length,1);assert.equal(collector.entries[0]?.url,'https://news.example.com/markets/article-1');assert.equal(collector.audit[0]?.status,'PASS');
});

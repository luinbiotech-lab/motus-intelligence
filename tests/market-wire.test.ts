import test from 'node:test';
import assert from 'node:assert/strict';
import {causalSentence,collectWireCloses,contradictsDirection,isCloseReport,parseWireFeed,selectWireReports,wireTime,type WireReport} from '../src/operations/market-wire.js';
import {composeKoreaDeepSections,composeUSDeepSections} from '../src/operations/market-deep-sections.js';

// Synthetic fixtures in the feed formats observed on the wire RSS endpoints (RFC 822 dates; bare KST dates).
const rfcFeed=`<rss><channel>
<item><title><![CDATA[AI 투자 우려 재점화…뉴욕증시 일제히 하락(종합)]]></title><link>https://example.test/wire/a1</link><pubDate>Fri, 30 Oct 2026 06:30:36 +0900</pubDate><description><![CDATA[(뉴욕=통신) 홍길동 특파원 = 29일(현지시간) 미국 뉴욕 증시 3대 지수가 일제히 하락 마감했다.]]></description></item>
<item><title><![CDATA[뉴욕증시, 기업 실적 소화하며 하락 출발]]></title><link>https://example.test/wire/a0</link><pubDate>Thu, 29 Oct 2026 23:05:00 +0900</pubDate><description><![CDATA[개장 직후 기사.]]></description></item>
</channel></rss>`;
const bareFeed=`<rss><channel>
<item><title>[뉴욕증시] 대형 기술주 흔들린다…나스닥 1.38%↓</title><link>https://example.test/wire/b1</link><description><![CDATA[뉴욕증시의 3대 주가지수가 동반 하락했다.대형 기술주의 3분기 실적이 예상에 못 미치면서 시장에 충격을 줬고 기술주 전반의 투심이 꺾였다.다우지수는 132.54포인트(0.25%) 떨어진 52,342.56에 마감했다.]]></description><pubDate>2026-10-30 05:54:11</pubDate></item>
<item><title>[뉴욕증시-1보] 대형 기술주 흔들린다…나스닥 1.38%↓</title><link>https://example.test/wire/b0</link><description><![CDATA[1보.]]></description><pubDate>2026-10-30 05:12:33</pubDate></item>
<item><title>[증시-마감] 코스피, 대형주 실망에 1.24% 하락</title><link>https://example.test/wire/b2</link><description><![CDATA[코스피가 대형 반도체주의 실적 실망에 하락 마감했다.]]></description><pubDate>2026-10-29 15:41:00</pubDate></item>
</channel></rss>`;

test('wire dates: RFC 822 keeps its zone and bare dates are Korean time', () => {
  assert.equal(new Date(wireTime('Fri, 30 Oct 2026 06:30:36 +0900')).toISOString(),'2026-10-29T21:30:36.000Z');
  assert.equal(new Date(wireTime('2026-10-30 05:54:11')).toISOString(),'2026-10-29T20:54:11.000Z');
});

test('causal sentence skips the byline and index-only sentences', () => {
  assert.equal(causalSentence('(뉴욕=통신) 홍길동 특파원 = 29일(현지시간) 미국 뉴욕 증시 3대 지수가 일제히 하락 마감했다.'),null);
  assert.equal(causalSentence('뉴욕증시의 3대 주가지수가 동반 하락했다.대형 기술주의 3분기 실적이 예상에 못 미치면서 시장에 충격을 줬다.'),'대형 기술주의 3분기 실적이 예상에 못 미치면서 시장에 충격을 줬다.');
  assert.equal(causalSentence('[서울=통신] 김기자 기자 = 다우지수는 132.54포인트(0.25%) 내린 52342.56에 거래를 마쳤다.'),null);
});

test('only close reports qualify: openings, flashes and first takes do not', () => {
  assert.equal(isCloseReport('US','뉴욕증시, 기업 실적 소화하며 하락 출발'),false);
  assert.equal(isCloseReport('US','[속보]뉴욕증시, 하락 마감'),false);
  assert.equal(isCloseReport('US','[뉴욕증시-1보] 나스닥 1.38%↓'),false);
  assert.equal(isCloseReport('US','AI 투자 우려 재점화…뉴욕증시 일제히 하락(종합)'),true);
  assert.equal(isCloseReport('KOREA','[증시-마감] 코스피, 대형주 실망에 1.24% 하락'),true);
  assert.equal(isCloseReport('KOREA','[코스피·코스닥 전 거래일(29일) 주요공시]'),false);
  assert.equal(isCloseReport('KOREA','코스피, 외국인 매도에 하락 출발'),false);
});

test('a headline naming only the opposite direction is dropped', () => {
  assert.equal(contradictsDirection('코스피, 1.2% 하락',1.1),true);
  assert.equal(contradictsDirection('코스피, 1.2% 하락',-1.2),false);
  assert.equal(contradictsDirection('뉴욕증시 혼조',0.3),false);
  assert.equal(contradictsDirection('뉴욕증시 일제히 하락',null),false);
});

test('selection keeps one close report per publisher inside the session window', () => {
  const reports=[...parseWireFeed(rfcFeed,{url:'https://example.test/a.xml',publisher:'연합뉴스'}),...parseWireFeed(bareFeed,{url:'https://example.test/b.xml',publisher:'연합인포맥스'})];
  const now=Date.parse('2026-10-29T23:30:00Z');
  const us=selectWireReports(reports,'US','2026-10-29',-0.6,now);
  assert.deepEqual(us.map(item=>item.url).sort(),['https://example.test/wire/a1','https://example.test/wire/b1']);
  assert.equal(us.find(item=>item.publisher==='연합인포맥스')!.sentence,'대형 기술주의 3분기 실적이 예상에 못 미치면서 시장에 충격을 줬고 기술주 전반의 투심이 꺾였다.');
  // A verified up session drops the down headlines; a report published after 'now' is not yet known.
  assert.equal(selectWireReports(reports,'US','2026-10-29',0.8,now).length,0);
  assert.equal(selectWireReports(reports,'US','2026-10-29',-0.6,Date.parse('2026-10-29T20:00:00Z')).length,0);
  // The Korea close for the 29th sits in its own window, not in the next session's.
  assert.deepEqual(selectWireReports(reports,'KOREA','2026-10-29',-1.24,now).map(item=>item.url),['https://example.test/wire/b2']);
  assert.equal(selectWireReports(reports,'KOREA','2026-10-30',-1.24,Date.parse('2026-10-30T23:00:00Z')).length,0);
});

const wire:WireReport[]=[{publisher:'연합인포맥스',title:'[뉴욕증시] 대형 기술주 흔들린다…나스닥 1.38%↓',url:'https://example.test/wire/b1',publishedAt:'2026-10-29T20:54:11.000Z',sentence:'대형 기술주의 3분기 실적이 예상에 못 미치면서 시장에 충격을 줬다.',feed:'https://example.test/b.xml'},{publisher:'연합뉴스',title:'AI 투자 우려 재점화…뉴욕증시 일제히 하락(종합)',url:'https://example.test/wire/a1',publishedAt:'2026-10-29T21:30:36.000Z',sentence:null,feed:'https://example.test/a.xml'}];

test('without a broker brief, wire close reports become the attributed core commentary', () => {
  const none=composeUSDeepSections({bundle:null,stocks:[],sectors:[],checkpoint:'다음 확인 지표.'});
  assert.equal(none.hasCoreCommentary,false);
  const composed=composeUSDeepSections({bundle:null,stocks:[],sectors:[],checkpoint:'다음 확인 지표.',wire});
  assert.equal(composed.hasCoreCommentary,true);
  const section=composed.sections.find(item=>item.key==='us-causes')!;
  assert.equal(section.paragraphs[0]!.text,'연합인포맥스는 10월 30일 마감 기사 「[뉴욕증시] 대형 기술주 흔들린다…나스닥 1.38%↓」에서 “대형 기술주의 3분기 실적이 예상에 못 미치면서 시장에 충격을 줬다”라고 전했다.');
  assert.equal(section.paragraphs[1]!.text,'연합뉴스는 10월 30일 마감 기사에서 “AI 투자 우려 재점화…뉴욕증시 일제히 하락”이라고 전했다.');
  assert.equal(section.paragraphs[0]!.source!.url,'https://example.test/wire/b1');
  assert.match(composed.leadAddition[0]!,/^연합인포맥스는 이날 장을 “/);
  assert.deepEqual(composed.sources.map(item=>[item.publisher,item.date]),[['연합인포맥스','2026-10-30'],['연합뉴스','2026-10-30']]);
  const korea=composeKoreaDeepSections({bundle:null,searchTop:[],checkpoint:'다음 확인 지표.',wire:[{...wire[0]!,title:'[증시-마감] 코스피, 대형주 실망에 1.24% 하락',publishedAt:'2026-10-29T06:41:00.000Z',sentence:'코스피가 대형 반도체주의 실적 실망에 하락 마감했다.'}]});
  assert.equal(korea.hasCoreCommentary,true);
  assert.match(korea.leadAddition[0]!,/^연합인포맥스는 전일 장을 “코스피가 대형 반도체주의 실적 실망에 하락 마감했다”라고 전했다\.$/);
});

test('wire collection records failed feeds without throwing', async () => {
  const fetcher=(async (url:string|URL|Request)=>{const href=String(url);if(href.includes('einfomax'))return new Response(bareFeed,{status:200});if(href.includes('newsis'))return new Response('no',{status:503});throw new Error('offline')}) as typeof fetch;
  const result=await collectWireCloses({region:'US',sessionDate:'2026-10-29',change:-0.6,fetcher,now:Date.parse('2026-10-29T23:30:00Z')});
  assert.deepEqual(result.reports.map(item=>item.url),['https://example.test/wire/b1']);
  assert.ok(result.audit.some(item=>item.status==='FAILED'&&item.error==='WIRE_HTTP_503'));
  assert.ok(result.audit.some(item=>item.status==='FAILED'&&item.error==='WIRE_FETCH_FAILED'));
  assert.ok(result.audit.some(item=>item.status==='PASS'&&item.url==='https://example.test/wire/b1'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {causalSentence,collectWireCloses,isCloseReport,otherMarketHeadline,otherMarketSentence} from '../src/operations/market-wire.js';

// MO-34: the Korea close quoted a bond close as the KOSPI cause on 11/24 and 11/25 (published 11/25·11/26).
const bondCloses=[
  {title:'국고채 금리 혼조세…코스피 상승 속 외인 선물 매수(종합)',sentence:'24일 국고채 금리는 만기별로 엇갈린 움직임을 보이며 혼조세로 마감했다'},
  {title:'[채권-마감] 금통위 대기 속 코스피 급락·外人 매수…국고 3년 3.5%대 진입',sentence:'국고채 금리가 25일 하락했다'},
];
// Every wire quote the Korea close actually used from 11/10 to 11/26, other than the two above. All are stock closes.
const stockCloses=[
  {title:'코스피·코스닥, 4%대 급등 마감…급락딛고 4거래일만 반등(종합)',sentence:"미국 중간선거에서 민주당이 압승한 이른바 '블루 쓰나미'에 따른 데이터센터 지연·차질 우려로 최근 3거래일 연속 하락했다"},
  {title:"[증시-마감] '삼전닉스' 급등에 코스피 4%↑…8거래일만에 돌아온 외국인",sentence:'코스피가 미국 반도체주 순풍에 힘입어 4%대 상승 마감했다'},
  {title:'[증시-마감] 외국인 1조6천억 \'팔자\'에…코스피 5,100선 턱걸이',sentence:'코스피가 인공지능(AI) 전반의 투자심리 악화와 외국인의 강한 매도세 영향으로 급락 마감했다'},
  {title:'[증시-마감] 엔비디아 실적 앞두고 코스피 5,000선 하회…외인 줄매도',sentence:'코스피가 인공지능(AI) 대표기업 엔비디아 실적 발표를 앞둔 경계감에 하락했다'},
  {title:'코스피, 앤트로픽 상장 앞두고 등락 끝에 1.4% 상승 마감(종합)',sentence:'19일 코스피가 앤트로픽의 나스닥 상장을 앞두고 등락 끝에 상승 마감했다'},
  {title:"5%대 급락 '검은 금요일'…코스피 4,800대로 후퇴, 10개월만 최저(종합)",sentence:'앤트로픽 상장 흥행에도 대중 반도체 규제 우려'},
  {title:'[증시-마감] 코스피 AMD發 반도체 불안에 5.2%↓…10개월 만에 최저',sentence:'코스피가 글로벌 반도체 기업을 향한 수출 통제 우려감에 4,800대로 급락했다'},
  {title:'급락에 쪼그라든 코스피…고점 대비 반토막·올 수익률 11%로 뚝',sentence:'국내증시의 내림세가 좀처럼 멎지 않는 배경에는 외국인의 매도세가 자리잡고 있다'},
  {title:"[증시-마감] 코스피, 외인·개인 '팔자'에 3%대 급락…'증안펀드' 주시",sentence:'코스피가 지난 금요일 미국 증시 폭락의 여파를 반영하면서 23일 약세 흐름을 이어갔다'},
  {title:'[증시-마감] 젠슨 황 깜짝 복귀에 코스피 5천선 회복…3영업일 만에 반등',sentence:'젠슨 황 엔비디아 최고경영자(CEO)의 복귀 소식에 코스피가 3영업일 만에 반등했다'},
  {title:'코스피, 6%대 급락 4,697…전날 급등분 모두 반납(종합)',sentence:'AI 투심 위축에 미 기술주 약세…전날 상승분 반납'},
  {title:'[증시-마감] 저가 매수에 코스피 4,700선 회복…4,711.21 마감',sentence:'코스피가 저가 매수세 속에서 전일의 급락분을 일부 되돌리고 4,700선을 회복했다'},
  {title:'환율 급등에 코스피 2% 하락 마감',sentence:'원·달러 환율 급등에 외국인이 순매도하며 코스피가 하락했다'},
];

test('MO-34: a bond or FX close is not a Korea stock close, even when its headline names 코스피', () => {
  for(const item of bondCloses){
    assert.equal(otherMarketHeadline(item.title),true,item.title);
    assert.equal(isCloseReport('KOREA',item.title),false,item.title);
    assert.equal(otherMarketSentence('KOREA',item.sentence),true,item.sentence);
  }
  assert.equal(isCloseReport('KOREA','[외환-마감] 코스피 급락에 달러-원 1,480원 돌파'),false);
});

test('MO-34: every stock close the Korea article quoted from 11/10 to 11/26 still qualifies', () => {
  for(const item of stockCloses){
    assert.equal(otherMarketHeadline(item.title),false,item.title);
    assert.equal(isCloseReport('KOREA',item.title),true,item.title);
    assert.equal(otherMarketSentence('KOREA',item.sentence),false,item.sentence);
  }
  // The U.S. close is not filtered: a Treasury-yield sentence can explain a Wall Street session.
  assert.equal(otherMarketSentence('US','미 국채 금리가 급등하면서 기술주가 약세를 보였다'),false);
});

test('MO-34: the causal sentence skips a bond sentence and takes the stock one that follows', () => {
  const article='국고채 금리가 25일 하락했다.\n코스피가 AI 투자심리 위축과 외국인 선물 매도 영향으로 6% 넘게 급락했다.';
  assert.equal(causalSentence(article,'KOREA'),'코스피가 AI 투자심리 위축과 외국인 선물 매도 영향으로 6% 넘게 급락했다.');
  assert.equal(causalSentence(article),'국고채 금리가 25일 하락했다.');
});

test('MO-34: a feed summary about bonds is dropped and the stock close is read from its article', async () => {
  const feed=`<rss><channel>
<item><title><![CDATA[[채권-마감] 금통위 대기 속 코스피 급락·外人 매수…국고 3년 3.5%대 진입]]></title><link>https://example.test/wire/bond</link><pubDate>2026-11-25 16:40:00</pubDate><description><![CDATA[국고채 금리가 25일 하락했다.]]></description></item>
<item><title><![CDATA[[증시-마감] 코스피, AI 투심 위축에 6%대 급락…4,697]]></title><link>https://example.test/wire/stock</link><pubDate>2026-11-25 15:50:00</pubDate><description><![CDATA[국고채 금리가 일제히 하락하는 등 안전자산 선호가 강해졌다.]]></description></item>
</channel></rss>`;
  const fetcher=(async(url:string)=>{
    if(url.endsWith('.xml'))return new Response(url.includes('einfomax.co.kr/rss/allArticle')?feed:'<rss><channel></channel></rss>',{status:200});
    if(url==='https://example.test/wire/stock')return new Response('<p>국고채 금리가 일제히 하락하는 등 안전자산 선호가 강해졌다.</p><p>코스피가 AI 투자심리 위축과 외국인 매도 영향으로 6%대 급락 마감했다.</p>',{status:200});
    return new Response('',{status:404});
  }) as typeof fetch;
  const {reports}=await collectWireCloses({region:'KOREA',sessionDate:'2026-11-25',change:-6.16,fetcher,now:Date.parse('2026-11-25T10:00:00Z')});
  assert.deepEqual(reports.map(item=>[item.url,item.sentence]),[['https://example.test/wire/stock','코스피가 AI 투자심리 위축과 외국인 매도 영향으로 6%대 급락 마감했다.']]);
});

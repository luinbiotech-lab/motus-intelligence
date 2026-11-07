import test from 'node:test';
import assert from 'node:assert/strict';
import {articleKeywords,contentFeatures} from '../src/operations/traffic.js';

test('article keywords: the market phrase plus the headline head without figures', () => {
  assert.deepEqual(articleKeywords('코스피 3.59% 급락해 5,648…검색 1위 삼성전자 3.1% 하락',['국내증시']),['코스피 마감','코스피']);
  assert.deepEqual(articleKeywords('뉴욕증시 3대 지수 혼조…오라클 5.8% 급등',['미국증시']),['뉴욕증시 마감','뉴욕증시 지수 혼조']);
  assert.equal(articleKeywords('엔비디아가 공개한 도시 운영에 적용되는 AI 에이전트',['AI 인텔리전스'])[0],'AI 뉴스');
});

test('content features count text, images, charts, headings, tables and links', () => {
  const f=contentFeatures('<h2>제목</h2><p>본문 &amp; 내용</p><img src="a"><svg></svg><table></table><a href="x">링크</a><script>x()</script>');
  assert.deepEqual(f,{textLength:'제목 본문 내용 링크'.length,imageCount:1,chartCount:1,headingCount:1,tableCount:1,linkCount:1});
});

test('market titles carry 마감 and the exact close, no calendar date (owner 2026-11-05, #97)', async () => {
  const {koreaTitleHead}=await import('../src/operations/market-deep-collect.js');
  const {evaluateEditorialQuality,titleContainsCalendarDate}=await import('../src/production/editorial-quality.js');
  assert.equal(koreaTitleHead(-3.59,5648.79),'코스피 마감, 3.59% 급락 5,648.79');
  assert.equal(koreaTitleHead(0.62,5683.1),'코스피 마감, 0.62% 상승 5,683.10');
  assert.equal(koreaTitleHead(null,5683.1),null);
  // '하락…하락' is avoided: the index takes the verb form when the focus repeats the word (#100 review).
  assert.equal(koreaTitleHead(-1.236,5937,'검색 1위 삼성전자 4.8% 하락'),'코스피 마감, 1.24% 내려 5,937.00');
  assert.equal(koreaTitleHead(-1.236,5937,'검색 1위 삼성전자 4.8% 상승'),'코스피 마감, 1.24% 하락 5,937.00');
  for(const title of ['코스피 마감, 3.59% 급락 5,648.79…검색 1위 삼성전자 3.1% 하락','뉴욕증시 마감, 3대 지수 혼조…오라클 5.8% 급등']){
    assert.equal(titleContainsCalendarDate(title),false,title);
    const html='<article style="max-width:100%;overflow-x:hidden"><p>검증된 시장 사실을 충분한 문장으로 설명하고 배경과 맥락을 함께 제시한다. 독자는 원문을 열지 않아도 핵심 흐름을 이해할 수 있다.</p><p>두 번째 문단에서는 움직임의 의미와 산업 연결을 구체적으로 정리하고 과장된 인과관계를 피한다. 숫자는 검증된 값만 쓴다.</p><p>마지막 문단에서는 다음 거래일에 확인할 변수를 제시하고 검증된 출처만 연결한다. 투자 권유가 아니다.</p></article>';
    const reasons=evaluateEditorialQuality(title,html).reasons.filter(reason=>/title/.test(reason));
    assert.deepEqual(reasons,[],title);
  }
});

test('articles link recent MOTUS posts (internal links for indexing), only blog URLs, never as sources', async () => {
  const {relatedPosts}=await import('../src/publishers/editorial-article.js');
  const html=relatedPosts([{title:'코스피 마감, 0.62% 상승 5,683.10',url:'https://motusnova.blogspot.com/2026/11/a.html',label:'국내증시',published:'2026-11-05'},{title:'외부 글',url:'https://example.com/x',label:'',published:''},{title:'핵심 내용 정리',url:'https://motusnova.blogspot.com/2026/11/b.html',label:'',published:''}]);
  assert.match(html,/data-section="related-posts"/);
  assert.match(html,/href="https:\/\/motusnova\.blogspot\.com\/2026\/11\/a\.html"/);
  assert.doesNotMatch(html,/example\.com|핵심 내용/);
  assert.equal(relatedPosts([]),'');assert.equal(relatedPosts(undefined),'');
  // A risky title drops that post only, never the article (#100 review).
  const risky=['링크 https://x.example 포함','MANUAL_VERIFIED 상태','researchId 노출','sample marker 글'].map((title,index)=>({title,url:`https://motusnova.blogspot.com/2026/11/r${index}.html`,label:'',published:''}));
  assert.equal(relatedPosts(risky),'');
  assert.match(relatedPosts([...risky,{title:'S&P 500 상승',url:'https://motusnova.blogspot.com/2026/11/ok.html',label:'미국증시',published:'2026-11-05'}]),/ok\.html/);
});

test('US title names the biggest index move when all three agree (owner 2026-11-07, #97 P2)', async () => {
  const {usIndexPhrase}=await import('../src/operations/market-deep-collect.js');
  assert.equal(usIndexPhrase([{name:'S&P 500',value:-3.1},{name:'나스닥',value:-5.52},{name:'다우',value:-1.9}]),'3대 지수 하락·나스닥 5.5% 급락');
  assert.equal(usIndexPhrase([{name:'S&P 500',value:1.52},{name:'나스닥',value:2.41},{name:'다우',value:0.84}]),'3대 지수 상승·나스닥 2.4% 상승');
  assert.equal(usIndexPhrase([{name:'S&P 500',value:0.3},{name:'나스닥',value:0.6},{name:'다우',value:0.1}]),'3대 지수 상승');
  assert.equal(usIndexPhrase([{name:'S&P 500',value:0.3},{name:'나스닥',value:-0.6},{name:'다우',value:0.1}]),'3대 지수 혼조');
  assert.equal(usIndexPhrase([{name:'',value:-2},{name:'',value:-3},{name:'',value:-1}]),'3대 지수 하락');
});

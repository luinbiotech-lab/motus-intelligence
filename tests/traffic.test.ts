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

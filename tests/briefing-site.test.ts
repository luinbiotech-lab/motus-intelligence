import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEveningMarkdown,renderDayPage,manifest,sitemap,dayPath} from '../src/reports/briefing-site.js';

const md=`# 네이버 블로그 올리기 — 2026-11-17

**제목** (복사)

11월 16일 증시 브리핑: 코스피 마감, 3.59% 급락해 5,100.50

**태그** (복사)

#오늘의증시 #코스피마감

**대표 이미지** (저장 후 첨부): https://raw.githubusercontent.com/x/hero.png

**본문** (아래 전체 복사)

\`\`\`text
11월 16일 장 마감 기준으로 정리했다.

1. 국내증시 — 코스피 마감, 3.59% 급락해 5,100.50
· 지수: KOSPI 5,100.5, KOSDAQ 665.65.
· 검색 1위 SK하이닉스 -6.99%.
→ 전체 분석: https://motusnova.blogspot.com/2026/11/a.html

※ 투자 권유가 아니다.
\`\`\`
`;

test('the evening summary becomes a session-dated briefing page', () => {
  const day=parseEveningMarkdown(md,'2026-11-17');
  assert.equal(day.sessionDate,'2026-11-16');assert.equal(day.items.length,1);
  assert.equal(day.items[0]!.articleUrl,'https://motusnova.blogspot.com/2026/11/a.html');
  assert.deepEqual(day.tags,['오늘의증시','코스피마감']);
  assert.equal(dayPath(day),'d/2026-11-16.html');
  const html=renderDayPage(day,'https://h.example/m/','/m/');
  assert.match(html,/<link rel="canonical" href="https:\/\/h.example\/m\/d\/2026-11-16.html">/);
  assert.match(html,/<link rel="manifest" href="\/m\/manifest.webmanifest">/);
  assert.match(html,/var\(--down\)">-6.99%/);
  assert.doesNotMatch(html,/<script>alert/);
});

test('a December session read in a January operation folder keeps its own year', () => {
  const day=parseEveningMarkdown(md.replace('11월 16일 증시','12월 31일 증시'),'2027-01-04');
  assert.equal(day.sessionDate,'2026-12-31');
});

test('an unparseable summary is refused instead of publishing an empty page', () => {
  assert.throws(()=>parseEveningMarkdown('# empty','2026-11-17'),/BRIEFING_SUMMARY_UNPARSEABLE/);
});

test('manifest and sitemap are scoped to the site path', () => {
  const m=JSON.parse(manifest('/m/'));assert.equal(m.start_url,'/m/');assert.equal(m.display,'standalone');
  assert.match(sitemap([parseEveningMarkdown(md,'2026-11-17')],'https://h.example/m/'),/<loc>https:\/\/h.example\/m\/d\/2026-11-16.html<\/loc>/);
});

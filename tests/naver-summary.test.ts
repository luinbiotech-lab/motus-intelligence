import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNaverSummary,extractArticleFacts} from '../src/reports/naver-summary.js';

const row=(n:number,text:string)=>`<p style="margin:0"><span style="color:#a8822e">${n}</span><span>${text}</span></p>`;
const html=`<div data-section="key-points" style="x"><div>오늘의 핵심</div>${row(1,'지수: KOSPI 5,239.13, KOSDAQ 667.61.')}${row(2,'수급: 개인 -13,821, 외국인 <b style="color:#c62828">+4,177</b>.')}${row(3,'x')}</div><section><ul><li>뉴스 목록</li></ul></section><p>MOTUS 정리: 증권사 5곳의 리포트를 대조하면 FOMC가 공통 배경이다.</p>`;
test('facts are taken from the key points and the MOTUS synthesis only', ()=>{
  const facts=extractArticleFacts(html);
  assert.deepEqual(facts.keyPoints,['지수: KOSPI 5,239.13, KOSDAQ 667.61.','수급: 개인 -13,821, 외국인 +4,177.']);
  assert.equal(facts.synthesis,'증권사 5곳의 리포트를 대조하면 FOMC가 공통 배경이다.');
});
test('summary has its own title, links each full article, tags and a disclaimer', ()=>{
  const s=buildNaverSummary('2026-11-11',[
    {category:'us',title:'11월 10일 뉴욕증시 마감, 3대 지수 하락…엔비디아 5.5% 급락',url:'https://motusnova.blogspot.com/2026/11/u.html',keyPoints:['지수: S&P 500 -0.38%.'],checkpoint:'미국 10년물 금리 확인',heroImageUrl:null},
    {category:'korea',title:'11월 10일 코스피 마감, 4.39% 급등해 5,239.13…검색 1위 삼성전자 5.0% 급등',url:'https://motusnova.blogspot.com/2026/11/k.html',keyPoints:['지수: KOSPI 5,239.13.'],topStock:'삼성전자',heroImageUrl:'https://raw.githubusercontent.com/x/hero.png'}]);
  assert.equal(s.title,'11월 10일 증시 브리핑: 코스피 마감, 4.39% 급등해 5,239.13, 엔비디아 5.5% 급락');
  // Owner 2026-11-12: the title and intro name the session the articles (and the hero image) cover, not the run date.
  assert.ok(s.body.startsWith('11월 10일 장 마감 기준으로'));
  assert.ok(s.body.indexOf('1. 국내증시')<s.body.indexOf('2. 뉴욕증시'));
  assert.match(s.body,/전체 분석: https:\/\/motusnova\.blogspot\.com\/2026\/11\/k\.html/);
  assert.match(s.body,/투자 권유가 아닙니다/);
  assert.ok(s.tags.includes('삼성전자')&&s.tags.length<=15);
  assert.equal(s.imageUrl,'https://raw.githubusercontent.com/x/hero.png');
  assert.match(s.markdown,/```text\n/);
});
test('no published category is an error, not an empty post', ()=>{assert.throws(()=>buildNaverSummary('2026-11-11',[]))});

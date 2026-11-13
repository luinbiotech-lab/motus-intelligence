import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNaverSummary,extractArticleFacts,politeEndings,selectEveningParts,phoneText,type PublishedCandidate} from '../src/reports/naver-summary.js';

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
  assert.match(s.body,/투자 권유가 아니다/);
  assert.deepEqual(politeEndings(s.body),[]);
  assert.ok(s.tags.includes('삼성전자')&&s.tags.length<=15);
  assert.equal(s.imageUrl,'https://raw.githubusercontent.com/x/hero.png');
  assert.match(s.markdown,/```text\n/);
});
test('no published category is an error, not an empty post', ()=>{assert.throws(()=>buildNaverSummary('2026-11-11',[]))});

// Owner 2026-11-13: '정리했습니다' in the intro, '했다' in the body. One plain style from the first line to the last.
test('the summary is plain style throughout; a politely written sourced line is left out', ()=>{
  const s=buildNaverSummary('2026-11-13',[
    {category:'korea',title:'11월 12일 코스피 마감, 0.61% 하락 5,342.73…검색 1위 삼성전자 1.0% 상승',url:'https://motusnova.blogspot.com/2026/11/k.html',keyPoints:['지수: KOSPI 5,342.73.','외국인이 순매수했습니다.'],synthesis:'검색 상위 6종목 가운데 1종목이 올랐다.',checkpoint:'환율을 확인하세요',heroImageUrl:null}]);
  assert.deepEqual(politeEndings(s.body),[]);
  assert.doesNotMatch(s.body,/순매수했습니다|확인하세요/);
  assert.match(s.body,/정리했다\./);
  // A synthesis that is MOTUS's own count is not labelled as the brokers' view.
  assert.match(s.body,/· MOTUS 정리: 검색 상위/);
  assert.deepEqual(politeEndings('정리했습니다. 투자 권유가 아닙니다. 확인하세요. 아니다. 했다.'),['습니다','세요']);
});

const unit=(category:'korea'|'us'|'ai',operationDate:string,registeredAt:string,title:string):PublishedCandidate=>({category,operationDate,registeredAt,title,url:`https://motusnova.blogspot.com/2026/11/${category}-${operationDate}.html`,keyPoints:['지수: 기준 수치 1.00%.'],heroImageUrl:null});
// Owner 2026-11-13: the summary arrived near noon the next day. It is prepared right after the Korea close article.
test('the evening post is the newest Korea close plus the U.S./AI articles already public before it', ()=>{
  const units=[
    unit('korea','2026-11-13','2026-11-12T17:13:41+09:00','11월 12일 코스피 마감, 0.61% 하락 5,342.73…검색 1위 삼성전자 1.0% 상승'),
    unit('korea','2026-11-12','2026-11-11T17:20:00+09:00','11월 11일 코스피 마감, 2.60% 급등 5,375.36…검색 1위 삼성전자 4.6% 상승'),
    unit('us','2026-11-12','2026-11-12T08:42:09+09:00','11월 11일 뉴욕증시 마감, 3대 지수 상승·나스닥 1.6% 상승…오라클 8.8% 급등'),
    unit('us','2026-11-13','2026-11-13T08:41:00+09:00','11월 12일 뉴욕증시 마감, 3대 지수 하락…AMD 5.9% 급등'),
    unit('us','2026-11-10','2026-11-10T08:40:00+09:00','11월 9일 뉴욕증시 마감, 3대 지수 상승…x 1% 상승'),
    unit('ai','2026-11-12','2026-11-12T12:39:59+09:00','구글이 공개한 Gemini 신규 기능, 마이크로소프트 움직임까지 읽기')];
  const selected=selectEveningParts(units)!;
  assert.equal(selected.anchor.operationDate,'2026-11-13');
  assert.deepEqual(selected.parts.map(part=>part.category+':'+part.operationDate),['korea:2026-11-13','us:2026-11-12','ai:2026-11-12']);
  // Published the next morning, the 11/12 U.S. close waits for the next evening: a handed-over post never changes.
  assert.deepEqual(selectEveningParts(units.filter(part=>part.operationDate!=='2026-11-12'||part.category==='korea'))!.parts.map(part=>part.category),['korea']);
  const s=buildNaverSummary(selected.anchor.operationDate,selected.parts);
  assert.ok(s.title.startsWith('11월 12일 증시 브리핑'));
  assert.ok(s.body.startsWith('11월 12일 국내 장 마감과 직전 뉴욕증시(11월 11일 마감)'));
  assert.match(s.body,/2\. 뉴욕증시\(11월 11일 마감\) — /);
  const text=phoneText(s);
  assert.ok(text.startsWith('[제목]\n11월 12일 증시 브리핑')&&text.includes('\n[태그]\n#오늘의증시')&&text.includes('\n[본문]\n11월 12일'));
  assert.equal(selectEveningParts(units.filter(part=>part.category!=='korea')),null);
});

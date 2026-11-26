import test from 'node:test';
import assert from 'node:assert/strict';
import {composeKoreaMoverComment} from '../src/operations/market-deep-sections.js';
import type {BrokerResearchBundle} from '../src/operations/broker-briefs.js';
import {createFirstSplitDailyProductionRun} from '../src/intelligence/split-daily-production.js';
import type {KoreaMarketDailyViewModel} from '../src/intelligence/daily-masters.js';
import {renderKoreaEditorialArticle} from '../src/publishers/editorial-article.js';

// MO-22 (#97 11/18·11/19·11/23·11/24): '주요 종목 흐름' printed +30% movers with no reason.
// The broker line is the 11/23 유진투자증권 comment as the 11/24 AI article quoted it.
const yujin='2)코스닥 상대 선방 & 비(非)데이터센터 테마로 매수 이동. 로봇(휴림로봇 上·로보티즈)은 2027 CES 기대에 강세. 화장품(에이피알·뷰티스킨)은 블프 효과(아마존 뷰티 Top100 내 에이피알 제품 수 2배 가까이 증가) & 한중 관계 개선 기대에 상승.';
const bundle={briefs:[{report:{kind:'DAILY',date:'2026-11-23',title:'美 반도체 -11%에 연이틀 매도 사이드카 & AI 테마로 선방한 코스닥',broker:'유진투자증권',analysts:'',url:'https://example.com/yujin',summary:[],targetPrice:null,rating:null,stockCode:null,company:null},statements:[{region:'KOREA',text:yujin}],digests:[]}],company:[]} as unknown as BrokerResearchBundle;
const wire=[{publisher:'연합뉴스',title:'[특징주] 현대오토에버, 로봇 사업 기대에 상한가',url:'https://example.com/w1',publishedAt:'2026-11-24T06:42:00Z',sentence:null,feed:'x'}];

test('a mover named in a broker line is quoted with only the sentence that names it', ()=>{
  const section=composeKoreaMoverComment({movers:[{name:'에이피알',changePct:8.7}],bundle})!;
  assert.equal(section.key,'korea-movers-comment');
  assert.equal(section.paragraphs.length,1);
  const text=section.paragraphs[0]!.text;
  assert.ok(text.startsWith('에이피알(+8.70%) 관련 증권가 시각: 유진투자증권은 11월 23일 「'),text);
  assert.match(text,/“화장품\(에이피알·뷰티스킨\)은 블프 효과/);
  assert.doesNotMatch(text,/로봇|데이터센터/,'only the sentence naming the stock is quoted');
  assert.equal(section.paragraphs[0]!.source?.url,'https://example.com/yujin');
});

test('a wire headline names the stock: publisher, date and KST time are cited; others are 원인 미확인', ()=>{
  const section=composeKoreaMoverComment({movers:[{name:'깨끗한나라우',changePct:30},{name:'현대오토에버',changePct:29.93},{name:'롯데에너지머티리얼즈',changePct:18.01}],bundle:null,wire})!;
  const texts=section.paragraphs.map(p=>p.text);
  assert.equal(texts.length,2);
  assert.equal(texts[0],'현대오토에버(+29.93%) 관련 통신 보도: 연합뉴스는 11월 24일 15:42 「[특징주] 현대오토에버, 로봇 사업 기대에 상한가」에서 “[특징주] 현대오토에버, 로봇 사업 기대에 상한가”라고 전했다.');
  assert.equal(texts[1],'종목 등락 배경: 깨끗한나라우(+30.00%)·롯데에너지머티리얼즈(+18.01%)의 등락 이유를 직접 설명한 증권사 리포트·통신 기사 문장은 수집되지 않았다(원인 미확인).');
});

test('a name inside a longer name does not count (현대차 ≠ 현대차증권), so no reason is borrowed', ()=>{
  const section=composeKoreaMoverComment({movers:[{name:'현대차',changePct:-3.1}],bundle:null,wire:[{publisher:'뉴시스',title:'현대차증권, 자사주 소각',url:'https://example.com/w2',publishedAt:'2026-11-24T07:00:00Z',sentence:'현대차증권이 자사주를 소각한다.',feed:'x'}]})!;
  assert.deepEqual(section.paragraphs.map(p=>p.text),['종목 등락 배경: 현대차(-3.10%)의 등락 이유를 직접 설명한 증권사 리포트·통신 기사 문장은 수집되지 않았다(원인 미확인).']);
  assert.equal(composeKoreaMoverComment({movers:[],bundle})??null,null);
});

test('the mover reasons print once, inside the 주요 종목 흐름 section', ()=>{
  const unit=createFirstSplitDailyProductionRun().units.find(item=>item.category==='KOREA_MARKET')!;
  const view=structuredClone(unit.viewModel) as KoreaMarketDailyViewModel;
  const name=view.movers[0]!.label;
  view.deepSections=[...(view.deepSections??[]),composeKoreaMoverComment({movers:[{name,changePct:5}],bundle:null})!];
  const html=renderKoreaEditorialArticle(view).html;
  const at=html.indexOf('data-section="korea-movers"');
  assert.ok(at>=0);
  const section=html.slice(at,html.indexOf('</section>',at)).replace(/<[^>]+>/g,'');
  assert.match(section,/원인 미확인/);
  assert.equal((html.replace(/<[^>]+>/g,'').match(/종목 등락 배경:/g)??[]).length,1);
  assert.doesNotMatch(html,/data-section="korea-movers-comment"/);
});

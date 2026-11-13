import test from 'node:test';
import assert from 'node:assert/strict';
import {composeKoreaFxFlowComment} from '../src/operations/market-deep-sections.js';

// 2026-11-13 Korea close: KOSPI -0.98%, USD/KRW 1,337.8, flows 개인 +194 / 외국인 -5,527 / 기관 +23.
const flows=[{label:'개인',value:194},{label:'외국인',value:-5527},{label:'기관',value:23}];
test('FX and flows are read with numbers, a cause or "unconfirmed", a labelled reading and watch levels', ()=>{
  const [fx,flow]=composeKoreaFxFlowComment({fx:{value:1337.8,change:3.2},flows,kospiChangePct:-0.98,bundle:null});
  assert.equal(fx!.key,'korea-fx-comment');
  assert.deepEqual(fx!.paragraphs.map(p=>p.text),[
    '원·달러 환율은 기사 작성 시점 1,337.8원으로 전일보다 3.2원(0.24%) 올랐다(원화 약세).',
    '환율 배경: 이날 환율이 3.2원 오른 이유를 직접 설명한 증권사 리포트·통신 기사 문장은 수집되지 않았다(원인 미확인).',
    'MOTUS 해석(추정): 외국인이 순매도(외국인 -5,527)한 날 원화가 약해져, 외국인 주식 수급과 환율이 같은 방향으로 움직였다.',
    '다음 거래일 관전 포인트(전망 아님): 환율이 1,340원을 넘어서는지(2.2원 위), 1,330원 아래로 내려가는지(7.8원 아래)가 확인 지점이다.']);
  assert.equal(flow!.key,'korea-flow-comment');
  assert.deepEqual(flow!.paragraphs.map(p=>p.text),[
    '투자자별로는 외국인의 순매도(-5,527) 규모가 가장 컸고, 개인(+194)·기관(+23)은 순매수했다.',
    'MOTUS 해석(추정): 코스피가 0.98% 내린 날 외국인은 순매도(-5,527)해, 지수 방향과 외국인 수급이 같았다.']);
});
test('a wire sentence about the won is quoted; an opposite move is read as another driver', ()=>{
  const [fx]=composeKoreaFxFlowComment({fx:{value:1330,change:-4},flows,kospiChangePct:-0.98,bundle:null,wire:[{publisher:'연합인포맥스',title:'[서환-마감] 원·달러 하락',url:'https://example.com/w',publishedAt:'2026-11-13T07:00:00Z',sentence:'원·달러 환율은 달러 약세에 4원 내렸다.',feed:'x'}]});
  const texts=fx!.paragraphs.map(p=>p.text);
  assert.ok(texts[1]!.startsWith('환율 배경(통신 보도): 연합인포맥스는 11월 13일 「[서환-마감] 원·달러 하락」에서 “원·달러 환율은 달러 약세에 4원 내렸다”'),texts[1]);
  assert.match(texts[2]!,/외국인 순매도\(외국인 -5,527\)와 달리 원화가 강해져/);
  assert.equal(texts[3],'다음 거래일 관전 포인트(전망 아님): 환율이 1,330원선 위를 지키는지가 확인 지점이다.');
});

import {createFirstSplitDailyProductionRun} from '../src/intelligence/split-daily-production.js';
import type {KoreaMarketDailyViewModel} from '../src/intelligence/daily-masters.js';
import {renderKoreaEditorialArticle} from '../src/publishers/editorial-article.js';
test('the FX reading prints under the index/FX tiles and the flow reading under the flow chart, once each', ()=>{
  const unit=createFirstSplitDailyProductionRun().units.find(item=>item.category==='KOREA_MARKET')!;
  const view=structuredClone(unit.viewModel) as KoreaMarketDailyViewModel;
  view.deepSections=[...(view.deepSections??[]),...composeKoreaFxFlowComment({fx:{value:1337.8,change:3.2},flows,kospiChangePct:-0.98,bundle:null})];
  const html=renderKoreaEditorialArticle(view).html,text=(key:string)=>{const at=html.indexOf(`data-section="${key}"`);return at<0?'':html.slice(at,html.indexOf('</section>',at)).replace(/<[^>]+>/g,'')};
  assert.match(text('korea-indexes'),/전일보다 3\.2원\(0\.24%\) 올랐다/);
  assert.match(text('korea-flows'),/지수 방향과 외국인 수급이 같았다/);
  const plain=html.replace(/<[^>]+>/g,'');
  assert.equal((plain.match(/환율 배경:/g)??[]).length,1);
  assert.doesNotMatch(plain,/읽어 보세요/);
});

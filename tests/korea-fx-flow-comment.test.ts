import test from 'node:test';
import assert from 'node:assert/strict';
import {composeKoreaFxFlowComment} from '../src/operations/market-deep-sections.js';

// 2026-11-13 Korea close: KOSPI -0.98%, USD/KRW 1,337.8, flows 개인 +194 / 외국인 -5,527 / 기관 +23.
const flows=[{label:'개인',value:194},{label:'외국인',value:-5527},{label:'기관',value:23}];
test('FX and flows are read with numbers, a cause or "unconfirmed", a labelled reading and watch levels', ()=>{
  const [fx,flow]=composeKoreaFxFlowComment({fx:{value:1337.8,change:3.2},flows,kospiChangePct:-0.98,bundle:null});
  assert.equal(fx!.key,'korea-fx-comment');
  assert.deepEqual(fx!.paragraphs.map(p=>p.text),[
    '원·달러 환율은 기사 작성 시점 전날보다 3.2원(0.24%) 오른 1,337.8원을 나타냈다(원화 약세).',
    '외국인이 주식을 5천527억원어치 순매도한 가운데 원화도 약세를 보였다.',
    '다음 거래일에는 환율이 1,340원을 넘어서는지, 1,330원 아래로 내려가는지가 관심사다.']);
  assert.equal(flow!.key,'korea-flow-comment');
  assert.deepEqual(flow!.paragraphs.map(p=>p.text),[
    '유가증권시장에서 외국인이 5천527억원어치를 순매도했고, 개인과 기관은 각각 194억원, 23억원어치를 순매수했다.',
    '코스피는 외국인 매도세 속에 0.98% 내렸다.']);
});
test('a wire sentence about the won is quoted; an opposite move is read as another driver', ()=>{
  const [fx]=composeKoreaFxFlowComment({fx:{value:1330,change:-4},flows,kospiChangePct:-0.98,bundle:null,wire:[{publisher:'연합인포맥스',title:'[서환-마감] 원·달러 하락',url:'https://example.com/w',publishedAt:'2026-11-13T07:00:00Z',sentence:'원·달러 환율은 달러 약세에 4원 내렸다.',feed:'x'}]});
  const texts=fx!.paragraphs.map(p=>p.text);
  assert.equal(texts[1],'연합인포맥스는 환율 흐름에 대해 “원·달러 환율은 달러 약세에 4원 내렸다”고 전했다.');
  assert.match(texts[2]!,/순매도했는데도 원화는 강세를 보여/);
  assert.equal(texts[3],'다음 거래일에는 환율이 1,330원선을 지키는지가 관심사다.');
});

import {createFirstSplitDailyProductionRun} from '../src/intelligence/split-daily-production.js';
import type {KoreaMarketDailyViewModel} from '../src/intelligence/daily-masters.js';
import {renderKoreaEditorialArticle} from '../src/publishers/editorial-article.js';
test('the FX reading prints under the index/FX tiles and the flow reading under the flow chart, once each', ()=>{
  const unit=createFirstSplitDailyProductionRun().units.find(item=>item.category==='KOREA_MARKET')!;
  const view=structuredClone(unit.viewModel) as KoreaMarketDailyViewModel;
  view.deepSections=[...(view.deepSections??[]),...composeKoreaFxFlowComment({fx:{value:1337.8,change:3.2},flows,kospiChangePct:-0.98,bundle:null})];
  const html=renderKoreaEditorialArticle(view).html,text=(key:string)=>{const at=html.indexOf(`data-section="${key}"`);return at<0?'':html.slice(at,html.indexOf('</section>',at)).replace(/<[^>]+>/g,'')};
  assert.match(text('korea-indexes'),/전날보다 3\.2원\(0\.24%\) 오른/);
  assert.match(text('korea-flows'),/코스피는 외국인 매도세 속에/);
  const plain=html.replace(/<[^>]+>/g,'');
  assert.equal((plain.match(/1,340원을 넘어서는지/g)??[]).length,1);
  assert.doesNotMatch(plain,/MOTUS 해석|전망 아님|원인 미확인|수집되지 않았다/);
  assert.doesNotMatch(plain,/읽어 보세요/);
});

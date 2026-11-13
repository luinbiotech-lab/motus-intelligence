import test from 'node:test';
import assert from 'node:assert/strict';
import {composeRatesComment} from '../src/operations/market-deep-sections.js';
import type {BrokerResearchBundle} from '../src/operations/broker-briefs.js';

// 20 sessions ending 2026-11-12: 4.80% … 4.88, 4.98, 5.10 (owner screenshot 2026-11-13: '5.10% +12bp').
const dates=['10-15','10-16','10-19','10-20','10-21','10-22','10-23','10-26','10-27','10-28','10-29','10-30','11-02','11-03','11-04','11-05','11-06','11-09','11-10','11-11','11-12'];
const values=[4.80,4.82,4.81,4.79,4.83,4.85,4.84,4.86,4.85,4.83,4.84,4.86,4.85,4.87,4.86,4.84,4.85,4.86,4.88,4.98,5.10];
const points=dates.map((d,i)=>({date:'2026-'+d,value:values[i]!}));
const report={kind:'economy',date:'2026-11-13',title:'11/13 Weekly Macro',broker:'키움증권',analysts:'',url:'https://example.com/kiwoom.pdf',summary:['미국 10월 소매판매 둔화는 미 국채금리의 추가 상승 압력을 제한하는 요인으로 작용할 것으로 보인다.'],targetPrice:null,rating:null,stockCode:null,company:null} as unknown as BrokerResearchBundle['economy'][number];
const bundle:BrokerResearchBundle={briefs:[{report:{...report,kind:'morning',broker:'SK증권',title:'SK증권 아침에 슥',url:'https://example.com/sk.pdf',summary:[]} as never,statements:[],digests:[],events:[{region:'US',text:'미국: 생산자물가지수, 윌리엄스 연은 총재 연설'},{region:'US',text:'미국: 주택착공'}]}],company:[],industry:[],economy:[report],audit:[]};
const indexes=[{name:'S&P 500',changePct:-0.35},{name:'나스닥',changePct:-0.39},{name:'다우',changePct:-0.36}];

test('the rate comment reads the move against the prior session, a week and 20 sessions, with a sourced cause', ()=>{
  const section=composeRatesComment({points,sessionDate:'2026-11-12',indexes,bundle})!;
  assert.equal(section.key,'us-rates-comment');
  const [fact,cause,reading,next]=section.paragraphs.map(p=>p.text);
  assert.equal(fact,'미국 10년물 국채금리는 11월 12일 5.10%로 전 거래일(11월 11일 4.98%)보다 12bp 올랐다. 5거래일 전(11월 5일 4.84%)과 비교하면 +26bp이다. 최근 20거래일 범위 4.79%~5.10%에서 최고치다. 5거래일 연속 상승이다.');
  assert.match(cause!,/^금리 관련 증권가 시각: .*「11\/13 Weekly Macro」에서 “미국 10월 소매판매 둔화는 미 국채금리의/);
  assert.equal(section.paragraphs[1]!.source?.url,'https://example.com/kiwoom.pdf');
  assert.match(reading!,/^MOTUS 해석\(추정\): 금리가 \+12bp 오른 날 지수가 내렸다\(나스닥 -0\.39%, S&P 500 -0\.35%\)/);
  assert.equal(next,'다음 거래일 관전 포인트(전망 아님): 10년물이 5.25%를 넘어서는지(15bp 위), 5.00% 아래로 되돌아오는지(10bp 아래)가 1차 확인 지점이다. 금리에 영향을 줄 예정 일정: 미국: 생산자물가지수, 윌리엄스 연은 총재 연설(SK증권 집계).');
  // Owner rule: no sentence without a number or a named source.
  for(const p of section.paragraphs)assert.ok(/\d/.test(p.text)||p.source,p.text);
});

test('without a source that explains the move it says so, and a stale value is labelled with its own date', ()=>{
  const section=composeRatesComment({points:points.slice(0,-1),sessionDate:'2026-11-12',indexes,bundle:null})!;
  const texts=section.paragraphs.map(p=>p.text);
  assert.match(texts[0]!,/11월 11일 4\.98%로 전 거래일\(11월 10일 4\.88%\)보다 10bp 올랐다\. 이 값은 11월 11일 고시분으로, 11월 12일 정규장 값은 아직 고시되지 않았다\./);
  assert.ok(texts.includes('금리 배경: 이날 10년물 금리가 10bp 올랐는데 그 이유를 직접 설명한 증권사 리포트·통신 기사 문장은 수집되지 않았다(원인 미확인).'));
  // The index reading is only made when the yield is from the same session.
  assert.ok(!texts.some(text=>text.startsWith('MOTUS 해석')));
});

test('a small move is not read as the driver; a wire sentence about rates is quoted when no broker explains it', ()=>{
  const flat=[...points.slice(0,-1),{date:'2026-11-12',value:5.00}];
  const section=composeRatesComment({points:flat,sessionDate:'2026-11-12',indexes:[{name:'나스닥',changePct:1.6}],bundle:null,wire:[{publisher:'연합뉴스',title:'뉴욕증시, 국채금리 안정에 상승',url:'https://example.com/yna',publishedAt:'2026-11-12T21:30:00Z',sentence:'국채금리가 안정되며 기술주가 올랐다.',feed:'x'}]})!;
  const texts=section.paragraphs.map(p=>p.text);
  assert.ok(texts.some(text=>text.startsWith('금리 배경(통신 보도): 연합뉴스는 11월 13일 「뉴욕증시, 국채금리 안정에 상승」에서 “국채금리가 안정되며 기술주가 올랐다”라고 전했다.')),texts.join('\n'));
  assert.ok(texts.includes('MOTUS 해석(추정): 금리 변동이 +2bp로 작아 이날 지수 등락(나스닥 +1.60%)의 주된 변수로 보기는 어렵다.'));
  assert.match(texts.at(-1)!,/10년물이 5\.00%선 위를 지키는지가 1차 확인 지점이다\.$/);
});

import {createFirstSplitDailyProductionRun} from '../src/intelligence/split-daily-production.js';
import type {USMarketDailyViewModel} from '../src/intelligence/daily-masters.js';
import {renderUSEditorialArticle} from '../src/publishers/editorial-article.js';
test('the rate comment is printed inside the 금리·달러·변동성 section, under the tile, once', ()=>{
  const unit=createFirstSplitDailyProductionRun().units.find(item=>item.category==='US_MARKET')!;
  const view=structuredClone(unit.viewModel) as USMarketDailyViewModel;
  assert.ok(view.supportingMetrics.length);
  view.deepSections=[...(view.deepSections??[]),composeRatesComment({points,sessionDate:'2026-11-12',indexes,bundle})!];
  const html=renderUSEditorialArticle(view).html,macro=html.indexOf('data-section="us-macro"'),next=html.indexOf('data-section=',macro+20);
  assert.ok(macro>0);
  const section=html.slice(macro,html.indexOf('</section>',macro)).replace(/<[^>]+>/g,'');
  assert.match(section,/전 거래일\(11월 11일 4\.98%\)보다/);
  assert.match(section,/MOTUS 해석\(추정\)/);
  assert.match(section,/관전 포인트\(전망 아님\)/);
  assert.equal((html.replace(/<[^>]+>/g,'').match(/5거래일 전\(11월 5일/g)??[]).length,1);
});

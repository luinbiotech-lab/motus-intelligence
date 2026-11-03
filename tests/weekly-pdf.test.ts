import test from 'node:test';
import assert from 'node:assert/strict';
import {barChart,biggestDay,buildWeeklyPdfHtml,lineChart,seriesWeekChange} from '../src/reports/weekly-pdf.js';
import {checkPdf} from '../src/reports/pdf-render.js';
import {buildWeeklyArticle,parseForexFactory,weekWindow,type WeeklyEvidence,type WeeklyQuote} from '../src/operations/weekly-review.js';

const q=(label:string,group:WeeklyQuote['group'],closes:number[],unit:WeeklyQuote['unit']='index',symbol=label):WeeklyQuote=>{const days=['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30'];const prior=closes[0]!,daily=closes.slice(1).map((close,index)=>({date:days[index]!,close}));const last=daily.at(-1)!.close;return {symbol,label,group,unit,weekClose:last,weekCloseDate:'2026-10-30',priorClose:prior,priorCloseDate:'2026-10-23',changePct:(last/prior-1)*100,changeBp:unit==='yield'?Math.round((last-prior)*100):null,daily}};
const series=(start:number,end:number)=>Array.from({length:60},(_,index)=>({date:new Date(Date.UTC(2026,7,3)+index*86400000*1.45).toISOString().slice(0,10),close:start+(end-start)*index/59})).filter(point=>point.date<='2026-10-30');
function evidence():WeeklyEvidence {
  return {window:weekWindow('2026-11-01'),collectedAt:'2026-11-01T11:40:00Z',audit:[],posts:[],calendarCoversNextWeek:true,
    quotes:[q('S&P 500','US_INDEX',[100,101,102,101,100,99.4]),q('나스닥','US_INDEX',[100,101,102,103,101.6,98]),q('다우존스','US_INDEX',[100,100,100,100,100,99.2]),q('코스피','KOREA_INDEX',[100,98.5,101.5,108.2,106.9,103.3]),q('코스닥','KOREA_INDEX',[100,97,99,102,100,96.4]),q('미국 10년물 국채금리','MACRO',[4.99,4.99,4.99,5.05,4.99,4.93],'yield'),q('원·달러 환율','MACRO',[1326,1322,1325,1327,1340,1338],'fx'),
      q('알파벳','US_STOCK',[100,101,100,99,96,87.4],'price','GOOGL'),q('테슬라','US_STOCK',[100,101,103,104,106,107.4],'price','TSLA'),q('애플','US_STOCK',[100,100,100,100,100,101],'price','AAPL'),q('메타','US_STOCK',[100,99,99,98,97,95.7],'price','META'),
      q('SK하이닉스','KOREA_STOCK',[100,101,106,112,110,111],'price','000660.KS'),q('기아','KOREA_STOCK',[100,98,95,93,91,89.4],'price','000270.KS'),q('삼성전자','KOREA_STOCK',[100,101,103,105,104,104.4],'price','005930.KS'),q('NAVER','KOREA_STOCK',[100,100,99,98,97,96],'price','035420.KS')],
    broker:[{broker:'유안타증권',title:'[주식시황 위클리] 주간:知',date:'2026-10-30',url:'https://stock.pstatic.net/a.pdf',sentence:'반도체, IT하드웨어, 보험, 증권 업종 상승. 조선, 미디어, 기계 업종 하락',kind:'review'},{broker:'키움증권',title:'10/30 Weekly Macro',date:'2026-10-30',url:'https://stock.pstatic.net/b.pdf',sentence:'다음 주 금융시장은 미국 중간선거와 주요 고용 및 경기지표 발표를 앞두고 변동성이 확대될 것으로 예상된다.',kind:'outlook'}],
    calendar:parseForexFactory([{title:'Congressional Elections',country:'USD',date:'2026-11-03T10:16:00-05:00',impact:'High',forecast:'',previous:''},{title:'Non-Farm Employment Change',country:'USD',date:'2026-11-06T08:30:00-05:00',impact:'High',forecast:'63K',previous:'29K'}],weekWindow('2026-11-01')).events,
    charts:{'^GSPC':series(7400,7580),'^IXIC':series(25000,25437),'^KS11':series(5500,5730),'^KQ11':series(700,724),'^TNX':series(4.6,4.93),'KRW=X':series(1420,1338),XLK:[{date:'2026-10-23',close:183.23},{date:'2026-10-30',close:179.51}],XLV:[{date:'2026-10-23',close:179.28},{date:'2026-10-30',close:184.87}]},
    flows:{date:'2026-10-30',foreign:-16149,institution:7540,individual:6028,url:'https://m.stock.naver.com/api/index/KOSPI/trend'}};
}

test('the weekly PDF states measured facts, with Korean particles, charts and the next-week calendar', () => {
  const ev=evidence(),pdf=buildWeeklyPdfHtml(ev,buildWeeklyArticle(ev),'2026-11-01');
  assert.equal(pdf.fileName,'MOTUS_Weekly_2026-10-26_2026-10-30.pdf');
  assert.equal((pdf.html.match(/class=page>/g)??[]).length,3);
  assert.match(pdf.html,/나스닥 주간 2\.0% 하락,<br>코스피 3\.3% 상승/);
  assert.match(pdf.html,/테슬라가 <b[^>]*>\+7\.40%<\/b>로 가장 강했고 알파벳이 <b[^>]*>-12\.60%<\/b>로 가장 약했다/);
  assert.match(pdf.html,/나스닥의 하루 최대 변동은 금요일 <b[^>]*>-3\.54%/);
  assert.match(pdf.html,/주중 최고 5\.05%를 거쳐 <b>4\.93%<\/b>\(-6bp\)/);
  assert.match(pdf.html,/외국인<\/td><td class=r style="color:#1f5fbf"><b>-16,149/);
  assert.match(pdf.html,/11\/6\(금\) 22:30/);assert.match(pdf.html,/1\. 미국 중간선거/);
  assert.match(pdf.html,/<svg/);assert.doesNotMatch(pdf.html,/undefined|NaN|Infinity/);
});

test('chart and change helpers', () => {
  assert.equal(seriesWeekChange([{date:'2026-10-23',close:100},{date:'2026-10-30',close:97}],'2026-10-26','2026-10-30')!.toFixed(2),'-3.00');
  assert.equal(seriesWeekChange([{date:'2026-10-30',close:97}],'2026-10-26','2026-10-30'),null);
  assert.deepEqual(biggestDay(evidence().quotes.find(item=>item.label==='코스피')!)?.date,'2026-10-28');
  assert.equal(lineChart([{date:'2026-10-30',close:1}],'2026-10-26','#000'),'','one point draws no chart');
  assert.match(barChart([['기술',-2.03],['헬스케어',3.12]]),/헬스케어[\s\S]*기술/);
  assert.equal(checkPdf(new TextEncoder().encode('not a pdf'),3).ok,false);
});

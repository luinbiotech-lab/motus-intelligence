import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWeeklyArticle,headlineEvents,isWeeklyMarketReport,joinEvents,koreanEventName,parseForexFactory,parseMotusFeed,pickBrokerSentences,sparkCloses,summarySentences,weekWindow,weeklyQuote,type WeeklyEvidence,type WeeklyQuote} from '../src/operations/weekly-review.js';
import {renderWeeklyEditorialArticle} from '../src/publishers/editorial-article.js';

test('a weekend or weekday run reviews the last completed Monday-Friday week', () => {
  assert.deepEqual(weekWindow('2026-11-01'),{runDate:'2026-11-01',weekStart:'2026-10-26',weekEnd:'2026-10-30',nextStart:'2026-11-02',nextEnd:'2026-11-06'});
  assert.equal(weekWindow('2026-10-31').weekStart,'2026-10-26');
  // Monday's final attempt still reviews the week that just ended, not the one starting.
  assert.equal(weekWindow('2026-11-02').weekStart,'2026-10-26');
  assert.equal(weekWindow('2026-11-04').weekStart,'2026-10-26');
});

const ny=(date:string)=>Date.parse(date+'T13:30:00Z')/1000;
test('weekly change is the week\'s last close against the last close before Monday, by exchange date', () => {
  const series={symbol:'^GSPC',response:[{meta:{exchangeTimezoneName:'America/New_York',regularMarketPrice:105,regularMarketTime:Date.parse('2026-10-30T20:00:00Z')/1000},timestamp:['2026-10-22','2026-10-23','2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30'].map(ny),indicators:{quote:[{close:[99,100,101,102,103,104,null]}]}}]};
  const closes=sparkCloses(series);
  assert.equal(closes.at(-1)!.close,105,'a null final weekend close takes that session\'s regular-market price');
  const quote=weeklyQuote({symbol:'^GSPC',label:'S&P 500',group:'US_INDEX',unit:'index'},closes,weekWindow('2026-11-01'))!;
  assert.equal(quote.priorCloseDate,'2026-10-23');assert.equal(quote.weekCloseDate,'2026-10-30');
  assert.equal(quote.changePct.toFixed(2),'5.00');assert.equal(quote.daily.length,5);
  // A week without its last sessions is not reported as a weekly result.
  assert.equal(weeklyQuote({symbol:'^GSPC',label:'S&P 500',group:'US_INDEX',unit:'index'},closes.slice(0,4),weekWindow('2026-11-01')),null);
  const yieldQuote=weeklyQuote({symbol:'^TNX',label:'미국 10년물 국채금리',group:'MACRO',unit:'yield'},[{date:'2026-10-23',close:4.98},{date:'2026-10-29',close:4.97},{date:'2026-10-30',close:4.93}],weekWindow('2026-11-01'))!;
  assert.equal(yieldQuote.changeBp,-5);
});

test('only weekly market, strategy and macro notes are used', () => {
  for(const title of ['[주식시황 위클리] 주간:知 - KOSPI 정상화 진행 중, 다르긴 다릅니다 (11월 1주)','THE GLOBAL 주간 증시 전략','[다음주 시장은?] 트럼프, Macro 변수를 주목할 때','10/30 Weekly Macro : 주요 이벤트 집중, 금융시장 향방에 주목'])assert.equal(isWeeklyMarketReport({title}),true,title);
  for(const title of ['Shinhan China Weekly(10월 5주차)','Global 헬스케어 Weekly(10월 5주차)','Kiwoom ETF Weekly (10/26)','[펀드 플로우 Weekly] 신흥국 주식형 펀드','[2027년 주식시장 전망과 전략] 이익이 변하면, 주도주도 변한다','Japan Weekly(10월 5주차)','10/26 Commodity Weekly','마켓레이더 - 믿음의 균열 (10월 30일)'])assert.equal(isWeeklyMarketReport({title}),false,title);
});

test('broker summaries give one review and one outlook sentence, never a fragment or another date range', () => {
  const html='<p><strong>주간 주식시장 Review</strong></p><p>- 주간(10/13~10/29) KOSPI, KOSDAQ 각각 +7.33%,-1.4% 등락. 급락분의 절반 정도 반등</p><p>- 반도체, IT하드웨어, 보험, 증권 업종 상승. 조선, 미디어, 기계 업종 하락</p>';
  const sentences=summarySentences(html);
  assert.deepEqual(pickBrokerSentences(sentences),{review:'반도체, IT하드웨어, 보험, 증권 업종 상승. 조선, 미디어, 기계 업종 하락',outlook:null});
  const macro='<p>다음 주 금융시장은 미국 중간선거와 주요 고용 및 경기지표 발표를 앞두고 변동성이 확대될 것으로 예상된다. 10 월 FOMC 에서 연준이 기준금리를 동결하고 인플레이션 경계감을 유지했다.</p>';
  const pick=pickBrokerSentences(summarySentences(macro));
  assert.equal(pick.outlook,'다음 주 금융시장은 미국 중간선거와 주요 고용 및 경기지표 발표를 앞두고 변동성이 확대될 것으로 예상된다.');
});

test('the economic calendar is kept only once it is on next week, in KST, with Korean names', () => {
  const window=weekWindow('2026-11-01');
  const lastWeek=[{title:'CB Consumer Confidence',country:'USD',date:'2026-10-27T10:00:00-04:00',impact:'Medium',forecast:'81.2',previous:'81.9'}];
  assert.equal(parseForexFactory(lastWeek,window).coversNextWeek,false);
  const feed=[
    {title:'ISM Manufacturing PMI',country:'USD',date:'2026-11-02T10:00:00-05:00',impact:'High',forecast:'49.5',previous:'49.1'},
    {title:'German Trade Balance',country:'EUR',date:'2026-11-02T02:00:00-05:00',impact:'Low',forecast:'',previous:''},
    {title:'Non-Farm Employment Change',country:'USD',date:'2026-11-06T08:30:00-05:00',impact:'High',forecast:'120K',previous:'98K'},
    {title:'Unemployment Rate',country:'USD',date:'2026-11-06T08:30:00-05:00',impact:'High',forecast:'4.4%',previous:'4.4%'},
    {title:'Caixin Services PMI',country:'CNY',date:'2026-11-04T20:45:00-05:00',impact:'Medium',forecast:'',previous:''},
  ];
  const {events,coversNextWeek}=parseForexFactory(feed,window);
  assert.equal(coversNextWeek,true);
  assert.deepEqual(events.map(item=>item.koreanTitle),['ISM 제조업 PMI','비농업 고용','실업률'],'low-impact and non-U.S. medium-impact releases are left out');
  assert.equal(events[1]!.kstLabel,'11월 6일(금) 22:30');
  assert.deepEqual(headlineEvents(events),['미국 ISM 지수','미국 고용보고서']);
  assert.equal(joinEvents(headlineEvents(events)),'미국 ISM 지수와 고용보고서');
  assert.deepEqual(koreanEventName('Core CPI m/m'),{name:'근원 소비자물가(CPI)',group:'CPI'});
  assert.deepEqual(koreanEventName('10-y Bond Auction'),{name:'10년물 국채 입찰',group:null});
});

test('the week\'s own MOTUS daily articles are linked; the weekly itself is not', () => {
  const entry=(title:string,published:string,url:string,term:string)=>({title:{$t:title},published:{$t:published},link:[{rel:'alternate',href:url}],category:[{term}]});
  const posts=parseMotusFeed({feed:{entry:[entry('뉴욕증시 3대 지수 하락…인텔 29% 급락','2026-10-31T09:22:42+09:00','https://motusnova.blogspot.com/2026/10/286-10-3.html','미국증시'),entry('[주간 증시] 지난주','2026-10-25T20:40:00+09:00','https://motusnova.blogspot.com/2026/10/w.html','주간 증시'),entry('코스피 반등','2026-10-26T06:30:00+09:00','https://motusnova.blogspot.com/2026/10/k.html','국내증시'),entry('오래된 글','2026-10-20T06:30:00+09:00','https://motusnova.blogspot.com/2026/10/o.html','국내증시')]}},weekWindow('2026-11-01'));
  assert.deepEqual(posts.map(item=>[item.title,item.category]),[['코스피 반등','KOREA_MARKET'],['뉴욕증시 3대 지수 하락…인텔 29% 급락','US_MARKET']]);
});

const q=(label:string,group:WeeklyQuote['group'],changePct:number,weekClose:number,unit:WeeklyQuote['unit']='index',symbol=label):WeeklyQuote=>({symbol,label,group,unit,weekClose,weekCloseDate:'2026-10-30',priorClose:weekClose/(1+changePct/100),priorCloseDate:'2026-10-23',changePct,changeBp:unit==='yield'?-5:null,daily:[{date:'2026-10-29',close:weekClose*0.99},{date:'2026-10-30',close:weekClose}]});
function evidence(overrides:Partial<WeeklyEvidence>={}):WeeklyEvidence {
  return {window:weekWindow('2026-11-01'),collectedAt:'2026-11-01T11:40:00Z',audit:[],posts:[],
    quotes:[q('S&P 500','US_INDEX',-1.2,6700),q('나스닥','US_INDEX',-2.1,22500),q('다우존스','US_INDEX',-0.4,46000),q('코스피','KOREA_INDEX',3.2,5730.74),q('코스닥','KOREA_INDEX',-1.1,880),q('미국 10년물 국채금리','MACRO',-1,4.93,'yield'),q('원·달러 환율','MACRO',-0.5,1395.2,'fx'),
      q('엔비디아','US_STOCK',4,190,'price','NVDA'),q('인텔','US_STOCK',-25,24,'price','INTC'),q('애플','US_STOCK',1,260,'price','AAPL'),q('AMD','US_STOCK',-9,210,'price','AMD')],
    broker:[{broker:'유안타증권',title:'[주식시황 위클리] 주간:知',date:'2026-10-30',url:'https://stock.pstatic.net/stock-research/market/18/a.pdf',sentence:'반도체, IT하드웨어, 보험, 증권 업종 상승. 조선, 미디어, 기계 업종 하락',kind:'review'},
      {broker:'키움증권',title:'10/30 Weekly Macro',date:'2026-10-30',url:'https://stock.pstatic.net/stock-research/economy/39/b.pdf',sentence:'다음 주 금융시장은 미국 중간선거와 주요 고용 및 경기지표 발표를 앞두고 변동성이 확대될 것으로 예상된다.',kind:'outlook'}],
    calendar:parseForexFactory([{title:'ISM Manufacturing PMI',country:'USD',date:'2026-11-02T10:00:00-05:00',impact:'High',forecast:'49.5',previous:'49.1'},{title:'Non-Farm Employment Change',country:'USD',date:'2026-11-06T08:30:00-05:00',impact:'High',forecast:'120K',previous:'98K'}],weekWindow('2026-11-01')).events,calendarCoversNextWeek:true,...overrides};
}

test('the weekly article states only collected numbers, quotes brokers by name and previews next week', () => {
  const article=buildWeeklyArticle(evidence());
  assert.equal(article.readiness,'READY');
  assert.equal(article.title,'[주간 증시] 나스닥 주간 2.1% 하락·코스피 3.2% 상승…다음 주 미국 ISM 지수·고용보고서 주목');
  assert.match(article.lead,/S&P 500 -1\.20%, 나스닥 -2\.10%, 다우존스 -0\.40%/);
  assert.match(article.lead,/미국 10년물 국채금리는 4\.93%로 한 주 사이 5bp 내렸다\./);
  assert.match(article.lead,/다음 주\(11월 2~6일\)에는 미국 ISM 지수와 고용보고서가 예정돼 있다\./);
  const html=renderWeeklyEditorialArticle(article).html;
  assert.match(html,/유안타증권은 10월 30일 「\[주식시황 위클리\] 주간:知」에서 “반도체, IT하드웨어, 보험, 증권 업종 상승\. 조선, 미디어, 기계 업종 하락”이라고 진단했다\./);
  assert.match(html,/11월 6일\(금\) 22:30/);assert.match(html,/인텔\(INTC\)/);
  assert.match(html,/<table/);assert.doesNotMatch(html,/undefined|NaN/);
});

test('a week without next week\'s calendar waits unless it is the final attempt, and missing indexes always hold', () => {
  const early=buildWeeklyArticle(evidence({calendar:[],calendarCoversNextWeek:false}));
  assert.equal(early.readiness,'HOLD');assert.ok(early.reasons.includes('WEEKLY_CALENDAR_NOT_ON_NEXT_WEEK'));
  const final=buildWeeklyArticle(evidence({calendar:[],calendarCoversNextWeek:false}),{requireCalendar:false});
  assert.equal(final.readiness,'READY','broker outlook alone previews next week on the final attempt');
  assert.match(final.title,/다음 주 증시 일정$/);
  const noKorea=buildWeeklyArticle(evidence({quotes:evidence().quotes.filter(item=>item.group!=='KOREA_INDEX')}),{requireCalendar:false});
  assert.ok(noKorea.reasons.includes('WEEKLY_KOREA_INDEX_MISSING'));
  const nothingAhead=buildWeeklyArticle(evidence({calendar:[],calendarCoversNextWeek:false,broker:evidence().broker.filter(item=>item.kind==='review')}),{requireCalendar:false});
  assert.ok(nothingAhead.reasons.includes('WEEKLY_NEXT_WEEK_EVIDENCE_MISSING'));
});

test('review fixes: a missing final bar is dropped, Sunday-evening Asia releases count as next week, tiny moves are not 0.0%', async () => {
  const {completeWeek}=await import('../src/operations/weekly-review.js');
  const late={...q('엔비디아','US_STOCK',4,190,'price','NVDA')},gap={...q('인텔','US_STOCK',-2,24,'price','INTC'),weekCloseDate:'2026-10-29'},holidayKr={...q('코스피','KOREA_INDEX',1,5000),weekCloseDate:'2026-10-29'};
  assert.deepEqual(completeWeek([late,gap,holidayKr]).map(item=>item.label),['엔비디아','코스피'],'a provider gap is dropped; a market-wide holiday is kept');
  const window=weekWindow('2026-11-01');
  const {events}=parseForexFactory([{title:'Caixin Manufacturing PMI',country:'CNY',date:'2026-11-01T20:45:00-05:00',impact:'High',forecast:'',previous:''},{title:'ISM Manufacturing PMI',country:'USD',date:'2026-11-02T10:00:00-05:00',impact:'High',forecast:'',previous:''}],window);
  assert.deepEqual(events.map(item=>item.kstLabel),['11월 2일(월) 10:45','11월 3일(화) 00:00']);
  const flat=buildWeeklyArticle(evidence({quotes:evidence().quotes.map(item=>item.label==='나스닥'?{...item,changePct:-2.1}:item.label==='코스피'?{...item,changePct:0.03}:item)}));
  assert.match(flat.title,/코스피 0\.03% 상승/);
});

test('the U.S. election and key U.S. releases lead next week; untranslated foreign lines are dropped', () => {
  const {events}=parseForexFactory([
    {title:'ISM Manufacturing PMI',country:'USD',date:'2026-11-02T10:00:00-05:00',impact:'Medium',forecast:'54.7',previous:'54.5'},
    {title:'Congressional Elections',country:'USD',date:'2026-11-03T10:16:00-05:00',impact:'High',forecast:'',previous:''},
    {title:'Official Bank Rate',country:'GBP',date:'2026-11-05T07:00:00-05:00',impact:'High',forecast:'4.00%',previous:'3.75%'},
    {title:'Some Obscure Index',country:'GBP',date:'2026-11-05T07:00:00-05:00',impact:'High',forecast:'',previous:''},
    {title:'Non-Farm Employment Change',country:'USD',date:'2026-11-06T08:30:00-05:00',impact:'High',forecast:'63K',previous:'29K'},
  ],weekWindow('2026-11-01'));
  assert.deepEqual(events.map(item=>item.koreanTitle),['ISM 제조업 PMI','중간선거(상·하원 선거)','영란은행 기준금리 결정','비농업 고용']);
  assert.equal(events[1]!.kstLabel,'11월 3일(화) (미국 현지)');
  assert.deepEqual(headlineEvents(events),['미국 중간선거','미국 고용보고서']);
  const article=buildWeeklyArticle(evidence({calendar:events}));
  assert.match(article.title,/…다음 주 미국 중간선거·고용보고서 주목$/);
  assert.match(article.lead,/미국 중간선거와 고용보고서가 예정돼 있다\./);
});

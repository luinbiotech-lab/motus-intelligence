import test from 'node:test';
import assert from 'node:assert/strict';
import {composeKoreaDeepSections,composeUSDeepSections} from '../src/operations/market-deep-sections.js';
import type {BrokerReport,BrokerResearchBundle} from '../src/operations/broker-briefs.js';

const report=(broker:string,title:string,kind:BrokerReport['kind']='MARKET',extra:Partial<BrokerReport>={}):BrokerReport=>({kind,date:'2026-10-30',title,broker,analysts:'',url:`https://stock.pstatic.net/stock-research/x/${encodeURIComponent(broker+title)}.pdf`,summary:[],targetPrice:null,rating:null,stockCode:null,company:null,...extra});
const korea:BrokerResearchBundle={briefs:[{report:report('K증권','10/29 K증권 장마감코멘트'),statements:[
  {region:'KOREA',text:'코스피와 코스닥은 전일 급등에 따른 차익실현 매물 출회로 하락 마감',heading:null},
  {region:'KOREA',text:'한편 Vertiv(+16.5%) 호실적에 AI 수요 재확인됐고 Oracle(+10.7%)의 신용 우려 진정',heading:null},
  {region:'KOREA',text:'한수원과 대우건설-두산에너빌리티 컨소시엄의 체코 원전 시공계약 협상 결렬에 원전주 약세',heading:null},
],digests:[{heading:'상승한 반면 알파벳은 시장 예상치를 하회한 실적과 잉여현금흐름 악화에 급락',bullets:['국내 증시는 SK하이닉스가 상대적으로 견조한 흐름을 보이며 지수 낙폭 제한'],analyst:null}]}],
  company:[report('H증권','수주와 실적은 좋아지고 있다','COMPANY',{stockCode:'034020',company:'두산에너빌리티',rating:'Buy',targetPrice:'100,000'}),report('L증권','체코 원전 시공협상 결렬 Comment','COMPANY',{stockCode:'047040',company:'대우건설',rating:'Buy',targetPrice:'16,000'}),report('M증권','무관한 종목 리포트','COMPANY',{stockCode:'090430',company:'아모레퍼시픽',rating:'Buy',targetPrice:'180,000'})],industry:[report('I증권','스마트글래스: 새로운 일상의 시작','INDUSTRY')],economy:[],audit:[]};

test('a searched stock gets the broker sentence that explains its move, and the rating separately', () => {
  const composed=composeKoreaDeepSections({bundle:korea,searchTop:[{rank:5,name:'두산에너빌리티',code:'034020',close:56700,changePct:-7.65,date:'2026-10-29',url:'https://m.stock.naver.com/api/stock/034020/price'}],checkpoint:'체크.'});
  const stocks=composed.sections.find(item=>item.key==='korea-stocks')!.paragraphs;
  assert.match(stocks[0]!.text,/^검색 5위 두산에너빌리티는 56,700원으로 7\.65% 급락했다\. K증권은 10월 30일 「10\/29 K증권 장마감코멘트」에서 “한수원과 대우건설-두산에너빌리티 컨소시엄의 체코 원전 시공계약 협상 결렬에 원전주 약세”라고 짚었다\.$/);
  assert.match(stocks[1]!.text,/^H증권은 10월 30일 「수주와 실적은 좋아지고 있다」 리포트에서 투자의견 Buy, 목표주가 100,000원을 제시했다\.$/);
  assert.notEqual(stocks[0]!.source!.url,stocks[1]!.source!.url);
  const text=composed.sections.flatMap(section=>section.paragraphs.map(p=>p.text)).join('\n');
  assert.doesNotMatch(text,/Oracle|Vertiv/,'U.S. lines never explain the Korean session');
  assert.doesNotMatch(text,/상승한 반면 알파벳은/,'a wrapped sentence fragment is not a report heading');
  assert.match(text,/대우건설: L증권/,'a company named in the session commentary keeps its rating');
  assert.doesNotMatch(text,/아모레퍼시픽|스마트글래스/,'unrelated ratings and industry titles are not padding');
});

test('a broker sentence is quoted under one U.S. stock only', () => {
  const us:BrokerResearchBundle={briefs:[{report:report('K증권','10/30 모닝코멘트'),statements:[{region:'US',text:'FOMC 동결 속 연준 의장 발언에 지수 상승 마감',heading:null},{region:'US',text:'아마존과 인텔은 실적 예상 하회에 시간외 급락 중',heading:null}],digests:[]}],company:[],industry:[],economy:[],audit:[]};
  const stock=(symbol:string,koreanName:string,rank:number)=>({symbol,name:symbol,koreanName,changePct:-4,close:10,date:'2026-10-29',trendingRank:rank,mostActiveRank:null,marketCap:null});
  const composed=composeUSDeepSections({bundle:us,stocks:[stock('AMZN','아마존',1),stock('INTC','인텔',2)],sectors:[]});
  const text=composed.sections.flatMap(section=>section.paragraphs.map(p=>p.text)).join('\n');
  assert.equal(text.split('아마존과 인텔은 실적 예상 하회에').length-1,1,text);
});

test('a megacap big mover leads the U.S. stock list and the headline', () => {
  const stock=(symbol:string,koreanName:string,changePct:number,extra:object={})=>({symbol,name:symbol,koreanName,changePct,close:10,date:'2026-10-29',trendingRank:null,mostActiveRank:null,marketCap:null,...extra});
  const composed=composeUSDeepSections({bundle:null,stocks:[stock('AMZN','아마존',-4.25,{trendingRank:1}),stock('GOOGL','알파벳',-12.64,{bigMover:true,mostActiveRank:1})],sectors:[]});
  const market=composed.sections.find(item=>item.key==='us-sectors-stocks')!.paragraphs;
  assert.match(market[0]!.text,/^알파벳\(GOOGL\)은 10\.00달러로 12\.64% 급락했다\(시가총액 상위 종목, 대형주 거래량 1위\)\.$/);
  assert.equal(composed.titleFocus,'알파벳 13% 급락');
});

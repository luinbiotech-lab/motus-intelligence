import test from 'node:test';
import assert from 'node:assert/strict';
import {composeUSDeepSections,koreaLinkParagraphs} from '../src/operations/market-deep-sections.js';
import type {BrokerBrief,BrokerReport,BrokerResearchBundle} from '../src/operations/broker-briefs.js';

// MO-23: the U.S. close article quotes a named broker's morning line that links the session to the Korean market.
const report=(broker:string,title:string,date='2026-11-25'):BrokerReport=>({kind:'MARKET',date,title,broker,analysts:'',url:`https://stock.pstatic.net/stock-research/x/${encodeURIComponent(broker+title)}.pdf`,summary:[],targetPrice:null,rating:null,stockCode:null,company:null});
const bundle=(briefs:BrokerBrief[]):BrokerResearchBundle=>({briefs,company:[],industry:[],economy:[],audit:[]});
const stock={symbol:'NVDA',name:'NVIDIA',koreanName:'엔비디아',changePct:-5.86,close:180,date:'2026-11-24',trendingRank:1,mostActiveRank:null,marketCap:null};

test('a morning Korea outlook line becomes the 국내 시장 연결 paragraph in the U.S. risks section', () => {
  const composed=composeUSDeepSections({bundle:bundle([{report:report('K증권','Morning Snapshot'),statements:[{region:'US',text:'기술주 차익실현 매물에 나스닥 하락 마감',heading:null}],digests:[],outlooks:[{region:'KOREA',text:'금일 국내 증시는 엔비디아 약세 영향에 반도체 중심 약보합 출발 예상',heading:null}]}]),stocks:[stock],sectors:[],checkpoint:'다음 확인 지표.'});
  const risks=composed.sections.find(item=>item.key==='us-risks')!;
  assert.equal(risks.title,'위험 요인과 다음 확인 지표','no new section: the paragraph sits in the existing watch section');
  assert.equal(risks.paragraphs[0]!.text,'국내 시장 연결(증권사 아침 리포트 인용, MOTUS 전망 아님): K증권은 11월 25일 「Morning Snapshot」에서 “금일 국내 증시는 엔비디아 약세 영향에 반도체 중심 약보합 출발 예상”이라고 짚었다.');
  assert.equal(risks.paragraphs[0]!.source!.url,report('K증권','Morning Snapshot').url);
  assert.ok(composed.sources.some(item=>item.publisher==='K증권'),'the quoted report is listed in the sources');
  assert.ok(risks.paragraphs.some(p=>p.text==='다음 확인 지표.'),'the checkpoint stays');
});

test('no linking line means no paragraph and no invented connection', () => {
  const composed=composeUSDeepSections({bundle:bundle([{report:report('K증권','Morning Snapshot'),statements:[{region:'US',text:'기술주 차익실현 매물에 나스닥 하락 마감',heading:null},{region:'KOREA',text:'코스피는 외국인 순매수에 2.1% 상승 마감',heading:null}],digests:[]}]),stocks:[stock],sectors:[],checkpoint:'다음 확인 지표.'});
  const text=composed.sections.flatMap(section=>section.paragraphs.map(p=>p.text)).join('\n');
  assert.doesNotMatch(text,/국내 시장 연결/,'a past Korean close is not a link to today');
});

test('evening close comments are skipped, one line per broker, at most two', () => {
  const briefs:BrokerBrief[]=[
    {report:report('Y증권','AI 미국 주식시장 마감 시황','2026-11-24'),statements:[],digests:[],outlooks:[{region:'KOREA',text:'금일 코스피는 반도체 강세로 상승 출발했다는 점에 주목',heading:null}]},
    {report:report('K증권','Morning Snapshot'),statements:[],digests:[],outlooks:[{region:'KOREA',text:'금일 국내 증시는 반도체 중심 약세 출발 예상',heading:null},{region:'KOREA',text:'원/달러 환율은 1,470원대 등락 예상',heading:null}]},
    {report:report('S증권','모닝 브리프'),statements:[{region:'KOREA',text:'야간선물 하락을 감안하면 외국인 수급 부담 지속 전망',heading:null}],digests:[]},
    {report:report('H증권','Daily Brief'),statements:[],digests:[],outlooks:[{region:'KOREA',text:'오늘 국내 증시는 미 기술주 약세 영향 예상',heading:null}]},
  ];
  const paragraphs=koreaLinkParagraphs(briefs);
  assert.equal(paragraphs.length,2);
  assert.match(paragraphs[0]!.text,/K증권은 11월 25일 「Morning Snapshot」에서 “금일 국내 증시는 반도체 중심 약세 출발 예상”이라고/);
  assert.match(paragraphs[1]!.text,/S증권은 .*야간선물 하락/);
  assert.doesNotMatch(paragraphs.map(p=>p.text).join('\n'),/마감 시황|1,470원대|H증권/);
});

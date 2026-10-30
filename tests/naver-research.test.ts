import test from 'node:test';
import assert from 'node:assert/strict';
import {collectBrokerResearch} from '../src/operations/broker-briefs.js';
import {isMarketComment,reportKey,summaryAsBullets,titleDates} from '../src/operations/naver-research.js';
import {composeKoreaDeepSections,composeUSDeepSections} from '../src/operations/market-deep-sections.js';
import {wireFallbackAllowed} from '../src/operations/market-deep-collect.js';

// Synthetic fixtures in the shape of the Naver Pay Securities research API (list and detail).
const API='https://m.stock.naver.com/api/research';
const pdf=(id:number)=>`https://stock.pstatic.net/stock-research/market/10/2026103${id%2}_market_${id}.pdf`;
const market=[
  {researchId:11,title:'10/30 A증권 리서치 모닝코멘트',brokerName:'A증권',writeDate:'2026-10-30'},
  {researchId:12,title:'10/29 B증권 장마감코멘트',brokerName:'B증권',writeDate:'2026-10-30'},
  {researchId:13,title:'마켓레이더 - 대형주 실망 매물 (10월 29일)',brokerName:'C증권',writeDate:'2026-10-29'},
  {researchId:14,title:'국내주식 마감 시황 (26.10.28) - 앞선 장',brokerName:'D증권',writeDate:'2026-10-29'},
  {researchId:15,title:'D증권 Daily Morning Brief(2026.10.29)',brokerName:'D증권',writeDate:'2026-10-29'},
  {researchId:16,title:'E증권 Global Carbon Market Daily_261030',brokerName:'E증권',writeDate:'2026-10-30'},
];
const detail:Record<number,string>={
  11:'<p>[미국 증시 동향]</p><p>- 대형 기술주가 실적 부진과 현금흐름 악화에 급락하며 시장 전반 약세. AI 투자 수익성 우려 확대</p><p>- 반면, 소프트웨어 대형주는 호실적에 약보합으로 선방하며 낙폭을 제한</p><p>[국내 증시 동향]</p><p>- 코스피는 전날 급등에 따른 차익실현 매물 출회와 기관의 순매도로 하락 마감</p>',
  12:'<p>- 코스피와 코스닥은 전일 급등에 따른 차익실현 매물 출회로 하락 전환하며 오전 낙폭 확대, 오후 들어 일부 만회</p><p>- 미 증시는 반도체주 강세에 3대 지수 모두 3거래일 연속 상승 마감하며 투자심리 개선</p>',
  13:'<p>코스피는 대형주 실적 발표 이후 쏟아진 실망 매물에 하락했습니다. 금일 국내 증시는 하락 출발할 전망입니다.</p>',
  14:'<p>- 코스피는 반도체 대형주 강세에 힘입어 사상 최고치를 경신하며 상승 마감</p>',
  15:'<p>- 미국증시, FOMC 기준금리 동결과 완화적 발언에 3대 지수 상승 마감</p>',
  16:'<p>- 국제유가 6주 만에 최고가 기록하며 배출권 시장 주목</p>',
};
const company=[{researchId:91,title:'실적은 좋지만, 환원은 아쉽다',brokerName:'A증권',writeDate:'2026-10-30',itemCode:'005930',itemName:'삼성전자'},{researchId:92,title:'다른 종목 리포트',brokerName:'B증권',writeDate:'2026-10-30',itemCode:'000660',itemName:'SK하이닉스'}];
const economy=[{researchId:71,title:'(Macro Snapshot) 미국 성장세 지속',brokerName:'A증권',writeDate:'2026-10-30'}];

function fetcher(fail:Set<string>=new Set()):typeof fetch{
  return (async (input:string|URL|Request)=>{
    const url=String(input);
    if(url.includes('consensus.hankyung.com'))return new Response('down',{status:503});
    if(url.startsWith('https://stock.pstatic.net/'))return new Response('not a pdf',{status:404});
    const list=url.match(/\/api\/research\/(\w+)\?/);
    if(list){if(fail.has(list[1]!))return new Response('x',{status:500});return Response.json(list[1]==='market'?market:list[1]==='company'?company:list[1]==='economy'?economy:[])}
    const one=url.match(/\/api\/research\/(\w+)\/(\d+)$/);
    if(one){const id=Number(one[2]);
      if(one[1]==='company')return Response.json({researchContent:{attachUrl:`https://stock.pstatic.net/stock-research/company/10/20261030_company_${id}.pdf`,content:'<p>요약</p>',opinion:id===91?'매수':'',goalPrice:id===91?'350000':'0'}});
      if(one[1]==='economy')return Response.json({researchContent:{attachUrl:null,content:'<p>미국 성장세는 소비가 이끌며 시장 예상치를 웃돌았다. 연준의 추가 인상 가능성은 여전히 열려 있다.</p>'}});
      return Response.json({researchContent:{attachUrl:pdf(id),content:detail[id]??''}});
    }
    throw new Error('unexpected '+url);
  }) as typeof fetch;
}

test('titles: printed dates and daily market comments', () => {
  assert.deepEqual(titleDates('국내주식 마감 시황 (26.10.28) - 앞선 장',2026),['2026-10-28']);
  assert.deepEqual(titleDates('10/29 B증권 장마감코멘트',2026),['2026-10-29']);
  assert.deepEqual(titleDates('[IBKS Daily] Morning Brief(261030)',2026),['2026-10-30']);
  assert.deepEqual(titleDates('마켓레이더 (10월 29일)',2026),['2026-10-29']);
  assert.deepEqual(titleDates('삼성전자(005930) 실적 리뷰',2026),[]);
  assert.equal(isMarketComment({researchId:1,title:'10/30, 방어와 수비의 중요성',brokerName:'K',writeDate:'2026-10-30'}),true);
  assert.equal(isMarketComment({researchId:1,title:'E증권 Global Carbon Market Daily_261030',brokerName:'E',writeDate:'2026-10-30'}),false);
  assert.equal(isMarketComment({researchId:1,title:'ESG snapshot',brokerName:'E',writeDate:'2026-10-30'}),false);
});

test('prose summaries become one bullet per finished sentence', () => {
  assert.equal(summaryAsBullets('<p>미국 빅테크는 투자 부담이 커졌습니다. 삼성전자는 실망 매물에 하락했습니다.</p>'),'\n- 미국 빅테크는 투자 부담이 커졌습니다.\n- 삼성전자는 실망 매물에 하락했습니다.\n\n');
  assert.equal(summaryAsBullets('<p>- 이미 표시된 줄</p>'),'- 이미 표시된 줄\n');
});

test('one report listed by two aggregators has one key', () => {
  assert.equal(reportKey({broker:'A증권',date:'2026-10-30',title:'삼성전자(005930) 실적은 좋지만, 환원은 아쉽다',stockCode:'005930'}),reportKey({broker:'A증권',date:'2026-10-30',title:'실적은 좋지만,환원은 아쉽다',stockCode:'005930'}));
});

test('Naver research supplies the session briefs when Hankyung has not listed them', async () => {
  const bundle=await collectBrokerResearch({sessionDate:'2026-10-29',operationDate:'2026-10-30',fetcher:fetcher(),pdfText:async()=>null,focusCodes:['005930']});
  const titles=bundle.briefs.map(item=>item.report.title);
  // Morning comment and both closing comments for the 29th; not the 28th close note, the 29th morning brief, or the carbon daily.
  assert.deepEqual(titles,['10/30 A증권 리서치 모닝코멘트','10/29 B증권 장마감코멘트','마켓레이더 - 대형주 실망 매물 (10월 29일)']);
  const closing=bundle.briefs[1]!;
  assert.ok(closing.statements.every(item=>item.region==='KOREA'),'a closing comment carries no U.S. commentary');
  assert.ok(!bundle.briefs[2]!.statements.some(item=>/금일|전망/.test(item.text)),'outlook sentences are not session commentary');
  assert.equal(bundle.briefs[0]!.report.url,pdf(11));
  const samsung=bundle.company.find(item=>item.stockCode==='005930')!;
  assert.equal(samsung.targetPrice,'350,000');assert.equal(samsung.rating,'매수');
  assert.equal(bundle.company.find(item=>item.stockCode==='000660')!.targetPrice,null);
  assert.deepEqual(bundle.economy[0]!.summary,['미국 성장세는 소비가 이끌며 시장 예상치를 웃돌았다.','연준의 추가 인상 가능성은 여전히 열려 있다.']);
  assert.ok(bundle.audit.some(item=>item.sourceId==='consensus:list:market'&&item.status==='FAILED'));
  assert.ok(bundle.audit.some(item=>item.sourceId==='naver-research:list:market'&&item.status==='PASS'));

  const us=composeUSDeepSections({bundle,stocks:[],sectors:[],checkpoint:'다음 확인 지표.'});
  assert.equal(us.hasCoreCommentary,true);
  const usText=us.sections.flatMap(section=>section.paragraphs.map(p=>p.text)).join('\n');
  assert.match(usText,/A증권은 10월 30일 아침 리포트 「10\/30 A증권 리서치 모닝코멘트」에서 “대형 기술주가 실적 부진과 현금흐름 악화에 급락하며 시장 전반 약세/);
  assert.doesNotMatch(usText,/3거래일 연속 상승/,'the previous U.S. night from a Korean closing comment is never quoted');

  const korea=composeKoreaDeepSections({bundle,searchTop:[{rank:1,name:'삼성전자',code:'005930',close:230500,changePct:-4.75,date:'2026-10-29',url:'https://m.stock.naver.com/api/stock/005930/price'}],checkpoint:'다음 확인 지표.'});
  const koreaText=korea.sections.flatMap(section=>section.paragraphs.map(p=>p.text)).join('\n');
  assert.match(koreaText,/B증권은 10월 30일 마감 코멘트 「10\/29 B증권 장마감코멘트」에서 “코스피와 코스닥은/);
  assert.match(koreaText,/검색 1위 삼성전자는 230,500원으로 4\.75% 하락했다\. A증권은 10월 30일 「실적은 좋지만, 환원은 아쉽다」 리포트에서 투자의견 매수, 목표주가 350,000원을 제시했다\./);
});

test('a failed Naver list falls back without throwing', async () => {
  const bundle=await collectBrokerResearch({sessionDate:'2026-10-29',operationDate:'2026-10-30',fetcher:fetcher(new Set(['market','invest','economy','company','industry'])),pdfText:async()=>null});
  assert.equal(bundle.briefs.length,0);
  assert.ok(bundle.audit.some(item=>item.sourceId==='naver-research:list:market'&&item.error==='NAVER_RESEARCH_HTTP_500'));
});

test('wire close reports stand in only from 10:00 KST', () => {
  assert.equal(wireFallbackAllowed('2026-10-29T21:45:00Z'),false);
  assert.equal(wireFallbackAllowed('2026-10-29T23:40:00Z'),false);
  assert.equal(wireFallbackAllowed('2026-10-30T01:40:00Z'),true);
});

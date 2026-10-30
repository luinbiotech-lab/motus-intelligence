import test from 'node:test';
import assert from 'node:assert/strict';
import {collectBrokerResearch,contradictsKospi,extractBriefContent,parseConsensusList} from '../src/operations/broker-briefs.js';
import {collectKoreaSearchTop,collectUSAttention} from '../src/operations/market-attention.js';
import {composeKoreaDeepSections,composeUSDeepSections} from '../src/operations/market-deep-sections.js';
import {deepSection} from '../src/publishers/editorial-article.js';

const brief=[
  '2026. 10. 29',
  '▶ 한국증시',
  '- 대형 반도체 기업 실적과 AI 투자 지속 기대감에 상승. SK하이닉스 3분기 사상',
  '최대 실적 기록했고, 투자심리 강화',
  '[ 국내증시 ]',
  '• KOSPI는 전 거래일 대비 6.6% 상승한 6,012.4P로 마감, KOSDAQ은 3.7% 상승한 771.3P로 마감',
  '• 국내 증시는 SK하이닉스의 사상 최대 실적 발표와 미국 AI 투자심리 회복에 힘입어 상승 마감함',
  '미국',
  '',
  'FOMC 동결 속 연준 의장 인플레 낙관론에 상승 마감',
  'ㆍ 반도체 중심 강세, 장 마감 후 빅테크 실적 엇갈리며 지수 선물 하락 전환',
  '▶ Today\'s Event',
  'ㆍ 미 - FOMC 금리 결정, GDP, 근원 소비지출물가지수',
  '',
  'Fixed Income',
  '10 월 FOMC: 금리 인상 잠시 쉬어가기',
  '- 美 기준금리 4.00% 동결. 인상 주장하는 2인 반대로 만장일치 아님',
  '- 12월 추가 인상 예상. FOMC 회의 횟수 축소',
  '공동락. dongrak.kong@daishin.com',
  '[3Q26 Review] 삼성전기: 3Q 거침없는 이익 증가',
  '- 3Q 영업이익은 6,910억원(+57% qoq)으로 컨센서스 상회, 호실적',
  '- FC BGA, MLCC에서 AI향 매출 증가 및 믹스 효과 확대',
  '박강호. kangho.park@daishin.com',
  '[2027 산업전망] 의류: 각자도생',
  '- [OEM] 27년은 고금리 고물가 전망에 따라 미국 소매 경기에 대한 낙관은 어려운 상황',
  '홍길동. gildong@daishin.com',
].join('\n');

test('brief extraction keeps only verbatim single-line market bullets and titled digests',()=>{
  const {statements,digests}=extractBriefContent(brief);
  const texts=statements.map(item=>`${item.region}:${item.text}`);
  assert.ok(texts.includes('KOREA:KOSPI는 전 거래일 대비 6.6% 상승한 6,012.4P로 마감, KOSDAQ은 3.7% 상승한 771.3P로 마감'));
  assert.ok(texts.includes('US:FOMC 동결 속 연준 의장 인플레 낙관론에 상승 마감'));
  assert.ok(texts.includes('US:美 기준금리 4.00% 동결. 인상 주장하는 2인 반대로 만장일치 아님'));
  assert.ok(!texts.some(item=>item.includes('사상')&&item.includes('대형 반도체')),'a wrapped bullet is never quoted');
  assert.ok(!texts.some(item=>item.includes('최대 실적 기록했고')),'a continuation fragment is never quoted');
  assert.ok(!texts.some(item=>item.includes('Today')||item.includes('근원 소비지출')),'calendar lines are not commentary');
  assert.ok(!texts.some(item=>item.includes('[OEM]')),'industry-report bullets are not market commentary');
  const review=digests.find(item=>item.heading.includes('삼성전기'));
  assert.equal(review?.analyst,'박강호');assert.deepEqual(review?.bullets,['3Q 영업이익은 6,910억원(+57% qoq)으로 컨센서스 상회, 호실적','FC BGA, MLCC에서 AI향 매출 증가 및 믹스 효과 확대']);
});

test('a Korea brief whose KOSPI level contradicts the verified close is treated as another session',()=>{
  const {statements}=extractBriefContent(brief);
  assert.equal(contradictsKospi(statements,6012.44),false);
  assert.equal(contradictsKospi(statements,5638.34),true);
});

const listHtml=`<table><tr><th>작성일</th></tr>
<tr><td class="first txt_number">2026-10-29</td><td class="text_l"><a href="/analysis/downpdf?report_idx=111">HD현대중공업(329180) 피크아웃 우려를 이겨낼 조선사</a><div class="layerPop"><div id="content_111" class="pop01 disNone"><strong>HD현대중공업(329180) 피크아웃 우려를 이겨낼 조선사</strong><ul><li>피크아웃 우려를 이겨낼 조선사</li><li>3Q 영업이익 컨센서스 하회했지만 이익 체력 견조</li></ul></div></div></td><td class="text_r txt_number">610,000</td><td> Buy </td><td>양승윤</td><td>유진투자증권</td><td></td></tr>
<tr><td class="first txt_number">2026-10-29</td><td class="text_l"><a href="/analysis/downpdf?report_idx=222">ibks morning brief</a><div class="layerPop"><div class="pop01"><strong>ibks morning brief</strong><ul><li>ibks morning brief</li></ul></div></div></td><td>리서치센터</td><td>IBK투자증권</td><td></td></tr></table>`;

test('consensus lists are parsed by content: broker, analyst, target, rating, stock code, PDF link',()=>{
  const reports=parseConsensusList(listHtml,'COMPANY');
  assert.equal(reports.length,2);
  assert.deepEqual({...reports[0]!},{kind:'COMPANY',date:'2026-10-29',title:'HD현대중공업(329180) 피크아웃 우려를 이겨낼 조선사',broker:'유진투자증권',analysts:'양승윤',url:'https://consensus.hankyung.com/analysis/downpdf?report_idx=111',summary:['3Q 영업이익 컨센서스 하회했지만 이익 체력 견조'],targetPrice:'610,000',rating:'Buy',stockCode:'329180',company:'HD현대중공업'});
  assert.equal(reports[1]!.broker,'IBK투자증권');assert.equal(reports[1]!.targetPrice,null);assert.equal(reports[1]!.rating,null);
});

function fixtureFetcher(pdfDates:Record<string,string>){
  return (async(input:RequestInfo|URL)=>{const url=String(input);
    if(url.includes('report_type=MK'))return new Response(Object.entries(pdfDates).map(([idx,date])=>`<tr><td>${date}</td><td><a href="/analysis/downpdf?report_idx=${idx}">morning brief</a><div class="layerPop"><div><strong>morning brief</strong></div></div></td><td>리서치센터</td><td>대신증권</td></tr>`).join(''));
    if(url.includes('report_type=CO'))return new Response(listHtml);
    if(url.includes('downpdf'))return new Response(new Uint8Array(Buffer.from('%PDF-1.4 fixture')),{status:200});
    return new Response('<table></table>');
  }) as typeof fetch;
}

test('only the first brief date after the session is used, and the PDF is read through the injected reader',async()=>{
  const read:string[]=[];
  const bundle=await collectBrokerResearch({sessionDate:'2026-10-28',operationDate:'2026-10-29',fetcher:fixtureFetcher({'901':'2026-10-28','902':'2026-10-29'}),pdfText:async()=>{read.push('x');return brief},verifiedKospiClose:6012.44});
  assert.deepEqual(bundle.briefs.map(item=>item.report.url),['https://consensus.hankyung.com/analysis/downpdf?report_idx=902']);
  assert.ok(bundle.briefs[0]!.statements.some(item=>item.region==='KOREA'));
  assert.equal(bundle.company[0]!.stockCode,'329180');
  assert.ok(bundle.audit.every(item=>!/@/.test(String(item.error))));
});

test('Korean brief commentary is dropped when its KOSPI level belongs to another session',async()=>{
  const bundle=await collectBrokerResearch({sessionDate:'2026-10-28',operationDate:'2026-10-29',fetcher:fixtureFetcher({'902':'2026-10-29'}),pdfText:async()=>brief,verifiedKospiClose:5638.34});
  assert.ok(!bundle.briefs[0]!.statements.some(item=>item.region==='KOREA'));
  assert.ok(bundle.briefs[0]!.statements.some(item=>item.region==='US'));
});

test('missing pdftotext or failed downloads never break collection',async()=>{
  const bundle=await collectBrokerResearch({sessionDate:'2026-10-28',operationDate:'2026-10-29',fetcher:fixtureFetcher({'902':'2026-10-29'}),pdfText:async()=>null});
  assert.equal(bundle.briefs.length,0);assert.ok(bundle.audit.some(item=>item.error==='PDF_TEXT_UNAVAILABLE'));
});

test('search ranking uses each stock’s own session close, not the live quote beside the ranking',async()=>{
  const fetcher=(async(input:RequestInfo|URL)=>{const url=String(input);
    if(url.includes('searchTop'))return Response.json({stocks:[{stockName:'삼성전자',itemCode:'005930',stockEndType:'stock',closePrice:'999,999',fluctuationsRatio:'9.99'},{stockName:'KODEX 레버리지',itemCode:'122630',stockEndType:'etf'},{stockName:'삼성전자우',itemCode:'005935',stockEndType:'stock'}]});
    if(url.includes('/stock/005930/price'))return Response.json([{localTradedAt:'2026-10-29',closePrice:'230,500',fluctuationsRatio:'-4.75'},{localTradedAt:'2026-10-28',closePrice:'245,000',fluctuationsRatio:'10.36'}]);
    return new Response('nope',{status:404});
  }) as typeof fetch;
  const result=await collectKoreaSearchTop('2026-10-28',fetcher);
  assert.deepEqual(result.stocks.map(item=>[item.rank,item.name,item.close,item.changePct]),[[1,'삼성전자',245000,10.36]]);
});

test('U.S. attention prices each ticker on the covered session and collapses share classes',async()=>{
  const day=(date:string)=>Date.parse(date+'T20:00:00Z')/1000;
  const spark=(symbol:string,closes:number[])=>({symbol,response:[{meta:{shortName:symbol+' Inc.',exchangeTimezoneName:'America/New_York'},timestamp:[day('2026-10-27'),day('2026-10-28'),day('2026-10-29')],indicators:{quote:[{close:closes}]}}]});
  const fetcher=(async(input:RequestInfo|URL)=>{const url=decodeURIComponent(String(input));
    if(url.includes('/trending/'))return Response.json({finance:{result:[{quotes:[{symbol:'GOOG'},{symbol:'GOOGL'},{symbol:'NOW'}]}]}});
    if(url.includes('screener'))return Response.json({finance:{result:[{quotes:[{symbol:'NVDA',marketCap:5e12,quoteType:'EQUITY'}]}]}});
    if(url.includes('spark')){const symbols=url.split('symbols=')[1]!.split('&')[0]!.split(',');return Response.json({spark:{result:symbols.map(symbol=>spark(symbol,symbol==='GOOG'?[100,110,99]:symbol==='NOW'?[150,150,112]:[100,101,102]))}})}
    return new Response('x',{status:404});
  }) as typeof fetch;
  const result=await collectUSAttention('2026-10-29',fetcher);
  assert.deepEqual(result.stocks.map(item=>item.symbol),['GOOG','NOW','NVDA']);
  assert.equal(result.stocks[0]!.koreanName,'알파벳');assert.ok(Math.abs(result.stocks[0]!.changePct-(-10))<1e-9);
  assert.equal(result.sectors.length,11);
});

test('composed sections quote named brokers with dates and links, and lead with the search-ranked stock',()=>{
  const {statements,digests}=extractBriefContent(brief);
  const report={kind:'MARKET' as const,date:'2026-10-29',title:'morning meeting brief',broker:'대신증권',analysts:'리서치센터',url:'https://consensus.hankyung.com/analysis/downpdf?report_idx=902',summary:[],targetPrice:null,rating:null,stockCode:null,company:null};
  const bundle={briefs:[{report,statements,digests}],company:parseConsensusList(listHtml,'COMPANY'),industry:[],economy:[],audit:[]};
  const korea=composeKoreaDeepSections({bundle,searchTop:[{rank:1,name:'HD현대중공업',code:'329180',close:285500,changePct:-3.81,date:'2026-10-28',url:'https://m.stock.naver.com/api/stock/329180/price?pageSize=5&page=1'}]});
  assert.equal(korea.titleFocus,'검색 1위 HD현대중공업 3.8% 하락');
  const html=korea.sections.map(deepSection).join('');
  assert.match(html,/대신증권 리서치센터는 10월 29일 아침 리포트 「morning meeting brief」에서 “[^”]+”(?:이)?라고 진단했다/);assert.doesNotMatch(html,/MOTUS 정리: /,'a single broker yields no consensus sentence');
  assert.match(html,/검색 1위 HD현대중공업은 285,500원으로 3\.81% 하락했다\. 유진투자증권 양승윤 연구원은 10월 29일 「피크아웃 우려를 이겨낼 조선사」 리포트에서 투자의견 Buy, 목표주가 610,000원을 제시했다/);
  assert.ok(korea.sources.some(item=>item.url.endsWith('report_idx=111')));
  const us=composeUSDeepSections({bundle,stocks:[{symbol:'GOOG',name:'Alphabet',koreanName:'알파벳',changePct:-11.15,close:251.2,date:'2026-10-29',trendingRank:1,mostActiveRank:null,marketCap:3.5e12}],sectors:[]});
  assert.equal(us.titleFocus,'알파벳 11% 급락');
  const usHtml=us.sections.map(deepSection).join('');
  assert.match(usHtml,/“FOMC 동결 속 연준 의장 인플레 낙관론에 상승 마감”/);assert.match(usHtml,/경계 요인도 제시됐다\./);
  assert.match(usHtml,/알파벳\(GOOG\)은 251\.20달러로 11\.15% 급락했다\(야후 파이낸스 검색 1위\)/);
  assert.match(usHtml,/공동락 연구원은 「10 월 FOMC: 금리 인상 잠시 쉬어가기」에서/);
});

test('MOTUS synthesis names themes shared by several brokers and flags divergent views',async()=>{
  const {composeKoreaDeepSections}=await import('../src/operations/market-deep-sections.js');
  const mk=(broker:string,idx:string,texts:string[])=>({report:{kind:'MARKET' as const,date:'2026-10-29',title:'brief',broker,analysts:'리서치센터',url:'https://consensus.hankyung.com/analysis/downpdf?report_idx='+idx,summary:[],targetPrice:null,rating:null,stockCode:null,company:null},statements:texts.map(text=>({region:'KOREA' as const,text,heading:null})),digests:[]});
  const korea=composeKoreaDeepSections({bundle:{briefs:[mk('A증권','1',['반도체 대형주 실적 기대에 코스피 상승 마감']),mk('B증권','2',['SK하이닉스 호실적에 반도체 급등 마감','FOMC 대기 속 경계감 공존']),mk('C증권','3',['원/달러 환율 상승 마감'])],company:[],industry:[],economy:[],audit:[]},searchTop:[]});
  const text=korea.sections.flatMap(section=>section.paragraphs.map(p=>p.text)).join(' ');
  assert.match(text,/MOTUS 정리: 증권사 3곳의 리포트를 대조하면 반도체\(A증권·B증권\)/);
  assert.match(text,/C증권은 환율·달러를 따로 짚었다/);
  assert.match(text,/경계 요인도 제시됐다\. B증권 리서치센터는 “FOMC 대기 속 경계감 공존”이라고 짚었다/);
});

test('a bullet followed by an unmarked line is never quoted, even if its first line looks complete',()=>{
  const {statements}=extractBriefContent(['▶ 미국증시','- 미국 증시는 대형 기술주 실적 기대에 힘입어 상승','했으나 장 후반 매물이 출회되며 하락 마감함','- 달러인덱스는 기준금리 동결에 하락 마감'].join('\n'));
  assert.ok(!statements.some(item=>item.text.includes('힘입어 상승')));
  assert.ok(statements.some(item=>item.text==='달러인덱스는 기준금리 동결에 하락 마감'));
});

test('a bearish session explained with caution words still counts as core commentary',async()=>{
  const {composeUSDeepSections}=await import('../src/operations/market-deep-sections.js');
  const report={kind:'MARKET' as const,date:'2026-10-29',title:'brief',broker:'A증권',analysts:'리서치센터',url:'https://consensus.hankyung.com/analysis/downpdf?report_idx=1',summary:[],targetPrice:null,rating:null,stockCode:null,company:null};
  const us=composeUSDeepSections({bundle:{briefs:[{report,statements:[{region:'US',text:'미국 증시는 인플레이션 우려와 금리 부담에 하락 마감',heading:null}],digests:[]}],company:[],industry:[],economy:[],audit:[]},stocks:[],sectors:[{symbol:'XLK',label:'기술',changePct:1,date:'2026-10-28'},{symbol:'XLF',label:'금융',changePct:0.5,date:'2026-10-28'},{symbol:'XLE',label:'에너지',changePct:0.2,date:'2026-10-28'},{symbol:'XLV',label:'헬스케어',changePct:-0.1,date:'2026-10-28'},{symbol:'XLI',label:'산업재',changePct:-0.3,date:'2026-10-28'},{symbol:'XLU',label:'유틸리티',changePct:-1,date:'2026-10-28'}]});
  assert.equal(us.hasCoreCommentary,true);
  const text=us.sections.flatMap(section=>section.paragraphs.map(p=>p.text)).join(' ');
  assert.match(text,/“미국 증시는 인플레이션 우려와 금리 부담에 하락 마감”이라고 진단했다/);
  assert.match(text,/11종 중 종가가 확인된 6종 가운데 3종이 올랐다/);assert.match(text,/\(확인된 업종 기준\)/);
});

test('the session check compares only the level printed for KOSPI, and the title keeps the collected rank',async()=>{
  const statements=[{region:'KOREA' as const,text:'KOSPI는 6,012.4P로 마감, KOSDAQ은 1,071.3P로 마감',heading:null}];
  assert.equal(contradictsKospi(statements,6012.44),false);
  assert.equal(contradictsKospi([{region:'KOREA',text:'코스피는 전 거래일 대비 2.1% 오른 5,638.3P로 마감',heading:null}],6012.44),true);
  const {composeKoreaDeepSections}=await import('../src/operations/market-deep-sections.js');
  const korea=composeKoreaDeepSections({bundle:null,searchTop:[{rank:2,name:'SK하이닉스',code:'000660',close:1508000,changePct:12.45,date:'2026-10-28',url:'https://m.stock.naver.com/api/stock/000660/price?pageSize=5&page=1'}]});
  assert.equal(korea.titleFocus,'검색 2위 SK하이닉스 12.4% 급등');
});

test('broker commentary is linked to a stock only by a whole ticker token or its Korean name',async()=>{
  const {composeUSDeepSections}=await import('../src/operations/market-deep-sections.js');
  const report={kind:'MARKET' as const,date:'2026-10-29',title:'brief',broker:'A증권',analysts:'리서치센터',url:'https://consensus.hankyung.com/analysis/downpdf?report_idx=1',summary:[],targetPrice:null,rating:null,stockCode:null,company:null};
  const bundle={briefs:[{report,statements:[{region:'US' as const,text:'FOMC 동결 속 연준 의장 인플레 낙관론에 상승 마감',heading:null},{region:'US' as const,text:'오라클이 매출 전망 상향에 급등하며 AI 인프라 우려 완화',heading:null}],digests:[]}],company:[],industry:[],economy:[],audit:[]};
  const stock=(symbol:string,koreanName:string|null)=>({symbol,name:symbol,koreanName,changePct:1,close:10,date:'2026-10-28',trendingRank:1,mostActiveRank:null,marketCap:null});
  const text=(us:{sections:Array<{paragraphs:Array<{text:string}>}>})=>us.sections.flatMap(section=>section.paragraphs.map(p=>p.text)).join(' ');
  assert.doesNotMatch(text(composeUSDeepSections({bundle,stocks:[stock('C','씨티그룹')],sectors:[]})),/씨티그룹\(C\)[\s\S]*설명했다/);
  // The Oracle sentence is already quoted in the cause section, so it is not repeated under the stock.
  const oracle=text(composeUSDeepSections({bundle,stocks:[stock('ORCL','오라클')],sectors:[]}));
  assert.equal(oracle.split('오라클이 매출 전망 상향에').length-1,1,oracle);
  const solo={...bundle,briefs:[{...bundle.briefs[0]!,statements:[bundle.briefs[0]!.statements[0]!,{region:'US' as const,text:'오라클은 클라우드 수주 잔고 확대 발표에 시간외 강세',heading:null}]}]};
  assert.match(text(composeUSDeepSections({bundle:solo,stocks:[stock('ORCL','오라클')],sectors:[]})),/오라클\(ORCL\)[\s\S]*A증권은 “오라클은 클라우드 수주 잔고 확대 발표에 시간외 강세”라고 설명했다/);
});

test('a brief describing another session contributes no Korean market digest either',async()=>{
  const stale=['[ 국내증시 ]','• 코스피는 전 거래일 대비 하락해 5,638.3P로 마감','','Strategy','[퀀틴전시 플랜] 코스피 시황 전략','- 코스피는 전 거래일 대비 하락해 5,638.3P로 마감','- 외국인 순매도 확대','이경민. kyoungmin.lee@daishin.com','[3Q26 Review] 삼성전기: 이익 증가','- 3Q 영업이익은 6,910억원(+57% qoq)으로 컨센서스 상회, 호실적','- FC BGA, MLCC에서 AI향 매출 증가 및 믹스 효과 확대','박강호. kangho.park@daishin.com'].join('\n');
  const bundle=await collectBrokerResearch({sessionDate:'2026-10-28',operationDate:'2026-10-29',fetcher:fixtureFetcher({'902':'2026-10-29'}),pdfText:async()=>stale,verifiedKospiClose:6012.44});
  const brief0=bundle.briefs[0]!;
  assert.ok(!brief0.statements.some(item=>item.region==='KOREA'));
  assert.ok(!brief0.digests.some(item=>/코스피/.test(item.heading)),JSON.stringify(brief0.digests));
  assert.ok(brief0.digests.some(item=>item.heading.includes('삼성전기')),'company reviews are kept');
});

test('an index-move restatement is not core commentary',async()=>{
  const {composeUSDeepSections}=await import('../src/operations/market-deep-sections.js');
  const {statements}=extractBriefContent(['▶ 미국증시','- 미국 증시는 나스닥과 다우지수가 모두 상승 마감함'].join('\n'));
  const report={kind:'MARKET' as const,date:'2026-10-29',title:'brief',broker:'A증권',analysts:'리서치센터',url:'https://consensus.hankyung.com/analysis/downpdf?report_idx=1',summary:[],targetPrice:null,rating:null,stockCode:null,company:null};
  const us=composeUSDeepSections({bundle:{briefs:[{report,statements,digests:[]}],company:[],industry:[],economy:[],audit:[]},stocks:[],sectors:[]});
  assert.equal(statements.length,1);assert.equal(us.hasCoreCommentary,false);
});

test('shared themes are named neutrally so concerns are never reported as optimism',async()=>{
  const {composeUSDeepSections}=await import('../src/operations/market-deep-sections.js');
  const mk=(broker:string,idx:string,text:string)=>({report:{kind:'MARKET' as const,date:'2026-10-29',title:'brief',broker,analysts:'리서치센터',url:'https://consensus.hankyung.com/analysis/downpdf?report_idx='+idx,summary:[],targetPrice:null,rating:null,stockCode:null,company:null},statements:[{region:'US' as const,text,heading:null}],digests:[]});
  const us=composeUSDeepSections({bundle:{briefs:[mk('A증권','1','미국 증시는 AI 투자 거품 우려가 확산되며 하락 마감함'),mk('B증권','2','미국 증시는 AI 투자비 부담에 대형주가 하락 마감함')],company:[],industry:[],economy:[],audit:[]},stocks:[],sectors:[]});
  const text=us.sections.flatMap(section=>section.paragraphs.map(p=>p.text)).join(' ');
  assert.match(text,/AI 투자\(A증권·B증권\)/);assert.doesNotMatch(text,/기대/);
});

test('an unmarked region headline that continues on the next line is not quoted',()=>{
  const {statements}=extractBriefContent(['▶ 미국증시','미국 증시는 대형 기술주 실적 기대에 힘입어 상승','했으나 장 후반 매물이 출회되며 하락 마감함'].join('\n'));
  assert.ok(!statements.some(item=>item.text.includes('힘입어 상승')));
});

test('a stock with a missing session change is skipped, never shown as 0%',async()=>{
  const fetcher=(async(input:RequestInfo|URL)=>{const url=String(input);
    if(url.includes('searchTop'))return Response.json({stocks:[{stockName:'삼성전자',itemCode:'005930',stockEndType:'stock'}]});
    if(url.includes('/stock/005930/price'))return Response.json([{localTradedAt:'2026-10-28',closePrice:'245,000',fluctuationsRatio:''}]);
    return new Response('x',{status:404});
  }) as typeof fetch;
  const result=await collectKoreaSearchTop('2026-10-28',fetcher);
  assert.equal(result.stocks.length,0);assert.ok(result.audit.some(item=>item.error==='ATTENTION_SESSION_ROW_MISSING'));
});

test('AI article adds bellwether moves and AI-specific broker analysis only',async()=>{
  const {composeAIDeepSections}=await import('../src/operations/market-deep-sections.js');
  const {statements,digests}=extractBriefContent(brief);
  const report={kind:'MARKET' as const,date:'2026-10-29',title:'morning meeting brief',broker:'대신증권',analysts:'리서치센터',url:'https://consensus.hankyung.com/analysis/downpdf?report_idx=902',summary:[],targetPrice:null,rating:null,stockCode:null,company:null};
  const stock=(symbol:string,changePct:number)=>({symbol,name:symbol,koreanName:symbol==='NVDA'?'엔비디아':null,changePct,close:100,date:'2026-10-29',trendingRank:null,mostActiveRank:null,marketCap:null});
  const ai=composeAIDeepSections({bundle:{briefs:[{report,statements,digests}],company:[],industry:[],economy:[],audit:[]},stocks:[stock('NVDA',2.5),stock('MSFT',-1),stock('AMD',0.4)],sessionDate:'2026-10-29'});
  const html=ai.sections.map(deepSection).join('');
  assert.match(html,/가장 강한 종목은 엔비디아\(NVDA, \+2\.50%\)/);
  assert.match(html,/삼성전기/);assert.doesNotMatch(html,/프랑스|OEM/);
});

test('supplementary sources never satisfy the core-evidence diversity or concentration checks',async()=>{
  const {coreEvidenceSources}=await import('../src/production/verification-artifact.js');
  const core={label:'엔비디아 공식 발표',url:'https://blogs.nvidia.com/blog/a/',publisher:'NVIDIA'};
  const extra={label:'Yahoo Finance AI 대표 종목 일별 종가',url:'https://query1.finance.yahoo.com/v7/finance/spark?symbols=NVDA',publisher:'Yahoo Finance',role:'SUPPLEMENTARY' as const};
  assert.deepEqual(coreEvidenceSources([core,extra]),[core]);
});

test('a round level or an intraday KOSPI print is not read as a contradicting close',async()=>{
  const {contradictsKospi}=await import('../src/operations/broker-briefs.js');
  const line=(text:string)=>[{region:'KOREA' as const,text,heading:null}];
  assert.equal(contradictsKospi(line('KOSPI는 전일 회복한 6,000선을 하루 만에 재차 하회'),5937.66),false);
  assert.equal(contradictsKospi(line('삼성전자 실적 기대에 KOSPI 6,100p 터치했지만, 컨콜 후 매물 출회'),5937.66),false);
  assert.equal(contradictsKospi(line('KOSPI 5,937pt (-1.24%), KOSDAQ 753pt (-2.34%)'),5937.66),false);
  assert.equal(contradictsKospi(line('KOSPI는 2.2% 하락한 5,877.9p로 마감'),5937.66),true);
});

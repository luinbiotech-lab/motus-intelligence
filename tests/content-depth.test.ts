// 2026-11-11 owner: "기사내용이 한줄짜리 숫자만 들어가는 카테고리" — regressions for the thin-content fixes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {composeAIDeepSections,composeKoreaDeepSections,composeUSDeepSections} from '../src/operations/market-deep-sections.js';

const kr=(rank:number,name:string,changePct:number)=>({rank,name,code:String(100000+rank),close:10000*rank,changePct,date:'2026-11-10',url:`https://m.stock.naver.com/api/stock/${100000+rank}/price`});
const top=[kr(1,'삼성전자',1.2),kr(2,'SK하이닉스',3.4),kr(3,'삼성SDI',9.52),kr(4,'한화오션',-6.1),kr(5,'카카오',0)];
const texts=(section:{paragraphs:Array<{text:string}>}|undefined)=>(section?.paragraphs??[]).map(p=>p.text);

test('Korea search stocks without commentary are read together, never as one-line paragraphs each',()=>{
  const composed=composeKoreaDeepSections({bundle:null,searchTop:top,checkpoint:'체크.',kospiChangePct:0.85});
  const stocks=texts(composed.sections.find(item=>item.key==='korea-stocks'));
  assert.equal(stocks.filter(text=>/^검색 \d+위 .+했다(\(.*\))?\.$/.test(text)).length,0);
  assert.equal(stocks.length,2);
  assert.match(stocks[0]!,/^MOTUS 정리: 투자자 검색 상위 5종목 가운데 3종목이 오르고 1종목이 내렸다\(보합 1종목\)\. 가장 강한 종목은 삼성SDI\(\+9\.52%\), 가장 약한 종목은 한화오션\(-6\.10%\)로 등락 폭 차이가 15\.62%p였다\./);
  assert.match(stocks[0]!,/코스피는 \+0\.85%였고, 코스피보다 강했던 종목은 3종목\(삼성전자·SK하이닉스·삼성SDI\)이다\./);
  assert.match(stocks[1]!,/삼성SDI\(3위, 30,000원, \+9\.52%\)/);
  assert.match(stocks[1]!,/삼성전자·SK하이닉스·삼성SDI가 지수보다 강했고 한화오션·카카오는 지수를 밑돌았다\./);
  const risks=texts(composed.sections.find(item=>item.key==='korea-risks'));
  assert.equal(risks[0],'체크.');
  assert.match(risks[1]!,/^변동성 점검: 직전 거래일 검색 상위 가운데 5% 넘게 움직인 삼성SDI\(\+9\.52%\)·한화오션\(-6\.10%\)은 등락이 이어지는지가 함께 확인 대상이다\.$/);
});

test('a single bare stock keeps its line with the KOSPI gap, and no KOSPI value means no invented comparison',()=>{
  const one=composeKoreaDeepSections({bundle:null,searchTop:[kr(2,'SK하이닉스',12.45)],kospiChangePct:1.2});
  assert.deepEqual(texts(one.sections[0]),['검색 2위 SK하이닉스는 20,000원으로 12.45% 급등했다(코스피 대비 +11.25%p).']);
  const noIndex=composeKoreaDeepSections({bundle:null,searchTop:top});
  const all=texts(noIndex.sections[0]).join('\n');
  assert.doesNotMatch(all,/코스피/);
  assert.match(all,/^MOTUS 정리: 투자자 검색 상위 5종목/);
});

test('U.S. risks name the 5%+ movers among the printed stocks',()=>{
  const stock=(symbol:string,koreanName:string,changePct:number)=>({symbol,name:symbol,koreanName,changePct,close:100,date:'2026-11-10',trendingRank:1,mostActiveRank:null,marketCap:null});
  const composed=composeUSDeepSections({bundle:null,stocks:[stock('AMD','AMD',-10.88),stock('MSFT','마이크로소프트',0.4)],sectors:[],checkpoint:'다음 확인 지표.'});
  const risks=texts(composed.sections.find(item=>item.key==='us-risks'));
  assert.equal(risks.length,2);
  assert.match(risks[1]!,/AMD\(-10\.88%\)/);
  assert.doesNotMatch(risks[1]!,/마이크로소프트/);
});

test('AI ratings without a published summary are listed in one paragraph',()=>{
  const report=(company:string,code:string,summary:string[])=>({kind:'COMPANY' as const,broker:'A증권',analysts:'홍길동',date:'2026-11-10',title:`${company}(${code}) AI 서버 수요`,url:`https://example.com/${code}`,company,stockCode:code,rating:'Buy',targetPrice:'100,000',summary});
  const composed=composeAIDeepSections({bundle:{briefs:[],company:[report('가전자','000001',[]),report('나반도체','000002',[]),report('다전기','000003',['AI 데이터센터 전력 수요가 이어진다'])],industry:[],economy:[],audit:[]} as never,stocks:[],sessionDate:null});
  const research=texts(composed.sections.find(item=>item.key==='ai-broker-research'));
  assert.equal(research.length,2);
  assert.match(research[0]!,/^다전기: .*요약: “AI 데이터센터 전력 수요가 이어진다”/);
  assert.match(research[1]!,/^요약문 없이 투자의견만 공개된 AI 관련 리포트도 있었다: 가전자\(A증권, .*Buy, 목표주가 100,000원\), 나반도체/);
});

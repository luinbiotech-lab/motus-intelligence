import test from 'node:test';
import assert from 'node:assert/strict';
import {composeKoreaFxFlowComment,composeKoreaDeepSections,composeUSDeepSections} from '../src/operations/market-deep-sections.js';
import {buildKoreaMarketNarrative} from '../src/operations/market-narrative.js';
import type {WireReport} from '../src/operations/market-wire.js';

/**
 * 2026-11-22 owner: "누가 봐도 인공지능이 작성했다라고 보인다 … 언론사 기사처럼 티가 안 나도록".
 * Meta labels that announce how the text was made never reach the article body.
 * Inferences stay marked, as wire copy marks them ('~로 풀이된다', '~것으로 보인다'), and unsourced causes are left out.
 */
const BANNED=[/MOTUS 해석/,/\(추정\)/,/전망 아님/,/관전 포인트/,/확인점/,/확인 지점/,/확인 대상/,/원인 미확인/,/수집되지 않았다/,/아침 리포트가 아직 없어/,/주가 변동의 원인/,/세션/,/0종목이 오르고/,/가장 강한 종목은 [^.]*\(-/];
const check=(texts:string[])=>{for(const text of texts)for(const pattern of BANNED)assert.doesNotMatch(text,pattern,text)};
const flows=[{label:'개인',value:15924},{label:'외국인',value:-11259},{label:'기관',value:-9534}];
const wire:WireReport[]=[{publisher:'연합뉴스',title:"5%대 급락 '검은 금요일'…코스피 4,800대로 후퇴(종합)",url:'https://example.test/w',publishedAt:'2026-11-20T07:00:00Z',sentence:'앤트로픽 상장 흥행에도 대중 반도체 규제 우려가 커지며 코스피가 급락했다.',feed:'x'}];

test('article prose carries no AI meta labels (11/20 Korea close shape)',()=>{
  check(composeKoreaFxFlowComment({fx:{value:1335.7,change:0.2},flows,kospiChangePct:-5.21,bundle:null}).flatMap(section=>section.paragraphs.map(p=>p.text)));
  check(composeKoreaFxFlowComment({fx:{value:1335.7,change:-3},flows,kospiChangePct:-5.21,bundle:null}).flatMap(section=>section.paragraphs.map(p=>p.text)));
  const search=[['삼성전자',-6.86],['SK하이닉스',-6.0],['삼성전기',-12.32],['현대차',-4.86],['두산에너빌리티',-7.31],['삼성SDI',-6.07]].map(([name,changePct],index)=>({rank:index+1,name:String(name),code:String(index),close:100000,changePct:Number(changePct),date:'2026-11-20'}));
  const korea=composeKoreaDeepSections({bundle:null,searchTop:search as never,wire,kospiChangePct:-5.21,checkpoint:'다음 거래일에는 외국인과 기관의 매매가 이어질지가 관심사다.'});
  const texts=korea.sections.flatMap(section=>[section.intro??'',...section.paragraphs.map(p=>p.text)]);
  check(texts);
  assert.ok(texts.some(text=>text.includes('투자자 검색 상위 6종목이 모두 내렸다.')),texts.join('\n'));
  assert.ok(texts.some(text=>text.includes('코스피(-5.21%)보다 나은 흐름을 보인 종목은 현대차뿐이었다.')),texts.join('\n'));
  const us=composeUSDeepSections({bundle:null,stocks:[],sectors:[],checkpoint:'다음 정규장에서는 금리 방향이 관심사다.',wire});
  check(us.sections.flatMap(section=>[section.intro??'',...section.paragraphs.map(p=>p.text)]));
  const d=['2026-11-13','2026-11-16','2026-11-17','2026-11-18','2026-11-19','2026-11-20'];
  const narrative=buildKoreaMarketNarrative([{label:'KOSPI',dates:d,closes:[5290.53,5100.5,4968.48,5067.44,5137.89,4869.96]},{label:'KOSDAQ',dates:d,closes:[699.66,665.65,650.06,662.8,684.7,645.68]}],[],{flows,driver:{publisher:'연합뉴스',text:wire[0]!.sentence!}});
  check(narrative.analysis);
  assert.ok(narrative.analysis.some(text=>text.startsWith('개인이 1조5천924억원어치를 순매수했고, 외국인과 기관은 각각 1조1천259억원, 9천534억원어치를 순매도했다.')),narrative.analysis.join('\n'));
});

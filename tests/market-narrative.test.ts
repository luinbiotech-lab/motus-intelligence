import test from 'node:test';
import assert from 'node:assert/strict';
import {buildKoreaMarketNarrative,buildUSMarketNarrative,numberWithEul,numberWithRo,seriesStats} from '../src/operations/market-narrative.js';

const dates=(n:number)=>Array.from({length:n},(_,i)=>`2026-08-${String(i+1).padStart(2,'0')}`);
const ramp=(n:number,start:number,step:number)=>Array.from({length:n},(_,i)=>start+i*step);

test('number particles follow the Korean reading of the last digit',()=>{
  assert.equal(numberWithRo('52,215.16'),'52,215.16으로');assert.equal(numberWithRo('7,623.68'),'7,623.68로');assert.equal(numberWithRo('5,469.47'),'5,469.47로');assert.equal(numberWithRo('100'),'100으로');assert.equal(numberWithRo('1.3'),'1.3으로');
  assert.equal(numberWithEul('727.21'),'727.21을');assert.equal(numberWithEul('751.69'),'751.69를');
});

test('series statistics are computed only from the verified closes',()=>{
  const stats=seriesStats({key:'sp500',label:'S&P 500',dates:dates(25),closes:[...ramp(24,100,1),110]})!;
  assert.equal(stats.close,110);assert.equal(stats.high,123);assert.ok(Math.abs(stats.day-(110/123-1)*100)<1e-9);assert.ok(Math.abs(stats.week!-(110/119-1)*100)<1e-9);assert.ok(Math.abs(stats.month!-(110/104-1)*100)<1e-9);
  assert.equal(seriesStats({key:'x',label:'x',dates:dates(1),closes:[1]}),null);
  assert.equal(seriesStats({key:'x',label:'x',dates:dates(2),closes:[1,Number.NaN]}),null);
});

test('US narrative states verified facts and keeps interpretation separate',()=>{
  const series=[{key:'sp500',label:'S&P 500',dates:dates(30),closes:[...ramp(29,100,1),127]},{key:'nasdaq',label:'Nasdaq',dates:dates(30),closes:[...ramp(29,200,1),226]},{key:'dow-jones',label:'Dow Jones',dates:dates(30),closes:[...ramp(29,300,1),320]}];
  const sameDay=buildUSMarketNarrative(series,{label:'10Y',latest:4.8,previous:4.97,date:'2026-08-30',sessionDate:'2026-08-30'});
  assert.match(sameDay.facts[0]!,/^S&P 500은 127\.00으로 마감해 전 거래일보다 0\.78% 하락했다\./);
  assert.match(sameDay.facts[3]!,/^미국 10년물 국채금리는 4\.80%로 직전 관측치보다 17bp 내렸다\./);
  assert.ok(sameDay.facts.every(fact=>!fact.startsWith('MOTUS')));
  assert.ok(!sameDay.analysis.some(line=>/판단할 수는 없다|볼 수 있다|기준이 된다|확인할 필요|맞물린다|보여 준다/.test(line)),'no generic caveats or inferred causes');
  assert.ok(sameDay.analysis.some(line=>/나스닥 종합지수가 다우존스 산업평균지수보다 [\d.]+%p 덜 내렸다\./.test(line)));
  assert.ok(sameDay.analysis.some(line=>/^같은 날 미국 10년물 국채금리는 17bp 내렸고 S&P 500은 0\.78% 하락했다\.$/.test(line)));
  const staleRate=buildUSMarketNarrative(series,{label:'10Y',latest:4.8,previous:4.97,date:'2026-08-29',sessionDate:'2026-08-30'});
  assert.match(staleRate.facts[3]!,/2026-08-29 기준 4\.80%/);
  assert.ok(!staleRate.analysis.some(line=>line.includes('국채금리')),'a yield from another date is never compared with the session');
});

test('a Nasdaq-Dow gap is read as more or less only when both moved the same way',()=>{
  const day=(key:string,label:string,last:number)=>({key,label,dates:dates(7),closes:[100,100,100,100,100,100,last]});
  const opposite=buildUSMarketNarrative([day('sp500','S&P 500',100.1),day('nasdaq','Nasdaq',99.7),day('dow-jones','Dow Jones',100.4)],null);
  assert.ok(opposite.analysis.includes('기술주 비중이 큰 나스닥 종합지수는 0.30% 내렸고 다우존스 산업평균지수는 0.40% 올랐다.'),opposite.analysis.join(' | '));
  const flatNasdaq=buildUSMarketNarrative([day('sp500','S&P 500',100.3),day('nasdaq','Nasdaq',99.998),day('dow-jones','Dow Jones',100.6)],null);
  assert.ok(flatNasdaq.analysis.includes('기술주 비중이 큰 나스닥 종합지수는 보합이었고 다우존스 산업평균지수는 0.60% 올랐다.'),flatNasdaq.analysis.join(' | '));
  assert.ok(!flatNasdaq.analysis.some(line=>/더 내렸다|더 올랐다/.test(line)));
});

test('Korea narrative uses the session history and same-session foreign flow',()=>{
  const histories=[{label:'KOSPI' as const,dates:dates(10),closes:[...ramp(9,100,1),105]},{label:'KOSDAQ' as const,dates:dates(10),closes:[...ramp(9,50,1),60]}];
  const result=buildKoreaMarketNarrative(histories,[{label:'외국인',direction:'DOWN'}]);
  assert.match(result.facts[0]!,/^코스피는 105\.00으로 마감해 전 거래일보다 2\.78% 하락했다\. 최근 5거래일 기준으로는 [\d.]+% (상승|하락)했다\. 최근 10거래일 종가 고점/);
  assert.match(result.analysis[0]!,/^코스피와 코스닥의 방향이 엇갈렸다\.$/);
  assert.ok(result.analysis.includes('외국인은 순매도로 마감했다.'));
  assert.deepEqual(buildKoreaMarketNarrative([],[]),{facts:[],analysis:[]});
});

test('flat moves are never read as a direction, and index-only data supports no size or flow claims',()=>{
  const flat=(key:string,label:string)=>({key,label,dates:dates(7),closes:[100,100,100,100,100,100,100]});
  const allFlat=buildUSMarketNarrative([flat('sp500','S&P 500'),flat('nasdaq','Nasdaq'),flat('dow-jones','Dow Jones')],null);
  assert.ok(!allFlat.analysis.some(line=>line.includes('엇갈려')));assert.match(allFlat.analysis[0]!,/모두 보합권/);
  const upAndFlat=buildUSMarketNarrative([{key:'sp500',label:'S&P 500',dates:dates(7),closes:[100,100,100,100,100,100,101]},flat('nasdaq','Nasdaq'),flat('dow-jones','Dow Jones')],null);
  assert.ok(!upAndFlat.analysis.some(line=>line.includes('엇갈려')));assert.match(upAndFlat.analysis[0]!,/일부 지수만 오르고/);

  const korea=buildKoreaMarketNarrative([{label:'KOSPI',dates:dates(6),closes:[100,101,101,101,101,100]},{label:'KOSDAQ',dates:dates(6),closes:[100,100,100,100,100,101]}],[]);
  assert.ok(!korea.analysis.some(line=>/대형주|중소형주|수급/.test(line)),korea.analysis.join(' '));
  assert.ok(korea.analysis.includes('코스피와 코스닥의 방향이 엇갈렸다.'));
  assert.ok(!korea.analysis.some(line=>line.includes('5거래일 기준으로')),'a flat 5-session change has no opposite direction');
});

test('only the period high itself is called the highest close',()=>{
  const near=seriesStats({key:'sp500',label:'S&P 500',dates:dates(3),closes:[9000,10000,9999.6]})!;
  const narrative=buildUSMarketNarrative([{key:'sp500',label:'S&P 500',dates:dates(3),closes:[9000,10000,9999.6]}],null);
  assert.ok(near.fromHigh<0);assert.doesNotMatch(narrative.facts[0]!,/가장 높은 수준/);assert.match(narrative.facts[0]!,/고점 부근/);
  assert.match(buildUSMarketNarrative([{key:'sp500',label:'S&P 500',dates:dates(3),closes:[9000,10000,10001]}],null).facts[0]!,/가장 높은 수준/);
});

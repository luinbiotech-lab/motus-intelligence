import test from 'node:test';
import assert from 'node:assert/strict';
import {buildKoreaMarketNarrative,eokText,buildUSMarketNarrative,numberWithEul,numberWithRo,seriesStats} from '../src/operations/market-narrative.js';

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
  assert.match(result.analysis[0]!,/코스닥은 반대로 [\d.]+% 올라 두 시장의 방향이 엇갈렸다\./);
  assert.ok(!result.analysis.some(line=>line.includes('순매도로 마감했다')),'a bare flow direction is not analysis');
  assert.deepEqual(buildKoreaMarketNarrative([],[]),{facts:[],analysis:[]});
});

test('flat moves are never read as a direction, and index-only data supports no size or flow claims',()=>{
  const flat=(key:string,label:string)=>({key,label,dates:dates(7),closes:[100,100,100,100,100,100,100]});
  const allFlat=buildUSMarketNarrative([flat('sp500','S&P 500'),flat('nasdaq','Nasdaq'),flat('dow-jones','Dow Jones')],null);
  assert.ok(!allFlat.analysis.some(line=>line.includes('엇갈려')));assert.match(allFlat.analysis[0]!,/모두 보합권/);
  const upAndFlat=buildUSMarketNarrative([{key:'sp500',label:'S&P 500',dates:dates(7),closes:[100,100,100,100,100,100,101]},flat('nasdaq','Nasdaq'),flat('dow-jones','Dow Jones')],null);
  assert.ok(!upAndFlat.analysis.some(line=>line.includes('엇갈려')));assert.ok(upAndFlat.analysis.some(line=>/일부 지수만 오르고/.test(line)),upAndFlat.analysis.join(' | '));

  const korea=buildKoreaMarketNarrative([{label:'KOSPI',dates:dates(6),closes:[100,101,101,101,101,100]},{label:'KOSDAQ',dates:dates(6),closes:[100,100,100,100,100,101]}],[]);
  assert.ok(!korea.analysis.some(line=>/대형주|중소형주|수급/.test(line)),korea.analysis.join(' '));
  assert.ok(korea.analysis.some(line=>line.includes('두 시장의 방향이 엇갈렸다')),korea.analysis.join(' '));
  assert.ok(!korea.analysis.some(line=>line.includes('5거래일 기준으로')),'a flat 5-session change has no opposite direction');
});

test('only the period high itself is called the highest close',()=>{
  const near=seriesStats({key:'sp500',label:'S&P 500',dates:dates(3),closes:[9000,10000,9999.6]})!;
  const narrative=buildUSMarketNarrative([{key:'sp500',label:'S&P 500',dates:dates(3),closes:[9000,10000,9999.6]}],null);
  assert.ok(near.fromHigh<0);assert.doesNotMatch(narrative.facts[0]!,/가장 높은 수준/);assert.match(narrative.facts[0]!,/고점 부근/);
  assert.match(buildUSMarketNarrative([{key:'sp500',label:'S&P 500',dates:dates(3),closes:[9000,10000,10001]}],null).facts[0]!,/가장 높은 수준/);
});

test('Korea MOTUS analysis reads the day: trend, level, who moved it, the cause and the next check (11/17 actual)',()=>{
  const d=['2026-11-04','2026-11-05','2026-11-06','2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13','2026-11-16','2026-11-17'];
  const kospi=[5683.8,5383.8,5059.69,5018.85,5239.13,5375.36,5342.73,5290.53,5100.5,4968.48],kosdaq=[714.95,678.41,644.27,638.97,667.61,705.1,696.53,699.66,665.65,650.06];
  const r=buildKoreaMarketNarrative([{label:'KOSPI',dates:d,closes:kospi},{label:'KOSDAQ',dates:d,closes:kosdaq}],[],{flows:[{label:'개인',value:4041},{label:'외국인',value:-14090},{label:'기관',value:5292}],driver:{publisher:'연합인포맥스',text:'코스피가 엔비디아 실적 발표를 앞둔 경계감에 하락했다.'}});
  assert.equal(r.analysis[0],"코스피는 4거래일 연속 하락하며 5,000선 아래로 내려왔다. 최근 10거래일 고점(5,683.80, 2026-11-04)보다 12.59% 낮아, 흔히 '조정'이라 부르는 고점 대비 10% 이상 하락 구간에 들어섰다. 코스닥도 2.34% 내려 두 시장이 함께 움직였다.");
  assert.equal(r.analysis[1],'매도 쪽은 외국인(−1조 4,090억원), 매수 쪽은 기관(+5,292억원)·개인(+4,041억원)이었다. 지수 방향과 같은 쪽에서 가장 크게 움직인 주체가 외국인이어서, 이날 하락은 외국인 매도가 주도한 것으로 읽힌다(추정).');
  assert.match(r.analysis[2]!,/^원인으로는 연합인포맥스가 “코스피가 엔비디아 실적 발표를 앞둔 경계감에 하락했다”고 짚었다\. 같은 날 외국인이 1조 4,090억원을 순매도한 만큼/);
  assert.equal(r.analysis[3],'다음 거래일에는 5,000선 회복 여부와 외국인 매도가 멈추는지가 이 하락이 이어질지를 가르는 첫 확인점이다.');
  assert.equal(eokText(-14090),'1조 4,090억원');assert.equal(eokText(20000),'2조원');assert.equal(eokText(23),'23억원');
});
test('when the largest flow runs against the index, the reading says so instead of crediting it',()=>{
  const d=['2026-11-04','2026-11-05','2026-11-06','2026-11-09','2026-11-10','2026-11-11'];
  const r=buildKoreaMarketNarrative([{label:'KOSPI',dates:d,closes:[5683.8,5383.8,5059.69,5018.85,5239.13,5375.36]},{label:'KOSDAQ',dates:d,closes:[714.95,678.41,644.27,638.97,667.61,705.1]}],[],{flows:[{label:'개인',value:-13821},{label:'외국인',value:4177},{label:'기관',value:4768}]});
  assert.ok(r.analysis.some(line=>line.includes('가장 크게 움직인 개인은 지수와 반대로 팔았고, 지수는 매수 쪽(기관·외국인)을 따라 올랐다(추정).')),r.analysis.join(' | '));
  assert.ok(!r.analysis.some(line=>line.startsWith('원인으로는')),'no cause sentence is invented without a driver');
});

test('US MOTUS analysis reads trend, the rate move against the index, the sourced cause and the next check',()=>{
  const n=63,base=Array.from({length:n-2},(_,i)=>7400-i*10);
  const sp=[...base,base.at(-1)!-20,6490];   // three straight declines, 6,500 lost, the largest move of the period
  const series=[{key:'sp500',label:'S&P 500',dates:dates(n),closes:sp},{key:'nasdaq',label:'Nasdaq',dates:dates(n),closes:[...Array(n-1).fill(200),196]},{key:'dow-jones',label:'Dow Jones',dates:dates(n),closes:[...Array(n-1).fill(300),299]}];
  const r=buildUSMarketNarrative(series,{label:'10Y',latest:4.1,previous:4.13,date:'d',sessionDate:'d'},{driver:{publisher:'연합뉴스',text:'엔비디아 실적 경계감에 기술주가 약세를 보였다.'}});
  assert.match(r.analysis[0]!,/^S&P 500은 \d+거래일 연속 하락하며 6,500선 아래로 내려왔다\. 하루 낙폭 [\d.]+%는 최근 63거래일 가운데 가장 컸다\./);
  assert.ok(r.analysis.includes('금리가 내렸는데도 주가가 내려, 이날 하락은 금리보다 다른 요인에서 나온 것으로 읽힌다(추정).'),r.analysis.join(' | '));
  assert.ok(r.analysis.includes('원인으로는 연합뉴스가 “엔비디아 실적 경계감에 기술주가 약세를 보였다”고 짚었다.'));
  assert.equal(r.analysis.at(-1),'다음 정규장에서는 S&P 500 6,500선 회복 여부와 10년물 금리 방향가 첫 확인점이다.'.replace('방향가','방향이'));
});

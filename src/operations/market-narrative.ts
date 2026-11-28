/**
 * Deterministic market narratives computed only from already verified closing series.
 * Facts restate verified numbers (levels, daily / 5-session / 20-session moves, distance from the
 * 63-session closing high). Interpretation is produced separately, rule-based, and rendered under a
 * "MOTUS 분석" heading so it never blends with the facts.
 */
import {josa} from './ai-generic-synthesis.js';

export interface ClosingSeries {key:string;label:string;dates:string[];closes:number[]}
export interface MarketNarrative {facts:string[];analysis:string[]}

const US_NAMES:Record<string,string>={sp500:'S&P 500',nasdaq:'나스닥 종합지수','dow-jones':'다우존스 산업평균지수','russell-2000':'러셀 2000'};

export function formatLevel(value:number):string {return value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
function pct(from:number,to:number):number {return (to-from)/from*100}
/** Direction at display precision: moves that round to 0.00% are flat, never a direction. */
export function direction(value:number):-1|0|1 {return Math.abs(value)<0.005?0:value>0?1:-1}
export function moveText(value:number):string {return Math.abs(value)<0.005?'보합':`${Math.abs(value).toFixed(2)}% ${value>0?'상승':'하락'}`}

export interface SeriesStats {name:string;close:number;day:number;week:number|null;month:number|null;high:number;highDate:string;fromHigh:number}

export function seriesStats(series:ClosingSeries,name=US_NAMES[series.key]??series.label):SeriesStats|null {
  const closes=series.closes,count=closes.length;
  if(count<2||closes.some(value=>!Number.isFinite(value)||value<=0))return null;
  const close=closes[count-1]!,highIndex=closes.reduce((best,value,index)=>value>=closes[best]!?index:best,0);
  return {name,close,day:pct(closes[count-2]!,close),week:count>=6?pct(closes[count-6]!,close):null,month:count>=21?pct(closes[count-21]!,close):null,high:closes[highIndex]!,highDate:series.dates[highIndex]??'',fromHigh:pct(closes[highIndex]!,close)};
}

/** 로/으로 after a number, by how its last digit is read (영·삼·육 take 으로; ㄹ-final 일·칠·팔 take 로). */
export function numberWithRo(value:string):string {const last=value.replace(/[^0-9]/g,'').slice(-1);return value+('036'.includes(last)&&last!==''?'으로':'로')}
/** 을/를 after a number. */
export function numberWithEul(value:string):string {const last=value.replace(/[^0-9]/g,'').slice(-1);return value+('013678'.includes(last)&&last!==''?'을':'를')}

function indexFact(stats:SeriesStats,horizonLabel:string):string {
  const parts=[`${josa(stats.name,'은','는')} ${numberWithRo(formatLevel(stats.close))} 마감해 전 거래일보다 ${moveText(stats.day)}했다.`];
  if(stats.week!==null&&stats.month!==null)parts.push(`최근 5거래일 기준으로는 ${moveText(stats.week)}, 20거래일 기준으로는 ${moveText(stats.month)}했다.`);
  else if(stats.week!==null)parts.push(`최근 5거래일 기준으로는 ${moveText(stats.week)}했다.`);
  // "Highest" only when the latest close is the period high itself; a close a hair below it is described as near the high.
  parts.push(stats.close>=stats.high?`${horizonLabel} 종가 가운데 가장 높은 수준이다.`
    :Math.abs(stats.fromHigh)<0.005?`${horizonLabel} 종가 고점(${formatLevel(stats.high)}, ${stats.highDate})과 0.01% 이내 차이로 고점 부근이다.`
    :`${horizonLabel} 종가 고점(${formatLevel(stats.high)}, ${stats.highDate})보다 ${Math.abs(stats.fromHigh).toFixed(2)}% 낮다.`);
  return parts.join(' ');
}

export interface RateObservation {label:string;latest:number;previous:number;date:string;sessionDate:string}

/** U.S. close: per-index facts, 10Y fact, and rule-based MOTUS analysis. */
export function buildUSMarketNarrative(series:ClosingSeries[],tenYear:RateObservation|null,context:{driver?:{publisher:string;text:string}|null}={}):MarketNarrative {
  const stats=series.map(item=>seriesStats(item)).filter((item):item is SeriesStats=>Boolean(item));
  const facts=stats.map(item=>indexFact(item,'최근 63거래일'));
  let rateChange:number|null=null;
  if(tenYear&&Number.isFinite(tenYear.latest)&&Number.isFinite(tenYear.previous)){
    rateChange=Math.round((tenYear.latest-tenYear.previous)*100);
    facts.push(`미국 10년물 국채금리는 ${tenYear.date===tenYear.sessionDate?'':`${tenYear.date} 기준 `}${tenYear.latest.toFixed(2)}%로 직전 관측치보다 ${rateChange===0?'변동이 없었다':`${Math.abs(rateChange)}bp ${rateChange>0?'올랐다':'내렸다'}`}.`);
  }
  const analysis:string[]=[],core=stats.slice(0,3);
  // 2026-11-18 owner: the box reads the day (trend, level, size), not only index-vs-index differences.
  const sp=stats.find(item=>item.name===US_NAMES.sp500),spSeries=series.find(item=>item.key==='sp500');
  let spCrossed:number|null=null;
  if(sp&&spSeries&&direction(sp.day)!==0){
    const closes=spSeries.closes,down=sp.day<0,parts:string[]=[],run=streak(closes),moves=closes.slice(1).map((value,index)=>Math.abs(pct(closes[index]!,value)));
    spCrossed=levelCrossed(closes.at(-2)!,closes.at(-1)!,500);
    const lead=run>=2?`S&P 500은 ${run}거래일 연속 ${down?'하락':'상승'}했다`:`S&P 500은 ${Math.abs(sp.day).toFixed(2)}% ${down?'내렸다':'올랐다'}`;
    parts.push(spCrossed!==null?`${lead.replace(/했다$|내렸다$|올랐다$/,match=>match==='했다'?'하며':match==='내렸다'?'내리며':'오르며')} ${formatLevel(spCrossed).replace(/\.00$/,'')}선 ${down?'아래로 내려왔다':'위로 올라섰다'}.`:`${lead}.`);
    if(moves.length>=10&&Math.abs(sp.day)>=1&&Math.abs(sp.day)>=Math.max(...moves)-1e-9)parts.push(`하루 ${down?'낙폭':'상승폭'} ${Math.abs(sp.day).toFixed(2)}%는 최근 ${closes.length}거래일 가운데 가장 컸다.`);
    if(sp.fromHigh<=-10)parts.push(`최근 ${closes.length}거래일 고점(${formatLevel(sp.high)}, ${sp.highDate})보다 ${Math.abs(sp.fromHigh).toFixed(2)}% 낮아, 흔히 '조정'이라 부르는 고점 대비 10% 이상 하락 구간에 들어섰다.`);
    else if(sp.fromHigh<=-5)parts.push(`최근 ${closes.length}거래일 고점보다 ${Math.abs(sp.fromHigh).toFixed(2)}% 낮다.`);
    else if(!down&&sp.close>=sp.high)parts.push(`최근 ${closes.length}거래일 종가 가운데 가장 높다.`);
    analysis.push(parts.join(' '));
  }
  if(core.length>=2){
    const ups=core.filter(item=>direction(item.day)>0).length,downs=core.filter(item=>direction(item.day)<0).length;
    // Analysis states only what the verified closes show; no generic caveats, no inferred causes.
    if(ups>0&&downs>0)analysis.push('주요 지수의 방향이 엇갈렸다.');
    else if(ups>0&&ups<core.length)analysis.push('일부 지수만 오르고 나머지는 보합에 그쳤다.');
    else if(downs>0&&downs<core.length)analysis.push('일부 지수만 내리고 나머지는 보합에 머물렀다.');
    else if(!ups&&!downs)analysis.push('주요 지수가 모두 보합권에 머물렀다.');
    const nasdaq=stats.find(item=>item.name===US_NAMES.nasdaq),dow=stats.find(item=>item.name===US_NAMES['dow-jones']);
    if(nasdaq&&dow&&Math.abs(nasdaq.day-dow.day)>=0.5){
      const n=direction(nasdaq.day),d=direction(dow.day),gap=Math.abs(nasdaq.day-dow.day).toFixed(2),weaker=nasdaq.day<dow.day;
      // A gap is read as 'more/less' only when both moved the same way; otherwise each move is stated as it was.
      if(n!==0&&n===d)analysis.push(`기술주 비중이 큰 나스닥 종합지수가 다우존스 산업평균지수보다 ${gap}%p ${weaker?(n<0?'더 내렸다':'덜 올랐다'):(n>0?'더 올랐다':'덜 내렸다')}.`);
      else{const word=(value:number)=>direction(value)>0?`${Math.abs(value).toFixed(2)}% 올랐다`:direction(value)<0?`${Math.abs(value).toFixed(2)}% 내렸다`:'보합이었다';analysis.push(`기술주 비중이 큰 나스닥 종합지수는 ${word(nasdaq.day).replace(/다$/,'고')} 다우존스 산업평균지수는 ${word(dow.day)}.`)}
    }
    // Rates sit next to the lead index only when the yield is observed on the same session date; no cause is stated.
    const lead=stats[0]!;
    if(rateChange!==null&&rateChange!==0&&tenYear?.date===tenYear?.sessionDate&&direction(lead.day)!==0){
      analysis.push(`같은 날 미국 10년물 국채금리는 ${Math.abs(rateChange)}bp ${rateChange>0?'올랐고':'내렸고'} ${josa(lead.name,'은','는')} ${Math.abs(lead.day).toFixed(2)}% ${lead.day>0?'상승했다':'하락했다'}.`);
      const up=rateChange>0,rally=lead.day>0;
      analysis.push(up&&!rally?'금리 상승이 주가에 부담으로 작용한 것으로 보인다.':!up&&!rally?'금리가 내렸는데도 주가가 떨어져, 이날 하락은 금리보다 다른 악재의 영향이 컸던 것으로 풀이된다.':!up&&rally?'금리 하락이 주가를 떠받친 것으로 보인다.':'금리가 올랐는데도 주가가 올라, 금리 부담보다 다른 호재가 더 크게 작용한 것으로 풀이된다.');
    }
  }
  if(context.driver&&sp&&direction(sp.day)!==0&&driverFits(context.driver.text,'US',sp.day>0))analysis.push(`${josa(context.driver.publisher,'은','는')} ${quoted(context.driver.text)} 분석했다.`);
  if(sp&&direction(sp.day)!==0){
    const down=sp.day<0,checks:string[]=[];
    if(spCrossed!==null)checks.push(`S&P 500 ${formatLevel(spCrossed).replace(/\.00$/,'')}선 ${down?'회복':'안착'} 여부`);
    else if(sp.fromHigh<=-10&&down)checks.push('고점 대비 낙폭이 더 커지는지');
    if(rateChange!==null&&tenYear?.date===tenYear?.sessionDate)checks.push('10년물 금리 방향');
    if(checks.length)analysis.push(`다음 정규장에서는 ${josa(checks.join('와 '),'이','가')} 관건이다.`);
  }
  return {facts,analysis};
}

export interface KoreaIndexHistory {label:'KOSPI'|'KOSDAQ';dates:string[];closes:number[]}

/** 억원 amount in words: 14,090 -> '1조 4,090억원'. */
export function eokText(value:number):string {
  const a=Math.round(Math.abs(value)),jo=Math.floor(a/10000),rest=a%10000;
  return jo?`${jo}조${rest?` ${rest.toLocaleString('en-US')}억원`:'원'}`:`${rest.toLocaleString('en-US')}억원`;
}
/** Wire style amount: 15,924 -> '1조5천924억원', 9,534 -> '9천534억원' (연합뉴스 표기). */
export function pressEok(value:number):string {
  const a=Math.round(Math.abs(value)),jo=Math.floor(a/10000),rest=a%10000,ch=Math.floor(rest/1000),tail=rest%1000;
  const eok=rest?`${ch?`${ch}천`:''}${tail?String(tail):''}억원`:'원';
  return jo?`${jo}조${rest?eok:'원'}`:eok;
}
/**
 * Investor flows the way a wire close reads them (2026-11-22 owner: "AI가 쓴 티가 안 나게"):
 * '개인이 1조5천924억원어치를 순매수했고, 외국인과 기관은 각각 1조1천259억원, 9천534억원어치를 순매도했다.'
 */
export function pressFlow(amounts:Array<{label:string;value:number}>):string {
  const buy=amounts.filter(item=>item.value>0).sort((a,b)=>b.value-a.value),sell=amounts.filter(item=>item.value<0).sort((a,b)=>a.value-b.value);
  const part=(items:typeof amounts,verb:string)=>{
    if(items.length===1)return `${josa(items[0]!.label,'이','가')} ${pressEok(items[0]!.value)}어치를 ${verb}`;
    const head=items.slice(0,-1).map(item=>item.label).join(', '),last=items.at(-1)!.label;
    const and=josa(items.at(-2)!.label,'과','와').slice(items.at(-2)!.label.length);
    return `${head}${and} ${josa(last,'은','는')} 각각 ${items.map(item=>pressEok(item.value)).join(', ')}어치를 ${verb}`;
  };
  const a=buy.length?part(buy,'순매수'):'',b=sell.length?part(sell,'순매도'):'';
  const top=[...amounts].sort((x,y)=>Math.abs(y.value)-Math.abs(x.value))[0];
  const [first,second]=top&&top.value<0?[b,a]:[a,b];
  return first&&second?`${first}했고, ${second}했다.`:`${first||second}했다.`;
}
/**
 * The quotative after a closing quote, as Korean newspapers write it: '…했다”고' after a plain 다 ending,
 * '…변수입니다”라고' after a polite 니다 ending, '…마감”이라고' after a final consonant, '…시사”라고' otherwise.
 */
export function quotative(body:string):string {
  const text=body.trim().replace(/[.。!?]+$/,'');
  if(/다$/.test(text)&&!/니다$/.test(text))return '고';
  const code=text.slice(-1).charCodeAt(0)-0xac00;
  return code>=0&&code<11172&&code%28!==0?'이라고':'라고';
}
/** A quoted sentence followed by the right quotative (see quotative). */
export function quoted(text:string):string {const body=text.trim().replace(/[.。]\s*$/,'');return `“${body}”${quotative(body)}`}
/**
 * A cause is quoted only when it is about this market and agrees with the day's direction (11/18: a Korea close at +1.99%
 * quoted a Fed speaker's hawkish remark from a broker brief). Korea needs a Korean market word; the U.S. needs a U.S.
 * market word; a sentence that names only the opposite move is left out.
 */
export function driverFits(text:string,region:'KOREA'|'US',up:boolean):boolean {
  const market=region==='KOREA'?/코스피|코스닥|국내 ?증시|KOSPI|KOSDAQ|국내 ?주식|한국 ?증시/:/S&P|나스닥|다우|뉴욕 ?증시|미국 ?증시|미 증시|뉴욕증시|기술주/;
  if(!market.test(text))return false;
  const rise=/상승|올랐|오른|반등|강세|급등|회복/.test(text),fall=/하락|내렸|내린|약세|급락|밀려|하회|떨어/.test(text);
  return up?!(fall&&!rise):!(rise&&!fall);
}
export interface KoreaNarrativeContext {flows?:Array<{label:string;value:number}>;driver?:{publisher:string;text:string}|null}

/** Consecutive closes moving the same way as the last one (2 or more), counted back from the latest session. */
function streak(closes:number[]):number {
  let count=0;const last=direction(pct(closes.at(-2)!,closes.at(-1)!));if(!last)return 0;
  for(let i=closes.length-1;i>0&&direction(pct(closes[i-1]!,closes[i]!))===last;i--)count++;
  return count;
}
/** A 1,000-point level crossed between the previous and the latest close (KOSPI) or a 100-point level (KOSDAQ). */
function levelCrossed(previous:number,close:number,step:number):number|null {
  const level=close<previous?Math.floor(previous/step)*step:Math.floor(close/step)*step;
  return (previous>=level&&close<level)||(previous<level&&close>=level)?level:null;
}

/**
 * Korea session: index facts plus a rule-based MOTUS reading. 2026-11-18 owner ("이걸 분석이라고 할 수 있어?" on
 * '외국인은 순매도로 마감했다.'): the box must say what kind of day it was, who moved it and with what size, how that
 * lines up with the reported cause, and what decides the next session. Every number comes from the verified series and
 * flows; readings that go beyond the numbers are marked (추정).
 */
export function buildKoreaMarketNarrative(histories:KoreaIndexHistory[],flows:Array<{label:string;direction:'UP'|'DOWN'|'FLAT'}>,context:KoreaNarrativeContext={}):MarketNarrative {
  const stats=histories.map(item=>seriesStats({key:item.label,label:item.label,dates:item.dates,closes:item.closes},item.label==='KOSPI'?'코스피':'코스닥')).filter((item):item is SeriesStats=>Boolean(item));
  const sessions=histories[0]?.closes.length??0;
  const facts=stats.map(item=>indexFact(item,`최근 ${sessions}거래일`).replace(/최근 5거래일 기준으로는 ([^,]+), 20거래일 기준으로는 [^.]+했다\./,'최근 5거래일 기준으로는 $1했다.'));
  const analysis:string[]=[],kospi=stats.find(item=>item.name==='코스피'),kosdaq=stats.find(item=>item.name==='코스닥');
  const kospiHistory=histories.find(item=>item.label==='KOSPI');
  let crossed:number|null=null,run=0;
  if(kospi&&kospiHistory&&direction(kospi.day)!==0){
    const closes=kospiHistory.closes,down=kospi.day<0,parts:string[]=[];
    run=streak(closes);crossed=levelCrossed(closes.at(-2)!,closes.at(-1)!,1000);
    const moves=closes.slice(1).map((value,index)=>Math.abs(pct(closes[index]!,value)));
    const lead=run>=2?`코스피는 ${run}거래일 연속 ${down?'하락':'상승'}하며`:`코스피는 ${Math.abs(kospi.day).toFixed(2)}% ${down?'내리며':'오르며'}`;
    parts.push(crossed!==null?`${lead} ${formatLevel(crossed).replace(/\.00$/,'')}선 ${down?'아래로 내려왔다':'위로 올라섰다'}.`:`${lead} ${numberWithRo(formatLevel(kospi.close))} 마감했다.`);
    if(moves.length>=4&&Math.abs(kospi.day)>=1&&Math.abs(kospi.day)>=Math.max(...moves)-1e-9)parts.push(`하루 ${down?'낙폭':'상승폭'} ${Math.abs(kospi.day).toFixed(2)}%는 최근 ${sessions}거래일 가운데 가장 컸다.`);
    if(kospi.fromHigh<=-10)parts.push(`최근 ${sessions}거래일 고점(${formatLevel(kospi.high)}, ${kospi.highDate})보다 ${Math.abs(kospi.fromHigh).toFixed(2)}% 낮아, 흔히 '조정'이라 부르는 고점 대비 10% 이상 하락 구간에 들어섰다.`);
    else if(kospi.fromHigh<=-5)parts.push(`최근 ${sessions}거래일 고점보다 ${Math.abs(kospi.fromHigh).toFixed(2)}% 낮아 단기 조정 흐름이 이어지고 있다.`);
    else if(!down&&kospi.close>=kospi.high)parts.push(`최근 ${sessions}거래일 종가 가운데 가장 높은 수준으로, 상승 흐름이 이어지고 있다.`);
    if(kosdaq){
      const a=direction(kospi.day),b=direction(kosdaq.day);
      if(b!==0&&a!==b)parts.push(`코스닥은 반대로 ${Math.abs(kosdaq.day).toFixed(2)}% ${kosdaq.day>0?'올라':'내려'} 두 시장의 방향이 엇갈렸다.`);
      else if(a===b&&Math.abs(kospi.day-kosdaq.day)>=0.5){const bigger=Math.abs(kosdaq.day)>Math.abs(kospi.day)?'코스닥':'코스피',other=bigger==='코스닥'?'코스피':'코스닥';parts.push(`${josa(bigger,'이','가')} ${other}보다 ${Math.abs(kospi.day-kosdaq.day).toFixed(2)}%p 더 크게 ${down?'내렸다':'올랐다'}.`)}
      else if(a===b&&Math.abs(kospi.day)>=1&&Math.abs(kosdaq.day)>=1)parts.push(`코스닥도 ${Math.abs(kosdaq.day).toFixed(2)}% ${down?'내려':'올라'} 두 시장이 함께 움직였다.`);
    }
    if(kospi.week!==null&&direction(kospi.week)!==0&&direction(kospi.week)!==direction(kospi.day))parts.push(`하루 ${down?'내렸지만':'올랐지만'} 최근 5거래일 기준으로는 ${Math.abs(kospi.week).toFixed(2)}% ${kospi.week>0?'오른':'내린'} 상태다.`);
    analysis.push(parts.join(' '));
  }else if(kospi&&kosdaq){
    const b=direction(kosdaq.day);if(b!==0)analysis.push(`코스피는 보합이었고 코스닥은 ${Math.abs(kosdaq.day).toFixed(2)}% ${kosdaq.day>0?'올랐다':'내렸다'}.`);
  }
  const amounts=(context.flows??[]).filter(item=>Number.isFinite(item.value)&&item.value!==0);
  const foreign=amounts.find(item=>/외국인/.test(item.label));
  let foreignLed=false;
  if(kospi&&amounts.length>=2&&direction(kospi.day)!==0){
    const down=kospi.day<0,sellers=amounts.filter(item=>item.value<0).sort((a,b)=>a.value-b.value),buyers=amounts.filter(item=>item.value>0).sort((a,b)=>b.value-a.value);
    const list=(items:typeof amounts)=>items.map(item=>`${item.label}(${item.value>0?'+':'−'}${eokText(item.value)})`).join('·');
    const lead=down?sellers[0]:buyers[0];
    if(sellers.length&&buyers.length&&lead){
      const text=`${pressFlow(amounts)}`;
      const largest=[...amounts].sort((a,b)=>Math.abs(b.value)-Math.abs(a.value))[0]!;
      foreignLed=lead===largest&&/외국인/.test(lead.label);
      analysis.push(lead===largest?`${text} 이날 ${down?'하락':'상승'}은 ${lead.label} ${down?'매도':'매수'}세가 이끈 것으로 풀이된다.`
        :`${text} ${josa(largest.label,'이','가')} 가장 많이 ${largest.value>0?'사들였지만':'팔았지만'} 지수는 ${(down?sellers:buyers).map(item=>item.label).join('·')} ${down?'매도':'매수'}세를 따라 ${down?'내린':'오른'} 것으로 보인다.`);
    }
  }
  if(context.driver&&kospi&&direction(kospi.day)!==0&&driverFits(context.driver.text,'KOREA',kospi.day>0)){
    const quote=quoted(context.driver.text);
    analysis.push(foreignLed&&foreign?`${josa(context.driver.publisher,'은','는')} ${quote} 분석했다. 이 요인이 외국인 ${foreign.value<0?'매도':'매수'}를 통해 지수에 반영된 것으로 보인다.`
      :`${josa(context.driver.publisher,'은','는')} ${quote} 분석했다.`);
  }
  if(kospi&&direction(kospi.day)!==0){
    const down=kospi.day<0,checks:string[]=[];
    if(crossed!==null)checks.push(`${formatLevel(crossed).replace(/\.00$/,'')}선 ${down?'회복':'안착'} 여부`);
    if(foreign)checks.push(`외국인 ${foreign.value<0?'매도가 멈추는지':'매수가 이어지는지'}`);
    else if(run>=3)checks.push(`${run}거래일 연속 ${down?'하락':'상승'}이 멈추는지`);
    if(checks.length)analysis.push(`다음 거래일에는 ${josa(checks.join('와 '),'이','가')} 관건이다.`);
  }
  return {facts,analysis};
}

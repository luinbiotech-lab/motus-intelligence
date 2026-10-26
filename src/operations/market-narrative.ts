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
export function buildUSMarketNarrative(series:ClosingSeries[],tenYear:RateObservation|null):MarketNarrative {
  const stats=series.map(item=>seriesStats(item)).filter((item):item is SeriesStats=>Boolean(item));
  const facts=stats.map(item=>indexFact(item,'최근 63거래일'));
  let rateChange:number|null=null;
  if(tenYear&&Number.isFinite(tenYear.latest)&&Number.isFinite(tenYear.previous)){
    rateChange=Math.round((tenYear.latest-tenYear.previous)*100);
    facts.push(`미국 10년물 국채금리는 ${tenYear.date===tenYear.sessionDate?'':`${tenYear.date} 기준 `}${tenYear.latest.toFixed(2)}%로 직전 관측치보다 ${rateChange===0?'변동이 없었다':`${Math.abs(rateChange)}bp ${rateChange>0?'올랐다':'내렸다'}`}.`);
  }
  const analysis:string[]=[],core=stats.slice(0,3);
  if(core.length>=2){
    const ups=core.filter(item=>direction(item.day)>0).length,downs=core.filter(item=>direction(item.day)<0).length;
    analysis.push(ups===core.length?'주요 지수가 함께 오른 만큼 특정 업종보다 시장 전반의 위험 선호가 개선된 하루로 볼 수 있다.'
      :downs===core.length?'주요 지수가 함께 내린 만큼 개별 종목 이슈보다 시장 전반의 위험 회피 심리가 작용한 하루로 볼 수 있다.'
      :ups>0&&downs>0?'주요 지수의 방향이 엇갈려 시장 전체의 방향성보다 업종·종목별 차별화가 두드러진 하루로 볼 수 있다.'
      :ups>0?'일부 지수만 오르고 나머지는 보합에 그쳐, 상승이 시장 전반으로 넓게 퍼진 하루로 보기는 어렵다.'
      :downs>0?'일부 지수만 내리고 나머지는 보합에 머물러, 하락 압력이 시장 전반으로 번진 하루로 보기는 어렵다.'
      :'주요 지수가 모두 보합권에 머물러 뚜렷한 방향성이 나타나지 않은 하루였다.');
    const nasdaq=stats.find(item=>item.name===US_NAMES.nasdaq),dow=stats.find(item=>item.name===US_NAMES['dow-jones']);
    if(nasdaq&&dow&&Math.abs(nasdaq.day-dow.day)>=0.5)analysis.push(`기술주 비중이 큰 나스닥 종합지수가 다우존스 산업평균지수보다 ${Math.abs(nasdaq.day-dow.day).toFixed(2)}%p ${nasdaq.day>dow.day?'강했다':'약했다'}는 점은 성장주와 전통 업종 사이의 온도차를 보여 준다.`);
    const lead=stats[0]!;
    if(lead.fromHigh>-1)analysis.push(`${josa(lead.name,'이','가')} 3개월 고점 부근에 있어, 다음 구간에서는 고점 돌파 여부와 거래 강도를 함께 확인할 필요가 있다.`);
    else if(lead.fromHigh<=-5)analysis.push(`${josa(lead.name,'이','가')} 3개월 고점보다 5% 이상 낮은 구간에 있어, 하루 반등만으로 조정이 끝났다고 판단하기는 이르다.`);
    // Rates and equities are compared only when the yield is observed on the same session date.
    if(rateChange!==null&&rateChange!==0&&tenYear?.date===tenYear?.sessionDate&&direction(lead.day)!==0){
      analysis.push(rateChange<0&&lead.day>0?'장기금리 하락과 주가 상승이 같은 방향으로 움직여 금리 부담 완화가 주가를 지지한 흐름과 맞물린다.'
        :rateChange>0&&lead.day<0?'장기금리 상승과 주가 하락이 함께 나타나 금리 부담이 주식 평가에 압력으로 작용한 흐름과 맞물린다.'
        :'장기금리와 주가가 같은 방향으로 움직여, 이날 주가 흐름을 금리 하나로 설명하기는 어렵다.');
    }
    analysis.push('하루 등락보다 5거래일·20거래일 흐름이 같은 방향으로 이어지는지가 추세 판단의 기준이 된다.');
  }
  return {facts,analysis};
}

export interface KoreaIndexHistory {label:'KOSPI'|'KOSDAQ';dates:string[];closes:number[]}

/** Korea session: index facts from the verified session history plus rule-based MOTUS analysis. */
export function buildKoreaMarketNarrative(histories:KoreaIndexHistory[],flows:Array<{label:string;direction:'UP'|'DOWN'|'FLAT'}>):MarketNarrative {
  const stats=histories.map(item=>seriesStats({key:item.label,label:item.label,dates:item.dates,closes:item.closes},item.label==='KOSPI'?'코스피':'코스닥')).filter((item):item is SeriesStats=>Boolean(item));
  const facts=stats.map(item=>indexFact(item,`최근 ${histories[0]?.closes.length??0}거래일`).replace(/최근 5거래일 기준으로는 ([^,]+), 20거래일 기준으로는 [^.]+했다\./,'최근 5거래일 기준으로는 $1했다.'));
  const analysis:string[]=[],kospi=stats.find(item=>item.name==='코스피'),kosdaq=stats.find(item=>item.name==='코스닥');
  if(kospi&&kosdaq){
    // Only index closes are verified here, so the reading stays at the level of the two indices (no size or flow claims).
    const a=direction(kospi.day),b=direction(kosdaq.day);
    if(a!==0&&a===b)analysis.push(`코스피와 코스닥이 같은 방향으로 움직여 두 시장이 한 방향으로 반응한 장으로 볼 수 있다.`);
    else if(a!==0&&b!==0)analysis.push(`코스피와 코스닥의 방향이 엇갈려 두 시장 사이의 온도차가 나타난 장으로 볼 수 있다.`);
    else if(a!==0||b!==0)analysis.push(`${a!==0?'코스피':'코스닥'}만 움직이고 ${a!==0?'코스닥':'코스피'}는 보합에 머물러, 시장 전반의 방향성은 뚜렷하지 않았다.`);
    if(kospi.week!==null&&direction(kospi.week)!==0&&direction(kospi.day)!==0&&direction(kospi.week)!==direction(kospi.day))analysis.push(`코스피의 하루 방향이 최근 5거래일 흐름과 반대여서, 이 움직임이 추세 전환인지 단기 되돌림인지는 다음 거래일에서 확인해야 한다.`);
  }
  const foreign=flows.find(item=>/외국인/.test(item.label));
  if(foreign&&foreign.direction!=='FLAT')analysis.push(`외국인이 순${foreign.direction==='UP'?'매수':'매도'}로 마감한 만큼 다음 거래일에도 같은 방향의 수급이 이어지는지가 지수 방향의 관건이다.`);
  return {facts,analysis};
}

import type { InputBundle, MarketSnapshot } from '../domain/models.js';
import type { MajorIndexHistory, MajorIndexHistorySeries, MajorIndexKey } from '../content/publisher-schema.js';

const INDEXES:{key:MajorIndexKey;symbol:string;label:string;sourceLabel:string}[]=[
  {key:'sp500',symbol:'SPX',label:'S&P 500',sourceLabel:'S&P Dow Jones Indices'},
  {key:'nasdaq',symbol:'IXIC',label:'Nasdaq',sourceLabel:'Nasdaq'},
  {key:'dow-jones',symbol:'DJIA',label:'Dow Jones',sourceLabel:'S&P Dow Jones Indices'},
  {key:'russell-2000',symbol:'RUT',label:'Russell 2000',sourceLabel:'FTSE Russell'}
];

export function buildFiveSessionMajorIndexHistory(inputs:InputBundle[]):MajorIndexHistory {
  const ordered=[...inputs].sort((a,b)=>a.tradingDate.localeCompare(b.tradingDate));
  if(ordered.length!==3||ordered.some(item=>item.sample||item.session.status!=='OK')) throw new Error('five-session history requires three verified live trading-day inputs');
  if(ordered[0]!.tradingDate!=='2026-09-11'||ordered[1]!.tradingDate!=='2026-09-15'||ordered[2]!.tradingDate!=='2026-09-16') throw new Error('unsupported five-session input sequence');
  const series=INDEXES.map(index=>buildSeries(index,ordered));
  return {asOf:ordered[2]!.tradingDate,sessionCount:5,series};
}

function buildSeries(index:typeof INDEXES[number],inputs:InputBundle[]):MajorIndexHistorySeries {
  const records=inputs.map(input=>requiredIndex(input,index.symbol));
  const [sep11,sep15,sep16]=records as [MarketSnapshot,MarketSnapshot,MarketSnapshot];
  const values=[sep11.previousClose,sep11.close,sep15.previousClose,sep15.close,sep16.close];
  if(values.some(value=>value===null||!Number.isFinite(value))) throw new Error(`${index.symbol} has incomplete closes`);
  if(sep16.changePct===null||!Number.isFinite(sep16.changePct)) throw new Error(`${index.symbol} has no latest change`);
  const crossCheckDelta=sep16.previousClose===null||sep15.close===null?undefined:Number(Math.abs(sep16.previousClose-sep15.close).toFixed(4));
  if(crossCheckDelta===undefined||crossCheckDelta>0.02) throw new Error(`${index.symbol} prior-close cross-check failed`);
  const dates=['2026-09-10','2026-09-11','2026-09-14','2026-09-15','2026-09-16'];
  const fields:['previousClose','close','previousClose','close','close']=['previousClose','close','previousClose','close','close'];
  const inputRecords=[sep11,sep11,sep15,sep15,sep16];
  return {
    key:index.key,label:index.label,dates,closes:values as number[],latestClose:sep16.close!,latestChangePct:sep16.changePct,
    sourceLabel:index.sourceLabel,sourceUrl:sep16.sourceUrl,
    provenance:inputRecords.map((record,position)=>({
      date:dates[position]!,inputDate:record.tradingDate,field:fields[position]!,sourceId:record.sourceId,sourceUrl:record.sourceUrl,
      collectionMode:record.collectionMode??'UNKNOWN',...(position===3?{crossCheckDelta}: {})
    }))
  };
}

function requiredIndex(input:InputBundle,symbol:string):MarketSnapshot {
  const value=input.market.find(item=>item.symbol===symbol&&item.instrumentType==='INDEX');
  if(!value||value.status!=='OK'||value.collectionMode!=='MANUAL_VERIFIED') throw new Error(`${symbol} is not MANUAL_VERIFIED for ${input.tradingDate}`);
  return value;
}

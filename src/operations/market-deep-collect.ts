/** Collection wrapper that turns broker research and attention signals into audited deep sections. */
import type {DailyCategory} from './daily-orchestrator.js';
import {collectBrokerResearch,type BrokerAudit,type PdfTextReader} from './broker-briefs.js';
import {collectAIBellwethers,collectKoreaSearchTop,collectUSAttention,US_MEGACAPS,US_KOREAN_NAMES,NAVER_SEARCH_TOP,YAHOO_TRENDING,type AttentionAudit} from './market-attention.js';
import {collectWireCloses} from './market-wire.js';
import {composeAIDeepSections,composeKoreaDeepSections,composeUSDeepSections,indexMove,type DeepComposition} from './market-deep-sections.js';

interface AuditSink {sourceId:string;category:DailyCategory;url:string;status:'PASS'|'FAILED';recordCount:number;collectedAt:string;error:string|null;observedDate?:string}
export interface DeepCollection {composition:DeepComposition;title:string|null;sources:Array<{label:string;url:string;publisher:string}>}

/** Reports cited from a fetched consensus list (not opened as PDFs) are verified as listed on that page; the audit keeps each report's own date. */
function recordListed(audit:AuditSink[],sources:Array<{url:string;date?:string}>,category:DailyCategory,at:string){
  const passed=new Set(audit.filter(item=>item.status==='PASS').map(item=>item.url));
  for(const source of sources)if(/^https:\/\/(?:consensus\.hankyung\.com\/analysis\/downpdf|stock\.pstatic\.net\/stock-research\/|m\.stock\.naver\.com\/research\/)/.test(source.url)&&!passed.has(source.url)){audit.push({sourceId:'deep:research:listed:'+source.url.replace(/^https:\/\//,''),category,url:source.url,status:'PASS',recordCount:1,collectedAt:at,error:null,...(source.date?{observedDate:source.date}:{})});passed.add(source.url)}
}

/** Broker entries carry their report date; market data entries carry the covered session; list pages carry none. */
function record(audit:AuditSink[],items:Array<BrokerAudit|AttentionAudit>,category:DailyCategory,at:string,sessionDate:string|null){
  for(const item of items){const date=(item as BrokerAudit).date??sessionDate;audit.push({sourceId:'deep:'+item.sourceId,category,url:item.url,status:item.status,recordCount:item.count,collectedAt:at,error:item.error,...(item.status==='PASS'&&date?{observedDate:date}:{})})}
}

/**
 * Wire close reports stand in for broker commentary only on the last retries of the morning (10:00 KST on):
 * earlier runs wait for the brokers' own morning comments, which are normally listed by 08:00 KST.
 */
// Korean brokers publish no morning comments on weekends, so the Saturday edition on Friday's U.S. session
// would otherwise wait for Monday: on Saturdays and Sundays (KST) wire close reports are used from the first run.
export function wireFallbackAllowed(at:string):boolean {const kst=new Date(Date.parse(at)+9*3600000);return kst.getUTCHours()>=10||kst.getUTCDay()===6||kst.getUTCDay()===0}

/** Never throws: missing research or rankings only drop the corresponding sections. */
export async function collectUSDeep(input:{sessionDate:string;operationDate:string;at:string;fetcher:typeof fetch;audit:AuditSink[];pdfText?:PdfTextReader;indexChanges:number[]}):Promise<DeepCollection>{
  const empty:DeepCollection={composition:{sections:[],leadAddition:[],titleFocus:null,sources:[]},title:null,sources:[]};
  try{
    const [bundle,attention,mega]=await Promise.all([collectBrokerResearch({sessionDate:input.sessionDate,operationDate:input.operationDate,fetcher:input.fetcher,...(input.pdfText?{pdfText:input.pdfText}:{})}).catch(()=>null),collectUSAttention(input.sessionDate,input.fetcher).catch(()=>null),collectAIBellwethers([input.sessionDate],input.fetcher,US_MEGACAPS).catch(()=>null)]);
    if(mega)record(input.audit,mega.audit.map(item=>({...item,sourceId:item.sourceId.replace('ai-bellwethers','megacaps')})),'US_MARKET',input.at,input.sessionDate);
    // A 3%+ move in one of the largest companies is market news even when it is not trending.
    const bigMovers=(mega?.stocks??[]).filter(stock=>Math.abs(stock.changePct)>=3);
    if(bundle)record(input.audit,bundle.audit,'US_MARKET',input.at,null);
    if(attention)record(input.audit,attention.audit,'US_MARKET',input.at,input.sessionDate);
    const usBriefed=Boolean(bundle?.briefs.some(brief=>brief.statements.some(item=>item.region==='US')));
    // Direction check only when the three indexes agree; a mixed session has no single direction to contradict.
    const agreed=input.indexChanges.length&&(input.indexChanges.every(value=>value>0.005)||input.indexChanges.every(value=>value<-0.005));
    const sp=agreed?input.indexChanges.reduce((sum,value)=>sum+value,0)/input.indexChanges.length:null;
    const wire=usBriefed||!wireFallbackAllowed(input.at)?null:await collectWireCloses({region:'US',sessionDate:input.sessionDate,change:sp,fetcher:input.fetcher}).catch(()=>null);
    if(wire)record(input.audit,wire.audit,'US_MARKET',input.at,input.sessionDate);
    // Companies the brokers or wires name for this session are priced too: a 3%+ move there is the story
    // (e.g. '인텔 29% 급락') even when the company is neither trending nor among the largest.
    const commentary=[...(bundle?.briefs??[]).flatMap(brief=>brief.statements.filter(item=>item.region==='US').map(item=>item.text)),...(wire?.reports??[]).flatMap(report=>[report.title,report.sentence??''])].join('\n');
    const known=new Set([...(attention?.stocks??[]),...(mega?.stocks??[])].map(stock=>stock.symbol));
    const mentioned=new Set(Object.entries(US_KOREAN_NAMES).filter(([,name])=>name.length>=2&&!/^[A-Z&]+$/.test(name)&&new RegExp(`(?<![가-힣])${name}(?![가-힣]{2})`).test(commentary)).map(([symbol])=>symbol.replace('_','-')));
    const namedSymbols=[...new Set(Object.entries(US_KOREAN_NAMES).filter(([symbol,name])=>name.length>=2&&!known.has(symbol)&&!/^[A-Z&]+$/.test(name)&&new RegExp(`(?<![가-힣])${name}(?![가-힣]{2})`).test(commentary)).map(([symbol])=>symbol.replace('_','-')))].slice(0,8);
    const named=namedSymbols.length?await collectAIBellwethers([input.sessionDate],input.fetcher,namedSymbols).catch(()=>null):null;
    if(named)record(input.audit,named.audit.map(item=>({...item,sourceId:item.sourceId.replace('ai-bellwethers','named-stocks')})),'US_MARKET',input.at,input.sessionDate);
    const newsMovers=(named?.stocks??[]).filter(stock=>Math.abs(stock.changePct)>=3).map(stock=>({...stock,inNews:true}));
    // A trending or megacap stock the commentary names, with a 3%+ move, is flagged the same way.
    const flag=<T extends {symbol:string;changePct:number}>(stock:T)=>mentioned.has(stock.symbol)&&Math.abs(stock.changePct)>=3?{...stock,inNews:true}:stock;
    const attentionStocks=(attention?.stocks??[]).map(stock=>flag(bigMovers.some(item=>item.symbol===stock.symbol)?{...stock,bigMover:true}:stock));
    const stocks=[...newsMovers,...bigMovers.filter(item=>!attentionStocks.some(stock=>stock.symbol===item.symbol)).map(item=>flag({...item,bigMover:true})),...attentionStocks];
    const composition=composeUSDeepSections({bundle,stocks,sectors:attention?.sectors??[],wire:wire?.reports??[],checkpoint:'다음 정규장에서는 미국 10년물 금리 방향과 함께, 증권사들이 짚은 경계 요인이 주요 지수와 업종 등락에 실제로 반영되는지가 확인 대상이다.'});
    const sources=[...composition.sources];
    if(composition.sections.some(section=>section.key==='us-sectors-stocks')){sources.push({label:'Yahoo Finance 검색 상위 종목',url:YAHOO_TRENDING,publisher:'Yahoo Finance'});for(const url of attention?.stockUrls??[])sources.push({label:'Yahoo Finance 종목 일별 종가',url,publisher:'Yahoo Finance'});if(bigMovers.length)for(const url of mega?.urls??[])sources.push({label:'Yahoo Finance 미국 시가총액 상위 종목 일별 종가',url,publisher:'Yahoo Finance'});if(newsMovers.length)for(const url of named?.urls??[])sources.push({label:'Yahoo Finance 리포트·기사 언급 종목 일별 종가',url,publisher:'Yahoo Finance'})}
    if(composition.sections.some(section=>section.key==='us-sectors-stocks'))for(const url of attention?.sectorUrls??[])sources.push({label:'Yahoo Finance SPDR 업종 ETF 일별 종가',url,publisher:'Yahoo Finance'});
    recordListed(input.audit,sources,'US_MARKET',input.at);
    const ups=input.indexChanges.filter(value=>value>0.005).length,downs=input.indexChanges.filter(value=>value<-0.005).length;
    const indexPhrase=ups===input.indexChanges.length?'3대 지수 상승':downs===input.indexChanges.length?'3대 지수 하락':'3대 지수 혼조';
    return {composition,title:composition.titleFocus?`뉴욕증시 ${indexPhrase}…${composition.titleFocus}`:null,sources};
  }catch{return empty}
}

export async function collectKoreaDeep(input:{sessionDate:string;operationDate:string;at:string;fetcher:typeof fetch;audit:AuditSink[];pdfText?:PdfTextReader;kospiClose:number;kospiChangePct:number|null}):Promise<DeepCollection>{
  const empty:DeepCollection={composition:{sections:[],leadAddition:[],titleFocus:null,sources:[]},title:null,sources:[]};
  try{
    // The search ranking comes first so the research intake can fetch ratings for exactly those stocks.
    const search=await collectKoreaSearchTop(input.sessionDate,input.fetcher).catch(()=>null);
    const bundle=await collectBrokerResearch({sessionDate:input.sessionDate,operationDate:input.operationDate,fetcher:input.fetcher,verifiedKospiClose:input.kospiClose,focusCodes:(search?.stocks??[]).map(stock=>stock.code),...(input.pdfText?{pdfText:input.pdfText}:{})}).catch(()=>null);
    if(bundle)record(input.audit,bundle.audit,'KOREA_MARKET',input.at,null);
    if(search)record(input.audit,search.audit,'KOREA_MARKET',input.at,input.sessionDate);
    const krBriefed=Boolean(bundle?.briefs.some(brief=>brief.statements.some(item=>item.region==='KOREA')));
    const wire=krBriefed||!wireFallbackAllowed(input.at)?null:await collectWireCloses({region:'KOREA',sessionDate:input.sessionDate,change:input.kospiChangePct,fetcher:input.fetcher}).catch(()=>null);
    if(wire)record(input.audit,wire.audit,'KOREA_MARKET',input.at,input.sessionDate);
    const composition=composeKoreaDeepSections({bundle,searchTop:search?.stocks??[],wire:wire?.reports??[],checkpoint:'오늘 장에서는 외국인·기관 수급의 연속성, 원·달러 환율, 전일 강세 업종이 이어지는지가 확인 대상이다.'});
    const sources=[...composition.sources];
    if(composition.sections.some(section=>section.key==='korea-stocks')){sources.push({label:'네이버페이 증권 검색 상위 종목',url:NAVER_SEARCH_TOP,publisher:'네이버페이 증권'});for(const stock of search?.stocks??[])sources.push({label:`네이버페이 증권 ${stock.name} 일별 시세`,url:stock.url,publisher:'네이버페이 증권'})}
    recordListed(input.audit,sources,'KOREA_MARKET',input.at);
    const change=input.kospiChangePct,level=new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(Math.floor(input.kospiClose));
    // '코스피 1.24% 내려 5,937…검색 1위 삼성전자 4.8% 하락': the index verb differs from the stock's, so the headline does not repeat '하락…하락'.
    const verb:Record<string,string>={상승:'올라',하락:'내려',급등:'급등해',급락:'급락해',보합:'보합'};
    const head=change===null?null:`코스피 ${Math.abs(change).toFixed(2)}% ${verb[indexMove(change)]??indexMove(change)} ${level}`;
    return {composition,title:head&&composition.titleFocus?`${head}…${composition.titleFocus}`:null,sources};
  }catch{return empty}
}

export async function collectAIDeep(input:{operationDate:string;candidateUSSessions:string[];at:string;fetcher:typeof fetch;audit:AuditSink[];pdfText?:PdfTextReader}):Promise<DeepCollection>{
  const empty:DeepCollection={composition:{sections:[],leadAddition:[],titleFocus:null,sources:[]},title:null,sources:[]};
  try{
    const previous=new Date(Date.parse(input.operationDate+'T00:00:00Z')-86400000).toISOString().slice(0,10);
    const [bundle,bellwethers]=await Promise.all([collectBrokerResearch({sessionDate:previous,operationDate:input.operationDate,fetcher:input.fetcher,...(input.pdfText?{pdfText:input.pdfText}:{})}).catch(()=>null),collectAIBellwethers(input.candidateUSSessions,input.fetcher).catch(()=>null)]);
    if(bundle)record(input.audit,bundle.audit,'AI_INTELLIGENCE',input.at,null);
    if(bellwethers)record(input.audit,bellwethers.audit,'AI_INTELLIGENCE',input.at,bellwethers.sessionDate??previous);
    const composition=composeAIDeepSections({bundle,stocks:bellwethers?.stocks??[],sessionDate:bellwethers?.sessionDate??null});
    const sources=[...composition.sources];
    if(composition.sections.some(section=>section.key==='ai-stocks'))for(const url of bellwethers?.urls??[])sources.push({label:'Yahoo Finance AI 대표 종목 일별 종가',url,publisher:'Yahoo Finance'});
    recordListed(input.audit,sources,'AI_INTELLIGENCE',input.at);
    return {composition,title:composition.titleFocus?`${composition.titleFocus}…증권가가 짚은 AI 투자 쟁점`:null,sources};
  }catch{return empty}
}

/** Collection wrapper that turns broker research and attention signals into audited deep sections. */
import type {DailyCategory} from './daily-orchestrator.js';
import {collectBrokerResearch,type BrokerAudit,type PdfTextReader} from './broker-briefs.js';
import {collectAIBellwethers,collectKoreaSearchTop,collectUSAttention,NAVER_SEARCH_TOP,YAHOO_TRENDING,type AttentionAudit} from './market-attention.js';
import {collectWireCloses} from './market-wire.js';
import {composeAIDeepSections,composeKoreaDeepSections,composeUSDeepSections,indexMove,type DeepComposition} from './market-deep-sections.js';

interface AuditSink {sourceId:string;category:DailyCategory;url:string;status:'PASS'|'FAILED';recordCount:number;collectedAt:string;error:string|null;observedDate?:string}
export interface DeepCollection {composition:DeepComposition;title:string|null;sources:Array<{label:string;url:string;publisher:string}>}

/** Reports cited from a fetched consensus list (not opened as PDFs) are verified as listed on that page. */
/** Reports cited from a fetched consensus list (not opened as PDFs) are verified as listed on that page; the audit keeps each report's own date. */
function recordListed(audit:AuditSink[],sources:Array<{url:string;date?:string}>,category:DailyCategory,at:string){
  const passed=new Set(audit.filter(item=>item.status==='PASS').map(item=>item.url));
  for(const source of sources)if(source.url.startsWith('https://consensus.hankyung.com/analysis/downpdf')&&!passed.has(source.url)){audit.push({sourceId:'deep:consensus:listed:'+source.url.split('=').pop(),category,url:source.url,status:'PASS',recordCount:1,collectedAt:at,error:null,...(source.date?{observedDate:source.date}:{})});passed.add(source.url)}
}

/** Broker entries carry their report date; market data entries carry the covered session; list pages carry none. */
function record(audit:AuditSink[],items:Array<BrokerAudit|AttentionAudit>,category:DailyCategory,at:string,sessionDate:string|null){
  for(const item of items){const date=(item as BrokerAudit).date??sessionDate;audit.push({sourceId:'deep:'+item.sourceId,category,url:item.url,status:item.status,recordCount:item.count,collectedAt:at,error:item.error,...(item.status==='PASS'&&date?{observedDate:date}:{})})}
}

/** Never throws: missing research or rankings only drop the corresponding sections. */
export async function collectUSDeep(input:{sessionDate:string;operationDate:string;at:string;fetcher:typeof fetch;audit:AuditSink[];pdfText?:PdfTextReader;indexChanges:number[]}):Promise<DeepCollection>{
  const empty:DeepCollection={composition:{sections:[],leadAddition:[],titleFocus:null,sources:[]},title:null,sources:[]};
  try{
    const [bundle,attention]=await Promise.all([collectBrokerResearch({sessionDate:input.sessionDate,operationDate:input.operationDate,fetcher:input.fetcher,...(input.pdfText?{pdfText:input.pdfText}:{})}).catch(()=>null),collectUSAttention(input.sessionDate,input.fetcher).catch(()=>null)]);
    if(bundle)record(input.audit,bundle.audit,'US_MARKET',input.at,null);
    if(attention)record(input.audit,attention.audit,'US_MARKET',input.at,input.sessionDate);
    const usBriefed=Boolean(bundle?.briefs.some(brief=>brief.statements.some(item=>item.region==='US')));
    // Direction check only when the three indexes agree; a mixed session has no single direction to contradict.
    const agreed=input.indexChanges.length&&(input.indexChanges.every(value=>value>0.005)||input.indexChanges.every(value=>value<-0.005));
    const sp=agreed?input.indexChanges.reduce((sum,value)=>sum+value,0)/input.indexChanges.length:null;
    const wire=usBriefed?null:await collectWireCloses({region:'US',sessionDate:input.sessionDate,change:sp,fetcher:input.fetcher}).catch(()=>null);
    if(wire)record(input.audit,wire.audit,'US_MARKET',input.at,input.sessionDate);
    const composition=composeUSDeepSections({bundle,stocks:attention?.stocks??[],sectors:attention?.sectors??[],wire:wire?.reports??[],checkpoint:'다음 정규장에서는 미국 10년물 금리 방향과 함께, 증권사들이 짚은 경계 요인이 주요 지수와 업종 등락에 실제로 반영되는지가 확인 대상이다.'});
    const sources=[...composition.sources];
    if(composition.sections.some(section=>section.key==='us-sectors-stocks')){sources.push({label:'Yahoo Finance 검색 상위 종목',url:YAHOO_TRENDING,publisher:'Yahoo Finance'});for(const url of attention?.stockUrls??[])sources.push({label:'Yahoo Finance 종목 일별 종가',url,publisher:'Yahoo Finance'})}
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
    const [bundle,search]=await Promise.all([collectBrokerResearch({sessionDate:input.sessionDate,operationDate:input.operationDate,fetcher:input.fetcher,verifiedKospiClose:input.kospiClose,...(input.pdfText?{pdfText:input.pdfText}:{})}).catch(()=>null),collectKoreaSearchTop(input.sessionDate,input.fetcher).catch(()=>null)]);
    if(bundle)record(input.audit,bundle.audit,'KOREA_MARKET',input.at,null);
    if(search)record(input.audit,search.audit,'KOREA_MARKET',input.at,input.sessionDate);
    const krBriefed=Boolean(bundle?.briefs.some(brief=>brief.statements.some(item=>item.region==='KOREA')));
    const wire=krBriefed?null:await collectWireCloses({region:'KOREA',sessionDate:input.sessionDate,change:input.kospiChangePct,fetcher:input.fetcher}).catch(()=>null);
    if(wire)record(input.audit,wire.audit,'KOREA_MARKET',input.at,input.sessionDate);
    const composition=composeKoreaDeepSections({bundle,searchTop:search?.stocks??[],wire:wire?.reports??[],checkpoint:'오늘 장에서는 외국인·기관 수급의 연속성, 원·달러 환율, 전일 강세 업종이 이어지는지가 확인 대상이다.'});
    const sources=[...composition.sources];
    if(composition.sections.some(section=>section.key==='korea-stocks')){sources.push({label:'네이버페이 증권 검색 상위 종목',url:NAVER_SEARCH_TOP,publisher:'네이버페이 증권'});for(const stock of search?.stocks??[])sources.push({label:`네이버페이 증권 ${stock.name} 일별 시세`,url:stock.url,publisher:'네이버페이 증권'})}
    recordListed(input.audit,sources,'KOREA_MARKET',input.at);
    const change=input.kospiChangePct,level=new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(Math.floor(input.kospiClose));
    const head=change===null?null:`코스피 ${Math.abs(change).toFixed(2)}% ${indexMove(change)} ${level}`;
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
    return {composition,title:null,sources};
  }catch{return empty}
}

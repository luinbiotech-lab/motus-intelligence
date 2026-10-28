import type {AIIntelligenceDailyViewModel,KoreaMarketDailyViewModel,USMarketDailyViewModel,DailyMasterRenderResult} from '../intelligence/daily-masters.js';
import type {NewsletterSourceLink} from '../intelligence/newsletter.js';
import {MOTUS_DISPLAY_NAME} from '../content/publisher-schema.js';
import {renderMarketTrendSection} from './motus.js';
import {assertNewsletterPublicHtmlSafe} from './motus-newsletter.js';

const BODY='font-family:Arial,&quot;Noto Sans KR&quot;,sans-serif;color:#172033;line-height:1.78;font-size:17px;width:100%;max-width:820px;box-sizing:border-box;margin:0 auto;overflow-x:hidden;overflow-wrap:anywhere';
const SECTION='width:100%;max-width:100%;box-sizing:border-box;margin:26px 0 0';
const HEADING='margin:0 0 12px;padding:0 0 8px;border-bottom:2px solid #173a63;color:#03162e;font-size:clamp(19px,4.8vw,23px);line-height:1.35;font-weight:850;word-break:keep-all;overflow-wrap:normal';
const LINK='color:#0759a6;text-decoration:underline;text-underline-offset:2px;font-weight:700;overflow-wrap:anywhere';

export const BLOGGER_EDITORIAL_MASTER={id:'BLOGGER_EDITORIAL_ARTICLE',version:'4Q.1.0',defaultForNewPublications:true,forbiddenPublicLabels:['왜 중요한가','무슨 일이 있었나','산업 연결','시장 연결','핵심 내용']} as const;
export const BLOGGER_EDITORIAL_CATEGORIES={
  AI_INTELLIGENCE:{canonicalLabel:'ai-intelligence',publicLabel:'AI 인텔리전스'},
  US_MARKET:{canonicalLabel:'us-market',publicLabel:'미국증시'},
  KOREA_MARKET:{canonicalLabel:'korea-market',publicLabel:'국내증시'}
} as const;

export function renderAIEditorialArticle(view:AIIntelligenceDailyViewModel):DailyMasterRenderResult {
  const seen=new Set<string>([normalized(view.todayCore.summary)]),parts=[masthead(view.title,view.subtitle,view.displayLabel,view.issueDate),lead(view.todayCore.summary)];
  for(const issue of view.issues){const content=paragraphs(uniqueProse([...issue.whatHappened,issue.coreContent,issue.whyItMatters??'',issue.marketConnection??''],seen));if(content)parts.push(section(issue.headline,content));}
  const connections=paragraphs(uniqueProse(view.industryConnections.flatMap(item=>[item.explanation,item.optionalWatchPoint??'']),seen));if(connections)parts.push(section('기업 AI가 실제 업무로 들어가는 경로',connections));
  const watch=paragraphs(uniqueProse(view.whatToWatch.map(item=>`${item.headline}: ${item.watchFor}`),seen));if(watch)parts.push(section('앞으로 볼 지점',watch));
  parts.push(sources(view.sources));return finish('ai-intelligence',view.title,BLOGGER_EDITORIAL_CATEGORIES.AI_INTELLIGENCE.publicLabel,parts,['masthead','lead','issues','connections','watch','sources']);
}

export function renderUSEditorialArticle(view:USMarketDailyViewModel):DailyMasterRenderResult {
  const terms=new Set<string>();const describe=(value:string)=>explainTerms(value,terms);
  const parts=[masthead(view.title,view.subtitle,view.displayLabel,view.issueDate),lead(describe([view.marketSummary,...view.marketCommentary].join(' ')))];
  const period=view.marketHistory.sessionCount>=60?'3개월':`${view.marketHistory.sessionCount}거래일`;
  parts.push(renderMarketTrendSection(view.marketHistory).replace('미국 주요 증시 추이',`미국 주요지수 ${period} 흐름`));
  if(view.supportingMetrics.length)parts.push(section('금리·달러·변동성',`<p style="margin:0">${view.supportingMetrics.map(item=>`${esc(describe(item.label))} ${esc(item.value)}${item.change?` (${esc(item.change)})`:''}`).join(' · ')}</p>`));
  if(view.narrative?.facts.length)parts.push(section('지수별 흐름과 위치',paragraphs(view.narrative.facts)));
  if(view.narrative?.analysis.length)parts.push(section('MOTUS 분석',paragraphs(view.narrative.analysis)));
  if(view.sectorsCompanies.length)parts.push(section('종목과 업종에서 읽힌 신호',paragraphs(view.sectorsCompanies)));
  if(view.wallStreetResearch.length)parts.push(section('실적 기대와 금리의 줄다리기',paragraphs(view.wallStreetResearch.flatMap(item=>[item.institutionView??'',item.motusInterpretation??'']))));
  if(view.marketResearch?.length)parts.push(section('금융 전문 언론 원문 모니터링',paragraphs(view.marketResearch.map(item=>item.publisher+' · '+item.publishedAt.slice(0,10)+' · 공개 기사 제목: '+item.headline))));
  if(view.checkpoints.length)parts.push(section('다음 거래일',paragraphs(view.checkpoints.map(item=>`${item.headline}: ${item.watchFor}`))));
  parts.push(sources(view.sources));return finish('us-market',view.title,BLOGGER_EDITORIAL_CATEGORIES.US_MARKET.publicLabel,parts,['masthead','lead','charts','macro','companies','research','watch','sources']);
}

export function renderKoreaEditorialArticle(view:KoreaMarketDailyViewModel):DailyMasterRenderResult {
  const parts=[masthead(view.title,view.subtitle,view.displayLabel,view.issueDate),lead(view.marketSummary)];
  if(view.marketCommentary.length)parts.push(section(view.edition==='PREVIOUS_SESSION_MORNING'?'전일 장을 읽는 기준':'마감 흐름을 읽는 기준',paragraphs(view.marketCommentary)));
  if(view.indexMetrics.length)parts.push(section('코스피와 코스닥',metricProse(view.indexMetrics)));
  if(view.narrative?.facts.length)parts.push(section('지수 흐름',paragraphs(view.narrative.facts)));
  if(view.fxAndSupporting.length)parts.push(section('환율과 시장 여건',metricProse(view.fxAndSupporting)));
  if(view.investorFlows.length)parts.push(section('수급이 가리킨 방향',flow(view.investorFlows)));
  if(view.sectors.length||view.movers.length)parts.push(section('업종과 종목의 온도차',metricProse([...view.sectors,...view.movers])));
  if(view.narrative?.analysis.length)parts.push(section('MOTUS 분석',paragraphs(view.narrative.analysis)));
  if(view.research.length)parts.push(section('증권사 시각',paragraphs(view.research.map(item=>`${item.publisher}: ${item.institutionView}`))));
  if(view.marketResearch?.length)parts.push(section('국내 금융 언론 원문 모니터링',paragraphs(view.marketResearch.map(item=>item.publisher+' · '+item.publishedAt.slice(0,10)+' · 공개 기사 제목: '+item.headline))));
  if(view.checkpoints.length)parts.push(section(view.edition==='PREVIOUS_SESSION_MORNING'?'오늘 체크포인트':'다음 거래일',paragraphs(view.checkpoints.map(item=>`${item.headline}: ${item.watchFor}`))));
  parts.push(sources(view.sources));return finish('korea-market',view.title,BLOGGER_EDITORIAL_CATEGORIES.KOREA_MARKET.publicLabel,parts,['masthead','lead','indexes','fx','flows','sectors','research','watch','sources']);
}

function masthead(title:string,subtitle:string,label:string,date:string){return `<header style="width:100%;max-width:100%;box-sizing:border-box;background:#03162e;color:#fff;padding:26px 22px;margin:0 0 22px"><p style="margin:0 0 9px;color:#c7d8ea;font-size:14px;font-weight:800">${esc(MOTUS_DISPLAY_NAME)}</p><div role="heading" aria-level="2" style="font-size:clamp(25px,7vw,34px);line-height:1.22;font-weight:850;word-break:keep-all">${esc(title)}</div><p style="margin:10px 0 0;color:#e6edf5">${esc(subtitle)}</p><p style="margin:11px 0 0;color:#b7c8da;font-size:13px">${esc(label)} · ${esc(date)}</p></header>`;}
function lead(value:string){return `<p data-section="editorial-lead" style="margin:0 0 24px;font-size:18px;line-height:1.82;color:#172033">${esc(value)}</p>`;}
function section(title:string,content:string){return `<section style="${SECTION}"><h2 style="${HEADING}">${esc(title)}</h2>${content}</section>`;}
function paragraphs(values:string[]){return values.map(value=>value.trim()).filter(Boolean).map(value=>`<p style="margin:0 0 13px">${esc(value)}</p>`).join('');}
function uniqueProse(values:string[],seen:Set<string>):string[]{const result:string[]=[];for(const value of values){const key=normalized(value);if(!key||seen.has(key))continue;seen.add(key);result.push(value)}return result}
function normalized(value:string){return value.replace(/\s+/g,' ').trim()}
function metricProse(values:Array<{label:string;displayValue:string}>){return `<p style="margin:0">${values.map(item=>`${esc(item.label)} ${esc(item.displayValue)}`).join(' · ')}</p>`;}
function flow(values:Array<{label:string;displayValue:string;direction:'UP'|'DOWN'|'FLAT'}>){const max=Math.max(...values.map(item=>Math.abs(Number(item.displayValue.replace(/[^0-9.-]/g,'')))),1);return `<div data-visualization="korea-investor-flow" style="width:100%;max-width:100%;box-sizing:border-box">${values.map(item=>{const size=Math.max(4,Math.round(Math.abs(Number(item.displayValue.replace(/[^0-9.-]/g,'')))/max*46));const color=item.direction==='UP'?'#c62828':item.direction==='DOWN'?'#1565c0':'#59697d';return `<div style="margin:0 0 12px;width:100%;max-width:100%;box-sizing:border-box"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><strong>${esc(item.label)}</strong><span style="color:${color};font-weight:800">${esc(item.displayValue)}</span></div><div style="height:8px;background:#eef2f6"><span style="display:block;width:${size}%;height:100%;background:${color}"></span></div></div>`;}).join('')}</div>`;}
function sources(values:NewsletterSourceLink[]){const unique=[...new Map(values.map(item=>[item.url,item])).values()];return section('자료',`<ul style="margin:0;padding-left:20px">${unique.map(item=>`<li style="margin:5px 0"><a href="${attr(item.url)}" target="_blank" rel="nofollow noopener noreferrer" style="${LINK}">${esc(item.label)}</a></li>`).join('')}</ul>`);}
function finish(product:string,title:string,label:string,parts:string[],renderedSections:string[]):DailyMasterRenderResult {const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head><body><article data-product="motus-${product}" data-layout="editorial-article-4q" style="${BODY}">${parts.join('\n')}</article></body></html>`;assertNewsletterPublicHtmlSafe(html);for(const forbidden of BLOGGER_EDITORIAL_MASTER.forbiddenPublicLabels)if(new RegExp(`>${forbidden}<`).test(html))throw new Error(`forbidden public analytical label: ${forbidden}`);return {html,renderedSections,label};}
function esc(value:string){return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}function attr(value:string){return esc(value).replace(/'/g,'&#39;');}
function explainTerms(value:string,seen:Set<string>):string {const terms:[string,string][]=[['VIX','VIX (변동성지수)'],['DXY','DXY (달러인덱스)'],['미국 10년물','U.S. 10Y Treasury Yield (미국 10년물 국채금리)']];let output=value;for(const [term,label] of terms){if(seen.has(term))continue;if(output.includes(label)){seen.add(term);continue;}const index=output.indexOf(term);if(index<0)continue;output=`${output.slice(0,index)}${label}${output.slice(index+term.length)}`;seen.add(term);}return output;}

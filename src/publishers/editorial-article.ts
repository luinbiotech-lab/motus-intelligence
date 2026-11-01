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
  // The day's market issue and AI stock moves lead; official announcements follow.
  for(const item of (view.deepSections??[]).filter(item=>item.placement==='early'))parts.push(deepSection(item));
  // With the day's market issue explained by brokers, official announcements are reported as facts only:
  // the per-type template readings ('MOTUS 분석: …', '시장 평가는 … 판단해야 한다') and generic watch lists read as boilerplate.
  const issueLed=(view.deepSections??[]).some(item=>item.key==='ai-issue');
  for(const issue of view.issues){const content=paragraphs(uniqueProse(issueLed?[...issue.whatHappened,issue.coreContent]:[...issue.whatHappened,issue.coreContent,issue.whyItMatters??'',issue.marketConnection??''],seen));if(content)parts.push(section(issue.headline,content));}
  for(const item of (view.deepSections??[]).filter(item=>item.placement!=='early'))parts.push(deepSection(item));
  if(!issueLed){
    const connections=paragraphs(uniqueProse(view.industryConnections.flatMap(item=>[item.explanation,item.optionalWatchPoint??'']),seen));if(connections)parts.push(section('기업 AI가 실제 업무로 들어가는 경로',connections));
    const watch=paragraphs(uniqueProse(view.whatToWatch.map(item=>`${item.headline}: ${item.watchFor}`),seen));if(watch)parts.push(section('앞으로 볼 지점',watch));
  }
  parts.push(sources(view.sources));return finish('ai-intelligence',view.title,BLOGGER_EDITORIAL_CATEGORIES.AI_INTELLIGENCE.publicLabel,parts,['masthead','lead','issues','connections','watch','sources']);
}

export function renderUSEditorialArticle(view:USMarketDailyViewModel):DailyMasterRenderResult {
  const terms=new Set<string>();const describe=(value:string)=>explainTerms(value.replace('U.S. 10Y Treasury Yield (미국 10년물 국채금리)','미국 10년물 국채금리'),terms);
  const parts=[masthead(view.title,view.subtitle,view.displayLabel,view.issueDate),lead(describe([view.marketSummary,...view.marketCommentary].join(' ')))];
  const deep=view.deepSections??[],place=(where:'early'|'late'|'risks')=>deep.filter(item=>(item.placement??'early')===where).map(deepSection);
  parts.push(...place('early'));
  const period=view.marketHistory.sessionCount>=60?'3개월':`${view.marketHistory.sessionCount}거래일`;
  parts.push(renderMarketTrendSection(view.marketHistory).replace('미국 주요 증시 추이',`미국 주요지수 ${period} 흐름`));
  if(view.supportingMetrics.length)parts.push(section('금리·달러·변동성',`<p style="margin:0">${view.supportingMetrics.map(item=>`${esc(describe(item.label))} ${esc(item.value)}${item.change?` (${esc(item.change)})`:''}`).join(' · ')}</p>`));
  if(view.narrative?.facts.length)parts.push(section('지수별 흐름과 위치',paragraphs(view.narrative.facts)));
  if(view.narrative?.analysis.length)parts.push(section('MOTUS 분석',paragraphs(view.narrative.analysis)));
  parts.push(...place('late'));
  if(view.sectorsCompanies.length)parts.push(section('종목과 업종에서 읽힌 신호',paragraphs(view.sectorsCompanies)));
  if(view.marketResearch?.length)parts.push(renderMarketResearchEntries(view.marketResearch,view.issueDate));
  const risks=place('risks');
  if(risks.length)parts.push(...risks);else if(view.checkpoints.length)parts.push(section('다음 거래일',paragraphs(view.checkpoints.map(item=>`${item.headline}: ${item.watchFor}`))));
  parts.push(sources(view.sources));return finish('us-market',view.title,BLOGGER_EDITORIAL_CATEGORIES.US_MARKET.publicLabel,parts,['masthead','lead','charts','macro','companies','research','watch','sources']);
}

export function renderKoreaEditorialArticle(view:KoreaMarketDailyViewModel):DailyMasterRenderResult {
  const parts=[masthead(view.title,view.subtitle,view.displayLabel,view.issueDate),lead(view.marketSummary)];
  const deep=view.deepSections??[],place=(where:'early'|'late'|'risks')=>deep.filter(item=>(item.placement??'early')===where).map(deepSection);
  parts.push(...place('early'));
  if(view.marketCommentary.length&&!deep.length)parts.push(section(view.edition==='PREVIOUS_SESSION_MORNING'?'전일 장을 읽는 기준':'마감 흐름을 읽는 기준',paragraphs(view.marketCommentary)));
  if(view.indexMetrics.length)parts.push(section('코스피와 코스닥',metricProse(view.indexMetrics)));
  if(view.narrative?.facts.length)parts.push(section('지수 흐름',paragraphs(view.narrative.facts)));
  if(view.fxAndSupporting.length)parts.push(section('환율과 시장 여건',metricProse(view.fxAndSupporting)));
  if(view.investorFlows.length)parts.push(section('투자자별 순매수 (원천 자료 기준)',`<div data-visualization="korea-investor-flow">${metricProse(view.investorFlows.map(item=>({label:item.label,displayValue:item.displayValue})))}</div>`));
  if(view.sectors.length)parts.push(section('업종별 등락',metricProse(view.sectors)));
  const ordinaryMovers=view.movers.filter(item=>!isStructuredLeveragedProduct(item.label));
  if(ordinaryMovers.length)parts.push(section('주요 종목 흐름',metricProse(ordinaryMovers)));
  if(view.narrative?.analysis.length)parts.push(section('MOTUS 분석',paragraphs(view.narrative.analysis)));
  parts.push(...place('late'));
  if(view.marketResearch?.length)parts.push(renderMarketResearchEntries(view.marketResearch,view.operationDate??view.issueDate));
  const risks=place('risks');
  if(risks.length)parts.push(...risks);else if(view.checkpoints.length)parts.push(section(view.edition==='PREVIOUS_SESSION_MORNING'?'오늘 체크포인트':'다음 거래일',paragraphs(view.checkpoints.map(item=>`${item.headline}: ${item.watchFor}`))));
  if(view.marketCommentary.length&&deep.length)parts.push(section('자료 기준',paragraphs(view.marketCommentary)));
  parts.push(sources(view.sources));return finish('korea-market',view.title,BLOGGER_EDITORIAL_CATEGORIES.KOREA_MARKET.publicLabel,parts,['masthead','lead','indexes','fx','flows','sectors','research','watch','sources']);
}

/** Show what the publisher actually published, without manufacturing a brokerage opinion.
 * Report dates older than a week are reference context, never same-session commentary. */
export function renderMarketResearchEntries(entries:ReadonlyArray<{publisher:string;headline:string;url:string;publishedAt:string;kind:'FINANCIAL_MEDIA'|'BROKER_RESEARCH';evidence?:string[]}>,issueDate:string):string {
 const issued=Date.parse(issueDate+'T23:59:59Z');
 // Material older than a week is not about this session and only crowds the article.
 const filtered=entries.filter(item=>/^https:\/\/[^\s]+$/.test(item.url)&&Number.isFinite(Date.parse(item.publishedAt))&&Date.parse(item.publishedAt)<=issued&&issued-Date.parse(item.publishedAt)<=8*86400000);
 const make=(kind:'FINANCIAL_MEDIA'|'BROKER_RESEARCH')=>{
  const rows=filtered.filter(item=>item.kind===kind&&item.headline.trim().length>=8);if(!rows.length)return '';
  const list=rows.map(item=>{
   const age=Math.floor((issued-Date.parse(item.publishedAt))/86400000),older=age>7;
   const title=item.headline;
   return `<li style="margin:0 0 11px"><strong>${esc(item.publisher)}</strong> · ${esc(item.publishedAt.slice(0,10))}${older?' · 과거 자료':''}<div><a href="${attr(item.url)}" target="_blank" rel="nofollow noopener noreferrer" style="${LINK}">${esc(title)}</a></div>${kind==='BROKER_RESEARCH'&&item.evidence?.length?`<p style="margin:6px 0 0">공식 공개 요약: ${esc(item.evidence.slice(0,2).join(' / '))}</p>`:''}</li>`;
  }).join('');
  return section(kind==='BROKER_RESEARCH'?'증권사 공개 리서치 자료':'금융 전문 언론 원문',`<p style="margin:0 0 12px">${kind==='BROKER_RESEARCH'?'증권사가 공식 사이트에 최근 일주일 안에 공개한 자료의 제목과 발행일이다.':'해외·국내 금융 매체가 같은 시기에 보도한 시장 기사다. 해외 기사는 원문 제목을 그대로 적었다.'}</p><ul style="margin:0;padding-left:20px">${list}</ul>`);
 };
 return make('BROKER_RESEARCH')+make('FINANCIAL_MEDIA');
}

/** Attributed expert/search-ranked section: each paragraph keeps a visible link to its own source document. */
export function deepSection(item:{key:string;title:string;intro?:string;paragraphs:Array<{text:string;source?:{label:string;url:string;kind?:'article'}}>}):string {
  const body=item.paragraphs.filter(p=>p.text.trim()).map(p=>`<p style="margin:0 0 13px">${esc(p.text)}${p.source&&/^https:\/\//.test(p.source.url)?` <a href="${attr(p.source.url)}" target="_blank" rel="nofollow noopener noreferrer" style="${LINK};font-size:14px">${p.source.kind==='article'?'[기사 원문]':'[리포트 원문]'}</a>`:''}</p>`).join('');
  return `<section data-section="${attr(item.key)}" style="${SECTION}"><h2 style="${HEADING}">${esc(item.title)}</h2>${item.intro?`<p style="margin:0 0 12px;color:#4a5a6e;font-size:15px">${esc(item.intro)}</p>`:''}${body}</section>`;
}
function masthead(title:string,subtitle:string,label:string,date:string){return `<header style="width:100%;max-width:100%;box-sizing:border-box;background:#03162e;color:#fff;padding:26px 22px;margin:0 0 22px"><p style="margin:0 0 9px;color:#c7d8ea;font-size:14px;font-weight:800">${esc(MOTUS_DISPLAY_NAME)}</p><div role="heading" aria-level="2" style="font-size:clamp(25px,7vw,34px);line-height:1.22;font-weight:850;word-break:keep-all">${esc(title)}</div><p style="margin:10px 0 0;color:#e6edf5">${esc(subtitle)}</p><p style="margin:11px 0 0;color:#b7c8da;font-size:13px">${esc(label)} · ${esc(date)}</p></header>`;}
function lead(value:string){return `<p data-section="editorial-lead" style="margin:0 0 24px;font-size:18px;line-height:1.82;color:#172033">${esc(value)}</p>`;}
function section(title:string,content:string){return `<section style="${SECTION}"><h2 style="${HEADING}">${esc(title)}</h2>${content}</section>`;}
function paragraphs(values:string[]){return values.map(value=>value.trim()).filter(Boolean).map(value=>`<p style="margin:0 0 13px">${esc(value)}</p>`).join('');}
function uniqueProse(values:string[],seen:Set<string>):string[]{const result:string[]=[];for(const value of values){const key=normalized(value);if(!key||seen.has(key))continue;seen.add(key);result.push(value)}return result}
function normalized(value:string){return value.replace(/\s+/g,' ').trim()}
export function isStructuredLeveragedProduct(label:string):boolean {return /레버리지|인버스|선물단일종목|ETN|ETF|[23]X/i.test(label)}
function metricProse(values:Array<{label:string;displayValue:string}>){return `<p style="margin:0">${values.map(item=>`${esc(item.label)} ${esc(item.displayValue)}`).join(' · ')}</p>`;}
function flow(values:Array<{label:string;displayValue:string;direction:'UP'|'DOWN'|'FLAT'}>){const max=Math.max(...values.map(item=>Math.abs(Number(item.displayValue.replace(/[^0-9.-]/g,'')))),1);return `<div data-visualization="korea-investor-flow" style="width:100%;max-width:100%;box-sizing:border-box">${values.map(item=>{const size=Math.max(4,Math.round(Math.abs(Number(item.displayValue.replace(/[^0-9.-]/g,'')))/max*46));const color=item.direction==='UP'?'#c62828':item.direction==='DOWN'?'#1565c0':'#59697d';return `<div style="margin:0 0 12px;width:100%;max-width:100%;box-sizing:border-box"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><strong>${esc(item.label)}</strong><span style="color:${color};font-weight:800">${esc(item.displayValue)}</span></div><div style="height:8px;background:#eef2f6"><span style="display:block;width:${size}%;height:100%;background:${color}"></span></div></div>`;}).join('')}</div>`;}
function sources(values:NewsletterSourceLink[]){const unique=[...new Map(values.map(item=>[item.url,item])).values()];return section('자료',`<ul style="margin:0;padding-left:20px">${unique.map(item=>`<li style="margin:5px 0"><a href="${attr(item.url)}" target="_blank" rel="nofollow noopener noreferrer" style="${LINK}">${esc(item.label)}</a></li>`).join('')}</ul>`);}
function finish(product:string,title:string,label:string,parts:string[],renderedSections:string[]):DailyMasterRenderResult {const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head><body><article data-product="motus-${product}" data-layout="editorial-article-4q" style="${BODY}">${parts.join('\n')}</article></body></html>`;assertNewsletterPublicHtmlSafe(html);for(const forbidden of BLOGGER_EDITORIAL_MASTER.forbiddenPublicLabels)if(new RegExp(`>${forbidden}<`).test(html))throw new Error(`forbidden public analytical label: ${forbidden}`);return {html,renderedSections,label};}
function esc(value:string){return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}function attr(value:string){return esc(value).replace(/'/g,'&#39;');}
function explainTerms(value:string,seen:Set<string>):string {const terms:[string,string][]=[['VIX','VIX (변동성지수)'],['DXY','DXY (달러인덱스)'],['미국 10년물','미국 10년물 국채금리']];let output=value;for(const [term,label] of terms){if(seen.has(term))continue;if(output.includes(label)){seen.add(term);continue;}const index=output.indexOf(term);if(index<0)continue;output=`${output.slice(0,index)}${label}${output.slice(index+term.length)}`;seen.add(term);}return output;}

/** Weekly review: the same editorial masthead and sections as the daily articles, with tables for the numbers and the calendar. */
export function renderWeeklyEditorialArticle(view:import('../operations/weekly-review.js').WeeklyArticle):DailyMasterRenderResult {
  const table=(data:{headers:string[];rows:string[][];note?:string})=>`<div style="width:100%;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch"><table style="width:100%;border-collapse:collapse;font-size:15px;line-height:1.5;min-width:340px"><thead><tr>${data.headers.map(cell=>`<th style="text-align:left;padding:8px 10px;background:#eef3f9;color:#03162e;border-bottom:2px solid #173a63;white-space:nowrap">${esc(cell)}</th>`).join('')}</tr></thead><tbody>${data.rows.map(row=>`<tr>${row.map((cell,index)=>`<td style="padding:8px 10px;border-bottom:1px solid #dbe3ec;vertical-align:top;${index===0?'font-weight:700;white-space:nowrap;':''}${/^[+-]\d|^[+-]?\d+bp$/.test(cell)?`white-space:nowrap;color:${cell.startsWith('-')?'#1f5fbf':cell.startsWith('+')?'#c62828':'#172033'};font-weight:700`:''}">${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${data.note?`<p style="margin:8px 0 0;color:#4a5a6e;font-size:13px">${esc(data.note)}</p>`:''}`;
  const parts=[masthead(view.title,view.subtitle,'주간 증시',view.weekEnd),lead(view.lead)];
  for(const item of view.sections){
    let body=item.intro?`<p style="margin:0 0 12px;color:#4a5a6e;font-size:15px">${esc(item.intro)}</p>`:'';
    if(item.table)body+=table(item.table);
    if(item.links?.length)body+=`<ul style="margin:0;padding-left:20px">${item.links.map(link=>`<li style="margin:0 0 10px"><span style="color:#4a5a6e;font-size:14px">${esc(link.meta)}</span><br><a href="${attr(link.url)}" style="${LINK}">${esc(link.label)}</a></li>`).join('')}</ul>`;
    if(item.paragraphs?.length)body+=deepSection({key:item.key,title:'',paragraphs:item.paragraphs}).replace(/^<section[^>]*><h2[^>]*><\/h2>/,'').replace(/<\/section>$/,'');
    parts.push(`<section data-section="${attr(item.key)}" style="${SECTION}"><h2 style="${HEADING}">${esc(item.title)}</h2>${body}</section>`);
  }
  parts.push(sources(view.sources.map(item=>({...item,publisher:''}))));
  return finish('weekly-intelligence',view.title,'주간 증시',parts,['masthead','lead',...view.sections.map(item=>item.key),'sources']);
}

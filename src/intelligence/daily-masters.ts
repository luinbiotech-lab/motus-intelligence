import type { MajorIndexHistory } from '../content/publisher-schema.js';
import { MOTUS_DISPLAY_NAME, MOTUS_PUBLIC_CATEGORY_MASTER, type MotusPublicCategoryKey } from '../content/publisher-schema.js';
import type { KoreaMarketNewsletterMetric, KoreaMarketNewsletterView } from './korea-market.js';
import type { KoreaResearchNewsletterEntry } from './brokerage-research.js';
import type { NewsletterIntelligenceEntry, NewsletterMarketMetric, NewsletterSourceLink, NewsletterViewModel, NewsletterWatchItem } from './newsletter.js';
import { assertNewsletterPublicHtmlSafe } from '../publishers/motus-newsletter.js';
import { renderMarketTrendSection } from '../publishers/motus.js';

export const motusMarketColors={positive:'#c62828',negative:'#1565c0',unchanged:'#59697d',primary:'#03162e'} as const;
export type DailyGlossaryEntry={term:string;fullSpelling:string;definition:string};
export type DailyReportType='AI_DAILY'|'US_MARKET_DAILY'|'KOREA_MARKET_DAILY'|'WEEKLY_INTELLIGENCE'|'MONTHLY_INTELLIGENCE';
export type PublicReportState='PREVIEW_READY'|'AVAILABLE'|'WITHDRAWN';
export interface PublicReportEntry { title:string;issueDate:string;periodStart?:string;periodEnd?:string;category:MotusPublicCategoryKey;reportType:DailyReportType;downloadUrl:string|null;articleUrl?:string|null;generatedAt:string;publishedAt?:string|null;state:PublicReportState }
export interface ReportsArchiveViewModel { title:string;entries:PublicReportEntry[] }
export interface PeriodicIntelligenceBoundary { cadence:'WEEKLY'|'MONTHLY';crossIntelligence:boolean;consensusDivergence:boolean;investmentMap:boolean;themeChanges:boolean;institutionChanges:boolean;eventToMarketReview:boolean }

interface DailyMasterBase {
  publicationId:string;issueDate:string;issueNumber:number;title:string;subtitle:string;
  category:MotusPublicCategoryKey;canonicalLabel:string;displayLabel:string;
  sources:NewsletterSourceLink[];glossary?:DailyGlossaryEntry[];report?:PublicReportEntry;
}
export interface AIIntelligenceIssue {
  headline:string;whatHappened:string[];coreContent:string;whyItMatters:string|null;
  relatedCompaniesIndustries:string[];marketConnection:string|null;institutionView:string|null;evidenceRefs:string[];
}
export interface AIIndustryConnection {
  title:string;explanation:string;connectedCompanies:string[];connectedIndustries:string[];
  evidenceRefs:string[];optionalWatchPoint:string|null;
}
export interface AIIntelligenceDailyViewModel extends DailyMasterBase {
  category:'AI_INTELLIGENCE';todayCore:{headline:string;summary:string;bullets:string[]};issues:AIIntelligenceIssue[];
  industryFlow:string[];industryConnections:AIIndustryConnection[];whatToWatch:NewsletterWatchItem[];
}
export interface USMarketDailyViewModel extends DailyMasterBase {
  category:'US_MARKET';marketSummary:string;marketHistory:MajorIndexHistory;
  supportingMetrics:NewsletterMarketMetric[];marketCommentary:string[];sectorsCompanies:string[];
  wallStreetResearch:{headline:string;institutionView:string|null;motusInterpretation:string|null;facts:string[]}[];
  checkpoints:NewsletterWatchItem[];
}
export interface KoreaMarketDailyViewModel extends DailyMasterBase {
  category:'KOREA_MARKET';marketSummary:string;indexMetrics:KoreaMarketNewsletterMetric[];
  fxAndSupporting:KoreaMarketNewsletterMetric[];investorFlows:KoreaMarketNewsletterMetric[];
  sectors:KoreaMarketNewsletterMetric[];movers:KoreaMarketNewsletterMetric[];research:KoreaResearchNewsletterEntry[];
  marketCommentary:string[];checkpoints:NewsletterWatchItem[];marketHistory?:MajorIndexHistory;
}
export interface DailyMasterSplit { ai:AIIntelligenceDailyViewModel;us:USMarketDailyViewModel;korea:KoreaMarketDailyViewModel }
export interface DailyMasterRenderResult { html:string;renderedSections:string[];label:string }

const verifiedIndexNames=new Set(['S&P 500','Nasdaq','Dow Jones','Russell 2000']);
const BODY='font-family:Arial,&quot;Noto Sans KR&quot;,sans-serif;color:#172033;line-height:1.72;font-size:17px;width:100%;max-width:820px;box-sizing:border-box;margin:0 auto;overflow-wrap:anywhere';
const SECTION='width:100%;max-width:100%;box-sizing:border-box;margin:22px 0 0';
const TITLE='background:#03162e;color:#fff;border:1px solid #010b17;padding:14px 16px;font-size:21px;font-weight:800;line-height:1.35;margin:0;width:100%;max-width:100%;box-sizing:border-box';
const BOX='border:1px solid #aebed2;padding:21px 22px;background:#fff;margin:0 0 22px;width:100%;max-width:100%;box-sizing:border-box';
const LINK='color:#0759a6;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:2px;font-weight:700;overflow-wrap:anywhere';

export function splitNewsletterIntoDailyMasters(model:NewsletterViewModel,options:{glossaries?:Partial<Record<'ai'|'us'|'korea',DailyGlossaryEntry[]>>;reports?:Partial<Record<'ai'|'us'|'korea',PublicReportEntry>>}={}):DailyMasterSplit {
  if(!model.marketSnapshot?.marketHistory)throw new Error('US Market Daily requires verified five-session market history');
  if(!model.aiIntelligence?.length)throw new Error('AI Intelligence Daily requires verified AI intelligence');
  if(!model.koreaMarketFacts?.metrics.length)throw new Error('Korea Market Daily requires verified Korea market facts');
  const shared={issueDate:model.issueDate,issueNumber:model.issueNumber};
  const aiSources=dedupeSources(model.aiIntelligence.flatMap(item=>item.sources));
  const chartSourceUrls=new Set(historySources(model.marketSnapshot.marketHistory).map(source=>canonicalUrl(source.url)));
  const usSources=dedupeSources((model.wallStreetIntelligence??[]).flatMap(item=>item.sources).filter(source=>!chartSourceUrls.has(canonicalUrl(source.url))));
  const koreaSources=dedupeSources([...(model.koreaMarketFacts.sources.map(source=>({...source,publisher:source.label}))),...(model.koreaResearch??[]).flatMap(item=>item.sources)]);
  const ai:AIIntelligenceDailyViewModel={
    ...shared,publicationId:`${model.newsletterId}:ai`,title:`${model.title} — AI 산업의 핵심 흐름`,subtitle:'공식 발표와 검증 자료로 읽는 AI 산업',...category('AI_INTELLIGENCE'),
    todayCore:model.todayAtAGlance??{headline:model.title,summary:model.editorialSummary,bullets:[]},
    issues:model.aiIntelligence.map(item=>({headline:item.headline,whatHappened:item.sourceFacts,coreContent:item.summary,whyItMatters:item.aiInterpretation,relatedCompaniesIndustries:unique([item.company,...themeLabels(item)].filter((value):value is string=>Boolean(value))),marketConnection:item.aiInterpretation,institutionView:item.institutionView,evidenceRefs:item.sources.map(source=>source.url)})),
    industryFlow:unique(model.aiIntelligence.flatMap(item=>themeLabels(item))),industryConnections:model.aiIntelligence.map(item=>connectionFromEntry(item)).filter((item):item is AIIndustryConnection=>item!==null),whatToWatch:filterWatch(model.whatToWatch,/AI|에이전트|반도체|산업|CAPEX/i),sources:aiSources,
    ...optionalGlossary(options.glossaries?.ai),...optionalReport(options.reports?.ai)
  };
  const us:USMarketDailyViewModel={
    ...shared,publicationId:`${model.newsletterId}:us`,title:`${model.title} — 미국증시 마감`,subtitle:'금리·지수·업종·월가 시각을 함께 읽는 데일리',...category('US_MARKET'),marketSummary:model.marketSnapshot.summary,
    marketHistory:model.marketSnapshot.marketHistory,supportingMetrics:model.marketSnapshot.metrics.filter(metric=>!verifiedIndexNames.has(metric.label)),
    marketCommentary:unique([model.editorialSummary,...(model.wallStreetIntelligence??[]).map(item=>item.summary)]),
    sectorsCompanies:unique((model.wallStreetIntelligence??[]).flatMap(item=>[item.company,...themeLabels(item)].filter((value):value is string=>Boolean(value)))),
    wallStreetResearch:(model.wallStreetIntelligence??[]).map(item=>({headline:item.headline,institutionView:item.institutionView,motusInterpretation:item.aiInterpretation,facts:item.sourceFacts})),
    checkpoints:filterWatch(model.whatToWatch,/미국|금리|지수|증시|성장주|유가|달러/i),sources:usSources,
    ...optionalGlossary(options.glossaries?.us),...optionalReport(options.reports?.us)
  };
  const koreaView=model.koreaMarketFacts;
  const korea:KoreaMarketDailyViewModel={
    ...shared,publicationId:`${model.newsletterId}:korea`,title:`${model.title} — 국내증시 마감`,subtitle:'지수·수급·업종·증권사 리서치를 함께 읽는 데일리',...category('KOREA_MARKET'),marketSummary:koreaSummary(model,koreaView),
    indexMetrics:group(koreaView,'INDEX'),fxAndSupporting:koreaView.metrics.filter(item=>['FX','VALUE','PROGRAM','BREADTH'].includes(item.group)),investorFlows:group(koreaView,'FLOW'),sectors:group(koreaView,'SECTOR'),movers:group(koreaView,'MOVER'),research:model.koreaResearch??[],
    marketCommentary:unique([model.editorialSummary,...(model.koreaResearch??[]).map(item=>item.institutionView)]),checkpoints:filterWatch(model.whatToWatch,/한국|외국인|KOSPI|KOSDAQ|원화|반도체/i),sources:koreaSources,
    ...optionalGlossary(options.glossaries?.korea),...optionalReport(options.reports?.korea)
  };
  return {ai,us,korea};
}

export function renderAIIntelligenceDaily(view:AIIntelligenceDailyViewModel):DailyMasterRenderResult {
  const parts:string[]=[masthead(view)];const keys=['masthead'];
  push(parts,keys,'today-core',section('오늘의 핵심',`<h3 style="margin:0 0 8px;color:#03162e;font-size:22px">${esc(view.todayCore.headline)}</h3><p style="margin:0 0 12px">${esc(view.todayCore.summary)}</p>${list(view.todayCore.bullets)}`));
  push(parts,keys,'key-ai-issues',section('AI·산업 인텔리전스',view.issues.map(renderAIIssue).join('')));
  const connections=view.industryConnections.filter(validConnection);
  if(connections.length)push(parts,keys,'industry-connections',section('산업·기업 연결',connections.map(renderIndustryConnection).join('')));
  if(view.whatToWatch.length)push(parts,keys,'what-to-watch',section('다음 확인사항',watch(view.whatToWatch)));
  appendOptional(parts,keys,view);return finish(view,parts,keys);
}

export function renderUSMarketDaily(view:USMarketDailyViewModel):DailyMasterRenderResult {
  const parts:string[]=[masthead(view)];const keys=['masthead'];
  push(parts,keys,'market-summary',section('오늘의 시장 요약',paragraphs([view.marketSummary,...view.marketCommentary.slice(0,1)])));
  if(view.supportingMetrics.length)push(parts,keys,'market-snapshot',section('시장 한눈에 보기 (Market Snapshot)',renderMetrics(view.supportingMetrics)));
  parts.push(renameTrendHeading(renderMarketTrendSection(view.marketHistory),'주요지수 추이 (Major Index Trends)'));keys.push('major-index-trends');
  if(view.marketCommentary.length)push(parts,keys,'market-commentary',section('시장 해설',paragraphs(view.marketCommentary)));
  if(view.sectorsCompanies.length)push(parts,keys,'sectors-companies',section('주요 업종·종목',list(view.sectorsCompanies)));
  if(view.wallStreetResearch.length)push(parts,keys,'wall-street-research',section('월가 리서치',view.wallStreetResearch.map(item=>`<article style="border-left:4px solid #405f7f;background:#f6f8fb;padding:13px 15px;margin:0 0 12px;width:100%;max-width:100%;box-sizing:border-box"><h3 style="margin:0 0 7px;color:#03162e;font-size:18px">${esc(item.headline)}</h3>${item.institutionView?field('기관 의견',item.institutionView,'institution-view'):''}${item.motusInterpretation?field('MOTUS 해석',item.motusInterpretation,'ai-interpretation'):''}${item.facts.length?labeled('확인된 사실',item.facts):''}</article>`).join('')));
  if(view.checkpoints.length)push(parts,keys,'checkpoints',section('다음 거래일 체크포인트',watch(view.checkpoints)));
  appendOptional(parts,keys,view);return finish(view,parts,keys);
}

export function renderKoreaMarketDaily(view:KoreaMarketDailyViewModel):DailyMasterRenderResult {
  const parts:string[]=[masthead(view)];const keys=['masthead'];
  push(parts,keys,'korea-summary',section('오늘의 국내시장 요약',paragraphs([view.marketSummary])));
  if(view.marketHistory){parts.push(renameTrendHeading(renderMarketTrendSection(view.marketHistory),'주요지수 추이 (Major Index Trends)'));keys.push('korea-index-trends');}
  else if(view.indexMetrics.length)push(parts,keys,'korea-index-trends',section('주요지수 추이 (Major Index Trends)',renderKoreaMetrics(view.indexMetrics)));
  if(view.fxAndSupporting.length)push(parts,keys,'fx-supporting',section('환율/보조지표',renderKoreaMetrics(view.fxAndSupporting)));
  if(view.investorFlows.length)push(parts,keys,'investor-flows',section('투자자별 수급',renderFlowBars(view.investorFlows)));
  if(view.sectors.length)push(parts,keys,'sectors',section('업종 흐름',renderDirectionalBars(view.sectors)));
  if(view.movers.length)push(parts,keys,'movers',section('주요 종목',renderDirectionalBars(view.movers)));
  if(view.research.length)push(parts,keys,'korea-research',section('국내 증권사 리서치',view.research.map(renderResearch).join('')));
  if(view.marketCommentary.length)push(parts,keys,'market-commentary',section('오늘 시장 해설',paragraphs(view.marketCommentary)));
  if(view.checkpoints.length)push(parts,keys,'checkpoints',section('다음 거래일 체크포인트',watch(view.checkpoints)));
  appendOptional(parts,keys,view);return finish(view,parts,keys);
}

export function renderReportsArchive(view:ReportsArchiveViewModel):string {
  const available=view.entries.filter(entry=>entry.state==='AVAILABLE'&&isVerifiedDownloadUrl(entry.downloadUrl));
  const cards=available.map(entry=>`<article style="border:1px solid #aebed2;padding:15px;margin:0 0 12px;width:100%;max-width:100%;box-sizing:border-box"><strong style="display:block;color:#03162e">${esc(entry.title)}</strong><span style="display:block;color:#59697d;font-size:13px">${esc(entry.issueDate)} · ${esc(MOTUS_PUBLIC_CATEGORY_MASTER[entry.category].displayLabel)}</span><a href="${attr(entry.downloadUrl!)}" style="${LINK};display:inline-block;margin-top:8px">PDF 리포트 다운로드</a></article>`).join('');
  return `<section data-product="motus-reports-archive" style="${BODY}"><h2 style="${TITLE}">${esc(view.title)}</h2><div style="${BOX}">${cards}</div></section>`;
}

export const periodicIntelligenceBoundaries:PeriodicIntelligenceBoundary[]=(['WEEKLY','MONTHLY'] as const).map(cadence=>({cadence,crossIntelligence:true,consensusDivergence:true,investmentMap:true,themeChanges:true,institutionChanges:true,eventToMarketReview:true}));

function renderAIIssue(item:AIIntelligenceIssue):string {
  const fact=sentenceParagraph(item.whatHappened);
  const context=sentenceParagraph([item.coreContent,item.whyItMatters].filter((value):value is string=>Boolean(value)));
  const implication=sentenceParagraph([item.marketConnection].filter((value):value is string=>Boolean(value)));
  return `<article style="border:1px solid #c4cfdb;padding:18px 18px 16px;margin:0 0 16px;width:100%;max-width:100%;box-sizing:border-box"><h3 style="margin:0 0 12px;color:#03162e;font-size:20px">${esc(item.headline)}</h3>${fact}${context}${implication}${item.institutionView?field('기관 의견',item.institutionView,'institution-view'):''}</article>`;
}
function renderIndustryConnection(item:AIIndustryConnection):string {const targets=unique([...item.connectedCompanies,...item.connectedIndustries]);return `<article style="border-left:4px solid #405f7f;background:#f6f8fb;padding:15px 16px;margin:0 0 13px;width:100%;max-width:100%;box-sizing:border-box"><h3 style="margin:0 0 8px;color:#03162e;font-size:18px">${esc(item.title)}</h3><p style="margin:0 0 9px">${esc(item.explanation)}</p>${targets.length?`<p style="margin:0 0 9px;color:#42536a;font-size:14px"><strong>연결 대상</strong> · ${esc(targets.join(' · '))}</p>`:''}${item.optionalWatchPoint?`<p style="margin:0;color:#42536a;font-size:14px">${esc(item.optionalWatchPoint)}</p>`:''}</article>`;}
function renderResearch(item:KoreaResearchNewsletterEntry):string {
  return `<article style="border:1px solid #c4cfdb;padding:15px;margin:0 0 12px;width:100%;max-width:100%;box-sizing:border-box"><h3 style="margin:0 0 6px;color:#03162e;font-size:18px">${esc(item.headline)}</h3><p style="margin:0 0 8px;color:#59697d;font-size:13px;font-weight:700">${esc(item.publisher)}${item.analyst?` · ${esc(item.analyst)}`:''}</p><p style="margin:0">${esc(item.summary)}</p>${field('기관 의견',item.institutionView,'institution-view')}${item.aiInterpretation?field('MOTUS 해석',item.aiInterpretation,'ai-interpretation'):''}${item.riskFactors.length?labeled('리스크',item.riskFactors):''}</article>`;
}
function renderFlowBars(metrics:KoreaMarketNewsletterMetric[]):string {
  const magnitudes=metrics.map(metric=>Math.abs(parseNumber(metric.displayValue)));const max=Math.max(...magnitudes,1);
  return `<div data-visualization="korea-investor-flow" style="width:100%;max-width:100%;box-sizing:border-box">${metrics.map((metric,index)=>{const width=Math.max(4,Math.round(magnitudes[index]!/max*48));const color=directionColor(metric.direction);return `<div style="margin:0 0 13px;width:100%;max-width:100%;box-sizing:border-box"><div style="display:flex;justify-content:space-between;gap:8px;font-size:14px;font-weight:700"><span>${esc(metric.label)}</span><span style="color:${color};font-variant-numeric:tabular-nums">${esc(metric.displayValue)}</span></div><div style="display:flex;width:100%;height:13px;background:#eef2f6;box-sizing:border-box;border:1px solid #d6dee8"><div style="width:50%;display:flex;justify-content:flex-end;border-right:1px solid #7d8a99;box-sizing:border-box">${metric.direction==='DOWN'?`<span style="display:block;width:${width}%;background:${color}"></span>`:''}</div><div style="width:50%;box-sizing:border-box">${metric.direction==='UP'?`<span style="display:block;width:${width}%;height:100%;background:${color}"></span>`:''}</div></div></div>`;}).join('')}</div>`;
}
function renderDirectionalBars(metrics:KoreaMarketNewsletterMetric[]):string {const max=Math.max(...metrics.map(metric=>Math.abs(parseNumber(metric.displayValue))),1);return `<div style="width:100%;max-width:100%;box-sizing:border-box">${metrics.map(metric=>{const width=Math.max(4,Math.round(Math.abs(parseNumber(metric.displayValue))/max*34));return `<div style="display:flex;align-items:center;gap:10px;margin:0 0 10px;width:100%;max-width:100%;box-sizing:border-box"><span style="width:42%;font-size:14px;font-weight:700;overflow-wrap:anywhere">${esc(metric.label)}</span><span style="display:block;width:${width}%;height:9px;background:${directionColor(metric.direction)};opacity:.82"></span><strong style="color:${directionColor(metric.direction)};font-size:14px;font-variant-numeric:tabular-nums">${esc(metric.displayValue)}</strong></div>`;}).join('')}</div>`; }
function renderKoreaMetrics(metrics:KoreaMarketNewsletterMetric[]):string {return `<div style="display:flex;flex-wrap:wrap;width:100%;max-width:100%;box-sizing:border-box">${metrics.map(metric=>`<div style="width:50%;max-width:50%;padding:4px;box-sizing:border-box"><div style="border:1px solid #c4cfdb;background:#f7f9fc;padding:12px;width:100%;max-width:100%;box-sizing:border-box"><span style="display:block;color:#59697d;font-size:13px">${esc(metric.label)}</span><strong style="color:${directionColor(metric.direction)};font-size:18px;font-variant-numeric:tabular-nums">${esc(metric.displayValue)}</strong></div></div>`).join('')}</div>`;}
function renderMetrics(metrics:NewsletterMarketMetric[]):string {return `<div style="display:flex;flex-wrap:wrap;width:100%;max-width:100%;box-sizing:border-box">${metrics.map(metric=>`<div style="width:50%;max-width:50%;padding:4px;box-sizing:border-box"><div style="border:1px solid #c4cfdb;background:#f7f9fc;padding:12px;width:100%;max-width:100%;box-sizing:border-box"><span style="display:block;color:#59697d;font-size:13px">${esc(metric.label)}</span><strong style="font-size:18px;font-variant-numeric:tabular-nums">${esc(metric.value)}</strong>${metric.change?` <span style="color:${directionColor(metric.direction)};font-weight:800">${esc(metric.change)}</span>`:''}</div></div>`).join('')}</div>`;}

function appendOptional(parts:string[],keys:string[],view:DailyMasterBase):void {
  if(view.glossary?.length)push(parts,keys,'glossary',section('용어해설',`<table style="width:100%;max-width:100%;table-layout:fixed;border-collapse:collapse;font-size:14px">${view.glossary.slice(0,6).map(item=>`<tr><th style="width:20%;padding:8px;text-align:left;border-bottom:1px solid #c9d5e3;color:#03162e">${esc(item.term)}</th><td style="width:34%;padding:8px;border-bottom:1px solid #c9d5e3">${esc(item.fullSpelling)}</td><td style="padding:8px;border-bottom:1px solid #c9d5e3">${esc(item.definition)}</td></tr>`).join('')}</table>`));
  if(view.report&&view.report.state==='AVAILABLE'&&isVerifiedDownloadUrl(view.report.downloadUrl))push(parts,keys,'pdf-report',section('리포트 (Reports)',`<a href="${attr(view.report.downloadUrl!)}" style="${LINK};display:inline-block">PDF 리포트 다운로드</a>`));
  if(view.sources.length)push(parts,keys,'sources',section('주요 출처',renderSources(view.sources)));
}
function finish(view:DailyMasterBase,parts:string[],keys:string[]):DailyMasterRenderResult {const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(view.title)}</title></head><body><article data-product="motus-${view.category.toLowerCase().replaceAll('_','-')}" data-layout="daily-master-inline-v1" style="${BODY}">${parts.join('\n')}</article></body></html>`;assertNewsletterPublicHtmlSafe(html);return {html,renderedSections:keys,label:view.canonicalLabel};}
function masthead(view:DailyMasterBase):string{return `<header data-section="masthead" style="width:100%;max-width:100%;box-sizing:border-box;background:#03162e;color:#fff;padding:28px 24px;border:1px solid #010b17;margin:0 0 22px"><p style="margin:0 0 10px;color:#c7d8ea;font-size:14px;font-weight:800">${esc(MOTUS_DISPLAY_NAME)}</p><div role="heading" aria-level="2" style="font-size:31px;line-height:1.22;font-weight:850">${esc(view.title)}</div><p style="margin:10px 0 0;color:#e6edf5">${esc(view.subtitle)}</p><p style="margin:12px 0 0;color:#b7c8da;font-size:13px">${esc(view.displayLabel)} · ${esc(view.issueDate)}</p></header>`;}
function section(title:string,content:string):string{return `<section data-section="${attr(slug(title))}" style="${SECTION}"><h2 style="${TITLE}">${esc(title)}</h2><div style="${BOX}">${content}</div></section>`;}
function field(label:string,value:string,key:string):string{return `<div data-render-field="${attr(key)}" style="margin:10px 0 0;padding:11px 13px;background:#f4f6f9;border-left:4px solid #405f7f;width:100%;max-width:100%;box-sizing:border-box"><strong style="display:block;color:#102f50;margin-bottom:4px">${esc(label)}</strong>${esc(value)}</div>`;}
function labeled(label:string,values:string[]):string{return values.length?`<div style="margin:10px 0"><strong style="color:#102f50">${esc(label)}</strong>${list(values)}</div>`:'';}
function list(values:string[]):string{return values.length?`<ul style="margin:7px 0 0;padding-left:20px">${values.map(value=>`<li style="margin:4px 0">${esc(value)}</li>`).join('')}</ul>`:'';}
function paragraphs(values:string[]):string{return unique(values.filter(Boolean)).map(value=>`<p style="margin:0 0 11px">${esc(value)}</p>`).join('');}
function sentenceParagraph(values:string[]):string {const prose=values.map(value=>value.trim()).filter(Boolean).map(value=>/[.!?]$/.test(value)?value:`${value}.`).join(' ');return prose?`<p style="margin:0 0 12px">${esc(prose)}</p>`:'';}
function watch(values:NewsletterWatchItem[]):string{return values.map(item=>`<div style="border-left:4px solid #405f7f;padding:10px 12px;margin:0 0 10px;background:#f7f9fc;width:100%;max-width:100%;box-sizing:border-box"><strong style="display:block;color:#03162e">${esc(item.headline)}</strong>${esc(item.watchFor)}</div>`).join('');}
function renderSources(values:NewsletterSourceLink[]):string{return `<ul style="margin:0;padding-left:19px">${dedupeSources(values).map(source=>`<li style="margin:5px 0"><a href="${attr(source.url)}" target="_blank" rel="nofollow noopener noreferrer" style="${LINK}">${esc(source.label)}</a>${source.publisher&&source.publisher!==source.label?` <span style="color:#65758a">· ${esc(source.publisher)}</span>`:''}</li>`).join('')}</ul>`;}
function category<K extends MotusPublicCategoryKey>(key:K):{category:K;canonicalLabel:typeof MOTUS_PUBLIC_CATEGORY_MASTER[K]['canonicalLabel'];displayLabel:typeof MOTUS_PUBLIC_CATEGORY_MASTER[K]['displayLabel']} {return {category:key,canonicalLabel:MOTUS_PUBLIC_CATEGORY_MASTER[key].canonicalLabel,displayLabel:MOTUS_PUBLIC_CATEGORY_MASTER[key].displayLabel};}
function optionalGlossary(value:DailyGlossaryEntry[]|undefined):{glossary?:DailyGlossaryEntry[]}{return value?.length?{glossary:structuredClone(value.slice(0,6))}:{};}
function optionalReport(value:PublicReportEntry|undefined):{report?:PublicReportEntry}{return value?{report:structuredClone(value)}:{};}
function connectionFromEntry(item:NewsletterIntelligenceEntry):AIIndustryConnection|null {const companies=item.company?[item.company]:[];const industries=themeLabels(item);const evidenceRefs=item.sources.map(source=>source.url).filter(Boolean);if(!item.aiInterpretation?.trim()||!evidenceRefs.length||companies.length+industries.length===0)return null;return {title:[...companies,...industries].slice(0,2).join('·'),explanation:item.aiInterpretation,connectedCompanies:companies,connectedIndustries:industries,evidenceRefs,optionalWatchPoint:null};}
function validConnection(item:AIIndustryConnection):boolean{return Boolean(item.title.trim()&&item.explanation.trim()&&item.evidenceRefs.length&&(item.connectedCompanies.length||item.connectedIndustries.length));}
function group(view:KoreaMarketNewsletterView,key:KoreaMarketNewsletterMetric['group']){return view.metrics.filter(metric=>metric.group===key);}
function filterWatch(values:NewsletterWatchItem[]|undefined,pattern:RegExp):NewsletterWatchItem[]{const matching=(values??[]).filter(item=>pattern.test(`${item.headline} ${item.watchFor}`));return structuredClone(matching);}
function koreaSummary(model:NewsletterViewModel,view:KoreaMarketNewsletterView):string{const index=view.metrics.filter(item=>item.group==='INDEX').map(item=>`${item.label} ${item.displayValue}`).join(', ');return `${index}. ${model.todayAtAGlance?.summary??model.editorialSummary}`;}
function themeLabels(item:NewsletterIntelligenceEntry):string[]{const values:string[]=[...(item.primaryThemeId?[item.primaryThemeId]:[]),...item.relatedThemeIds];return unique(values.map(value=>value.replace(/^theme:/,'').replaceAll('-',' ')));}
function historySources(history:MajorIndexHistory):NewsletterSourceLink[]{return history.series.map(item=>({label:item.sourceLabel,url:item.sourceUrl,publisher:item.sourceLabel}));}
function renameTrendHeading(html:string,title:string):string{return html.replace('미국 주요 증시 추이',title);}
function directionColor(direction:'UP'|'DOWN'|'FLAT'):string{return direction==='UP'?motusMarketColors.positive:direction==='DOWN'?motusMarketColors.negative:motusMarketColors.unchanged;}
function parseNumber(value:string):number{return Number(value.replace(/[^0-9+.-]/g,''))||0;}
function push(parts:string[],keys:string[],key:string,value:string):void{parts.push(value);keys.push(key);}
function isVerifiedDownloadUrl(value:string|null):value is string {if(!value)return false;try{const parsed=new URL(value);return parsed.protocol==='https:'&&Boolean(parsed.hostname)&&!/(?:example|placeholder|pending)\./i.test(parsed.hostname);}catch{return false;}}
function dedupeSources(values:NewsletterSourceLink[]):NewsletterSourceLink[]{const map=new Map<string,NewsletterSourceLink>();for(const source of values){const canonical=canonicalUrl(source.url);const key=`${canonical}\u0000${(source.publisher??source.label).trim().toLowerCase()}`;if(!map.has(key))map.set(key,{...source,url:canonical});}return [...map.values()];}
function canonicalUrl(value:string):string{const parsed=new URL(value);parsed.hash='';for(const key of [...parsed.searchParams.keys()])if(/^utm_|^(?:fbclid|gclid)$/i.test(key))parsed.searchParams.delete(key);parsed.hostname=parsed.hostname.toLowerCase();if(parsed.pathname!=='/')parsed.pathname=parsed.pathname.replace(/\/+$/,'');return parsed.toString();}
function unique<T>(values:T[]):T[]{return [...new Set(values)];}
function slug(value:string):string{return value.toLowerCase().replace(/[^a-z0-9가-힣]+/g,'-').replace(/^-|-$/g,'');}
function esc(value:string):string{return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function attr(value:string):string{return esc(value).replace(/'/g,'&#39;');}

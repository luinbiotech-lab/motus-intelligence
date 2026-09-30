import { createHash } from 'node:crypto';
import type { BrokerageResearchItem } from './brokerage-research.js';
import { buildKoreaResearchNewsletterEntries } from './brokerage-research.js';
import type { CrossIntelligenceChain } from './cross-intelligence.js';
import { buildCrossIntelligenceNewsletterEntries } from './cross-intelligence.js';
import type { InvestmentMap, InvestmentMapA4CompactView } from './investment-map.js';
import { buildInvestmentMapA4CompactView, buildInvestmentMapNewsletterView } from './investment-map.js';
import type { KoreaMarketFact } from './korea-market.js';
import { buildKoreaMarketNewsletterView } from './korea-market.js';
import type { NewsletterAtAGlance, NewsletterContentAsset, NewsletterMarketSnapshot, NewsletterSourceLink, NewsletterViewModel, NewsletterWatchItem } from './newsletter.js';
import { createNewsletterViewModel, newsletterEntryFromIntelligence } from './newsletter.js';
import type { ResearchIntelligenceItem } from './schema.js';
import { assertNewsletterPublicHtmlSafe, renderMotusDailyNewsletter, type MotusNewsletterRenderResult } from '../publishers/motus-newsletter.js';

export const dailyReviewStatuses=['PENDING','APPROVED','MODIFY','REJECT','HOLD'] as const;
export type DailyReviewStatus=typeof dailyReviewStatuses[number];
export type ArtifactState='NOT_GENERATED'|'PREVIEW_READY'|'APPROVED'|'PUBLISHED'|'SENT'|'RELEASED'|'FAILED';
export interface DailyReviewAudit { at:string;from:DailyReviewStatus;to:DailyReviewStatus;reviewer:string;note:string }
export interface DailyHumanReview { status:DailyReviewStatus;reviewer:string|null;reviewedAt:string|null;history:DailyReviewAudit[] }
export interface DailyChannelState {
  blogger:{artifactState:ArtifactState;publicationState:'DRAFT'|'PUBLISHED';error:string|null};
  email:{artifactState:ArtifactState;error:string|null};
  a4:{artifactState:ArtifactState;distributionState:'PRIVATE_PREVIEW'|'RELEASED';error:string|null};
}
export interface DailyIntelligenceAssemblerInput {
  newsletter:{newsletterId:string;issueDate:string;issueNumber:number;title:string;subtitle:string;editorialSummary:string;todayAtAGlance?:NewsletterAtAGlance;marketSnapshot?:NewsletterMarketSnapshot;whatToWatch?:NewsletterWatchItem[];assets?:NewsletterContentAsset[]};
  aiIntelligence:ResearchIntelligenceItem[]; wallStreetIntelligence:ResearchIntelligenceItem[];
  koreaMarketFacts:KoreaMarketFact[]; koreaBrokerageResearch:BrokerageResearchItem[];
  crossIntelligence:CrossIntelligenceChain[]; investmentMap:InvestmentMap;
  sourceFactsByIntelligenceId?:Readonly<Record<string,string[]>>;
}
export interface AssembledDailyIntelligence { newsletter:NewsletterViewModel; investmentMap:InvestmentMap; contentFingerprint:string }
export interface EmailNewsletterPreview { subject:string;html:string;text:string;sourceUrls:string[];contentFingerprint:string }
export interface EmailNewsletterDeliveryAdapter {
  readonly adapterId:string;
  sendApproved(preview:EmailNewsletterPreview):Promise<{messageId:string;sentAt:string}>;
}
export interface A4DailyIntelligencePreview { html:string;viewModel:A4DailyIntelligenceView;onePage:boolean;overflow:boolean;contentFingerprint:string }
export interface A4DailyIntelligenceView {
  issueDate:string;title:string;marketSnapshot?:NewsletterMarketSnapshot;aiIndustry:string[];wallStreet:string[];koreaResearch:string[];
  crossIntelligence:string[];investmentMap:InvestmentMapA4CompactView;targetPriceRatingChanges:string[];risksAndWatch:string[];sources:NewsletterSourceLink[];qrUrl:string|null;
}
export interface DailyPreviewPackage { newsletter:NewsletterViewModel;blogger:MotusNewsletterRenderResult;email:EmailNewsletterPreview;a4:A4DailyIntelligencePreview;states:DailyChannelState;review:DailyHumanReview;contentFingerprint:string }
export interface MorningCollectionResult extends Omit<DailyIntelligenceAssemblerInput,'newsletter'> {}
export interface DailyIntelligenceCollector { collect(issueDate:string):Promise<MorningCollectionResult> }

const verified=new Set(['VERIFIED','PARTIALLY_VERIFIED','PRIMARY_SOURCE_ONLY']);
const esc=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const unique=<T>(items:T[])=>[...new Set(items)];

export function assembleDailyIntelligence(input:DailyIntelligenceAssemblerInput):AssembledDailyIntelligence {
  const ai=input.aiIntelligence.filter(item=>verified.has(item.verificationStatus)).map(item=>toNewsletterEntry(item,input.sourceFactsByIntelligenceId));
  const wall=input.wallStreetIntelligence.filter(item=>verified.has(item.verificationStatus)).map(item=>toNewsletterEntry(item,input.sourceFactsByIntelligenceId));
  const koreaMarketFacts=buildKoreaMarketNewsletterView(input.koreaMarketFacts);
  const koreaResearch=buildKoreaResearchNewsletterEntries(input.koreaBrokerageResearch);
  const crossIntelligenceChains=buildCrossIntelligenceNewsletterEntries(input.crossIntelligence);
  const sources=dedupeSources([
    ...ai.flatMap(item=>item.sources),...wall.flatMap(item=>item.sources),...(koreaMarketFacts?.sources.map(source=>({...source,publisher:source.label}))??[]),
    ...koreaResearch.flatMap(item=>item.sources),...crossIntelligenceChains.flatMap(item=>item.sources)
  ]);
  const newsletter=createNewsletterViewModel({
    ...input.newsletter,assets:input.newsletter.assets??[],sources,
    aiIntelligence:ai,wallStreetIntelligence:wall,...(koreaMarketFacts?{koreaMarketFacts}:{}),koreaResearch,
    crossIntelligenceChains,investmentMapV1:buildInvestmentMapNewsletterView(input.investmentMap),
    ...(input.newsletter.whatToWatch?{whatToWatch:input.newsletter.whatToWatch}:{})
  });
  return {newsletter,investmentMap:structuredClone(input.investmentMap),contentFingerprint:fingerprintNewsletter(newsletter)};
}

function toNewsletterEntry(item:ResearchIntelligenceItem,facts:DailyIntelligenceAssemblerInput['sourceFactsByIntelligenceId']) {
  return newsletterEntryFromIntelligence(item,{
    sourceFacts:facts?.[item.intelligenceId]??[],
    sources:dedupeSources(item.provenance.sources.map(source=>({label:item.publisher??item.source,url:source.sourceUrl,publisher:item.publisher})))
  });
}

export function createPendingDailyReview():DailyHumanReview { return {status:'PENDING',reviewer:null,reviewedAt:null,history:[]}; }
export function createNotGeneratedChannelState():DailyChannelState { return {blogger:{artifactState:'NOT_GENERATED',publicationState:'DRAFT',error:null},email:{artifactState:'NOT_GENERATED',error:null},a4:{artifactState:'NOT_GENERATED',distributionState:'PRIVATE_PREVIEW',error:null}}; }
export function recordDailyReview(review:DailyHumanReview,to:DailyReviewStatus,reviewer:string,note:string,at:string):DailyHumanReview {
  if(!reviewer.trim()||!note.trim()||!Number.isFinite(Date.parse(at)))throw new Error('reviewer, note and valid reviewedAt are required');
  return {status:to,reviewer,reviewedAt:at,history:[...review.history,{at,from:review.status,to,reviewer,note}]};
}

export function renderDailyIntelligencePreviews(assembled:AssembledDailyIntelligence,review:DailyHumanReview,bloggerUrl:string|null=null):DailyPreviewPackage {
  const blogger=renderMotusDailyNewsletter(assembled.newsletter);
  const email=renderEmailNewsletter(assembled.newsletter,assembled.contentFingerprint,bloggerUrl,assembled.investmentMap);
  const a4=renderA4DailyIntelligence(assembled.newsletter,assembled.investmentMap,assembled.contentFingerprint,bloggerUrl);
  const state:ArtifactState=review.status==='APPROVED'?'APPROVED':'PREVIEW_READY';
  return {newsletter:assembled.newsletter,blogger,email,a4,states:{blogger:{artifactState:state,publicationState:'DRAFT',error:null},email:{artifactState:state,error:null},a4:{artifactState:state,distributionState:'PRIVATE_PREVIEW',error:null}},review:structuredClone(review),contentFingerprint:assembled.contentFingerprint};
}

export function markBloggerPublished(preview:DailyPreviewPackage):DailyChannelState { requireApproved(preview.review,'Blogger publish');return {...structuredClone(preview.states),blogger:{artifactState:'PUBLISHED',publicationState:'PUBLISHED',error:null}}; }
export function markEmailSent(preview:DailyPreviewPackage):DailyChannelState { requireApproved(preview.review,'Email send');return {...structuredClone(preview.states),email:{artifactState:'SENT',error:null}}; }
export function markA4Released(preview:DailyPreviewPackage):DailyChannelState { requireApproved(preview.review,'A4 release');return {...structuredClone(preview.states),a4:{artifactState:'RELEASED',distributionState:'RELEASED',error:null}}; }
function requireApproved(review:DailyHumanReview,action:string):void { if(review.status!=='APPROVED')throw new Error(`${action} blocked: Human Review APPROVED required`); }

export async function prepareMorningIntelligenceRun(input:{collector:DailyIntelligenceCollector;issueDate:string;newsletter:DailyIntelligenceAssemblerInput['newsletter'];review?:DailyHumanReview;bloggerUrl?:string|null}):Promise<DailyPreviewPackage> {
  const collected=await input.collector.collect(input.issueDate);const assembled=assembleDailyIntelligence({...collected,newsletter:input.newsletter});
  return renderDailyIntelligencePreviews(assembled,input.review??createPendingDailyReview(),input.bloggerUrl??null);
}

export function renderEmailNewsletter(model:NewsletterViewModel,contentFingerprint:string,bloggerUrl:string|null,map?:InvestmentMap):EmailNewsletterPreview {
  const sourceUrls=model.sources.map(source=>source.url);const blocks:string[]=[];const text:string[]=[model.title,model.issueDate,model.editorialSummary];
  const add=(title:string,items:string[])=>{if(!items.length)return;blocks.push(`<h2 style="color:#03162e;font-size:18px;margin:20px 0 8px">${esc(title)}</h2><ul style="padding-left:20px;margin:0">${items.map(item=>`<li style="margin:0 0 7px">${esc(item)}</li>`).join('')}</ul>`);text.push(title,...items);};
  if(model.todayAtAGlance)add('Today at a Glance',[model.todayAtAGlance.headline,...model.todayAtAGlance.bullets]);
  if(model.marketSnapshot)add('Market Snapshot',model.marketSnapshot.metrics.map(item=>`${item.label} ${item.value}${item.change?` (${item.change})`:''}`));
  add('AI 핵심',(model.aiIntelligence??[]).map(item=>`${item.headline} — ${item.summary}`));
  add('Wall Street 핵심',(model.wallStreetIntelligence??[]).map(item=>`${item.headline} — ${item.institutionView??item.summary}`));
  add('Korea 핵심',[...(model.koreaMarketFacts?.metrics.map(item=>`${item.label} ${item.displayValue}`)??[]),...(model.koreaResearch??[]).map(item=>`${item.publisher}: ${item.institutionView}`)]);
  add('Cross Intelligence',(model.crossIntelligenceChains??[]).map(item=>`${item.themeEvent} — ${item.connectionSummary}`));
  if(map){const compact=buildInvestmentMapA4CompactView(map);add('Investment Map 요약',[...compactLines(compact),...investmentChangeLines(model)]);}
  add('What to Watch',(model.whatToWatch??[]).map(item=>`${item.headline} — ${item.watchFor}`));
  const sources=model.sources.length?`<h2 style="color:#03162e;font-size:18px;margin:20px 0 8px">Sources</h2><ul style="padding-left:20px">${model.sources.map(source=>`<li><a href="${esc(source.url)}" style="color:#0759a6">${esc(source.label)}</a></li>`).join('')}</ul>`:'';
  const cta=bloggerUrl?`<p style="margin:22px 0 0"><a href="${esc(bloggerUrl)}" style="background:#03162e;color:#fff;padding:11px 16px;text-decoration:none;font-weight:700">전체 분석은 MOTUS에서 확인하세요</a></p>`:'';
  const html=`<!doctype html><html lang="ko"><body><main data-channel="email" style="font-family:Arial,sans-serif;color:#172033;line-height:1.55;width:100%;max-width:680px;margin:0 auto;box-sizing:border-box"><header style="background:#03162e;color:#fff;padding:22px"><strong>MOTUS | What Moves the World</strong><h1 style="font-size:25px;margin:8px 0">${esc(model.title)}</h1><span>${esc(model.issueDate)}</span></header><p>${esc(model.editorialSummary)}</p>${blocks.join('')}${sources}${cta}</main></body></html>`;
  assertNewsletterPublicHtmlSafe(html);return {subject:`${model.title} · ${model.issueDate}`,html,text:text.join('\n'),sourceUrls,contentFingerprint};
}

export function renderA4DailyIntelligence(model:NewsletterViewModel,map:InvestmentMap,contentFingerprint:string,bloggerUrl:string|null):A4DailyIntelligencePreview {
  const compact=buildInvestmentMapA4CompactView(map);const view:A4DailyIntelligenceView={issueDate:model.issueDate,title:model.title,...(model.marketSnapshot?{marketSnapshot:model.marketSnapshot}:{}),aiIndustry:(model.aiIntelligence??[]).map(item=>item.headline),wallStreet:(model.wallStreetIntelligence??[]).map(item=>item.institutionView??item.headline),koreaResearch:(model.koreaResearch??[]).map(item=>`${item.publisher}: ${item.institutionView}`),crossIntelligence:(model.crossIntelligenceChains??[]).map(item=>item.connectionSummary),investmentMap:compact,targetPriceRatingChanges:investmentChangeLines(model),risksAndWatch:[...compact.majorRisks.map(item=>item.label),...(model.whatToWatch??[]).map(item=>item.watchFor)],sources:model.sources,qrUrl:bloggerUrl};
  const sections=[['Market Snapshot',view.marketSnapshot?.metrics.map(item=>`${item.label} ${item.value}${item.change?` (${item.change})`:''}`)??[]],['AI & Industry',view.aiIndustry],['Wall Street',view.wallStreet],['Korea Research',view.koreaResearch],['Cross Intelligence',view.crossIntelligence],['Investment Map',[...compactLines(compact),...view.targetPriceRatingChanges]],['Risk / What to Watch',view.risksAndWatch]] as const;
  const html=`<!doctype html><html lang="ko"><body><main data-channel="a4" data-one-page="true" style="font-family:Arial,sans-serif;width:794px;height:1123px;box-sizing:border-box;overflow:hidden;padding:34px;color:#172033"><header style="background:#03162e;color:#fff;padding:18px"><strong>MOTUS Daily Intelligence</strong><h1 style="font-size:25px;margin:6px 0">${esc(model.title)}</h1><span>${esc(model.issueDate)}</span></header>${sections.filter(([,items])=>items.length).map(([title,items])=>`<section><h2 style="font-size:16px;color:#03162e;margin:13px 0 4px">${esc(title)}</h2><p style="font-size:12px;margin:0">${items.map(esc).join(' · ')}</p></section>`).join('')}<footer style="font-size:10px;margin-top:14px">${view.sources.map(source=>`<a href="${esc(source.url)}">${esc(source.label)}</a>`).join(' · ')}${bloggerUrl?`<p>QR: <a href="${esc(bloggerUrl)}">MOTUS 상세 분석</a></p>`:''}</footer></main></body></html>`;
  const sourceLineUnits=Math.max(view.sources.length?1:0,Math.ceil(view.sources.reduce((sum,source)=>sum+source.label.length+3,0)/90));
  const contentUnits=sections.reduce((sum,[,items])=>sum+items.length,0)+sourceLineUnits;const overflow=contentUnits>42;
  assertNewsletterPublicHtmlSafe(html);return {html,viewModel:view,onePage:!overflow,overflow,contentFingerprint};
}

function compactLines(view:InvestmentMapA4CompactView):string[] {
  const output=[...view.institutionalFocus.map(item=>`Institutional Focus: ${item.label} (${item.mentionCount})`),...view.koreaResearchFocus.map(item=>`Korea Research Focus: ${item.label} (${item.mentionCount})`),...view.crossMarketThemes.map(item=>`Cross-Market: ${item.label} (${item.mentionCount})`),...view.mostDiscussedStocks.map(item=>`종목 언급: ${item.label} (${item.mentionCount})`),...view.majorRisks.map(item=>`리스크: ${item.label} (${item.mentionCount})`)];
  for(const [key,count] of Object.entries(view.tiedBoundaryCounts))if(count>0)output.push(`${tieLabel(key)} 외 동일 관심도 ${count}개`);return output;
}
function investmentChangeLines(model:NewsletterViewModel):string[]{return model.investmentMapV1?.changes.map(item=>`${item.label}: ${item.detail}`)??[];}
function tieLabel(key:string):string{return key==='institutionalFocus'?'Institutional Focus':key==='koreaResearchFocus'?'Korea Research Focus':key==='crossMarketThemes'?'Cross-Market Themes':key==='mostDiscussedStocks'?'Most Discussed Stocks':'Major Risks';}
function dedupeSources(values:NewsletterSourceLink[]):NewsletterSourceLink[]{const map=new Map<string,NewsletterSourceLink>();for(const source of values)if(!map.has(source.url))map.set(source.url,source);return [...map.values()];}
function fingerprintNewsletter(model:NewsletterViewModel):string { return createHash('sha256').update(JSON.stringify(model)).digest('hex'); }

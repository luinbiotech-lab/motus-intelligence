import { createHash } from 'node:crypto';
import type { BrokerageMoney, BrokerageRating, BrokerageResearchItem, RatingChange, TargetPriceChange } from './brokerage-research.js';
import type { CrossIntelligenceChain } from './cross-intelligence.js';
import type { KoreaMarketFact } from './korea-market.js';
import type { CompanyId, ResearchIntelligenceItem } from './schema.js';

export type InvestmentMapComparisonWindow='DAILY'|'WEEKLY';
export interface InvestmentFocusItem {
  key:string; label:string; mentionCount:number; institutionCount:number;
  supportingInstitutionNames:string[]; evidenceIds:string[];
}
export interface InvestmentStockItem {
  companyId:CompanyId; company:string; ticker:string|null; mentionCount:number; institutionCount:number;
  supportingInstitutions:string[]; majorReasons:string[]; relatedThemes:string[];
}
export interface InvestmentTargetPriceChange {
  researchId:string; company:string; institution:string; previousTargetPrice:BrokerageMoney|null; targetPrice:BrokerageMoney; direction:Exclude<TargetPriceChange,'UNKNOWN'>; evidenceIds:string[];
}
export interface InvestmentRatingChange {
  researchId:string; company:string; institution:string; previousRating:BrokerageRating|null; rating:BrokerageRating|null; ratingChange:Exclude<RatingChange,'UNKNOWN'>; evidenceIds:string[];
}
export interface InvestmentTextAggregate { label:string; mentionCount:number; supportingInstitutions:string[]; evidenceIds:string[] }
export interface InvestmentAttentionChange { key:string; label:string; previousMentionCount:number; currentMentionCount:number; change:number }
export interface InvestmentMarketReaction { factId:string; label:string; direction:'UP'|'DOWN'|'FLAT'; source:string }
export interface InvestmentMapHistorySnapshot { issueDate:string; themeMentions:{key:string;label:string;mentionCount:number}[] }
export interface InvestmentMapProvenance {
  includedResearchIds:string[]; includedIntelligenceIds:string[]; crossIntelligenceIds:string[];
  attentionExcludedMarketFactIds:string[]; marketReactionFactIds:string[];
  evidenceIds:string[]; sourceIds:string[];
  duplicates:{duplicateId:string;retainedId:string;reason:'SAME_RESEARCH_ID'|'SAME_PUBLISHER_REPORT'|'SAME_CANONICAL_SOURCE'|'SAME_PUBLISHER_EVENT'}[];
}
export interface InvestmentMap {
  investmentMapId:string; issueDate:string;
  institutionalFocus:InvestmentFocusItem[]; koreaResearchFocus:InvestmentFocusItem[]; crossMarketThemes:InvestmentFocusItem[];
  mostDiscussedStocks:InvestmentStockItem[]; newlyEmergingThemes:InvestmentAttentionChange[];
  increasedAttention:InvestmentAttentionChange[]; decreasedAttention:InvestmentAttentionChange[];
  targetPriceChanges:InvestmentTargetPriceChange[]; ratingChanges:InvestmentRatingChange[];
  investmentStrategies:InvestmentTextAggregate[]; majorRisks:InvestmentTextAggregate[];
  marketReactions:InvestmentMarketReaction[];
  comparisonWindow:InvestmentMapComparisonWindow|null; sourceCount:number; researchItemCount:number;
  provenance:InvestmentMapProvenance; historySnapshot:InvestmentMapHistorySnapshot; generatedAt:string;
}
export interface InvestmentMapInput {
  brokerageResearch:BrokerageResearchItem[]; wallStreetIntelligence:ResearchIntelligenceItem[];
  crossIntelligence:CrossIntelligenceChain[]; aiIntelligence:ResearchIntelligenceItem[];
  koreaMarketFacts?:KoreaMarketFact[]; history?:InvestmentMapHistorySnapshot;
}
export interface InvestmentMapOptions { issueDate:string; generatedAt:string; comparisonWindow?:InvestmentMapComparisonWindow }
export interface InvestmentMapNewsletterView {
  institutionalFocus:PublicFocus[]; koreaResearchFocus:PublicFocus[]; crossMarketThemes:PublicFocus[];
  mostDiscussedStocks:{label:string;mentionCount:number;institutionCount:number;supportingInstitutions:string[];majorReasons:string[];relatedThemes:string[]}[];
  changes:{label:string;detail:string}[]; majorRisks:PublicTextAggregate[];
}
export interface InvestmentMapA4CompactView {
  institutionalFocus:PublicFocus[]; koreaResearchFocus:PublicFocus[]; crossMarketThemes:PublicFocus[];
  mostDiscussedStocks:{label:string;mentionCount:number;institutionCount:number}[]; majorRisks:PublicTextAggregate[];
}
interface PublicFocus { label:string;mentionCount:number;institutionCount:number;supportingInstitutions:string[] }
interface PublicTextAggregate { label:string;mentionCount:number;supportingInstitutions:string[] }
interface Observation {
  id:string;kind:'WALL_STREET'|'KOREA_RESEARCH'|'AI';publisher:string|null;headline:string;publishedAt:string;eventId:string|null;canonicalSource:string;
  focuses:{key:string;label:string}[];company:{companyId:CompanyId;company:string;ticker:string|null}|null;
  reason:string|null;strategies:string[];risks:string[];evidenceIds:string[];sourceIds:string[];
  targetPriceChange:InvestmentTargetPriceChange|null;ratingChange:InvestmentRatingChange|null;
}
interface AggregateState { key:string;label:string;observationIds:Set<string>;institutions:Set<string>;evidenceIds:Set<string> }

const acceptedStatuses=['VERIFIED','PARTIALLY_VERIFIED','PRIMARY_SOURCE_ONLY'] as const;
const nonEmpty=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0;
const unique=<T>(values:T[])=>[...new Set(values)];

export function buildInvestmentMap(input:InvestmentMapInput,options:InvestmentMapOptions):InvestmentMap {
  requireDate(options.issueDate); requireTime(options.generatedAt);
  if(input.history&&!options.comparisonWindow) throw new Error('comparisonWindow is required when history is provided');
  const raw=[...input.wallStreetIntelligence.filter(acceptedIntelligence).map(normalizeWallStreet),...input.brokerageResearch.filter(acceptedBrokerage).map(normalizeBrokerage),...input.aiIntelligence.filter(acceptedIntelligence).map(normalizeAI)];
  const deduped=dedupeObservations(raw); const observations=deduped.observations;
  const wall=observations.filter(item=>item.kind==='WALL_STREET'); const korea=observations.filter(item=>item.kind==='KOREA_RESEARCH');
  const institutionalFocus=aggregateFocus(wall); const koreaResearchFocus=aggregateFocus(korea);
  const crossMarketThemes=aggregateCrossMarket(wall,korea,input.crossIntelligence);
  const mostDiscussedStocks=aggregateStocks([...wall,...korea]);
  const targetPriceChanges=korea.flatMap(item=>item.targetPriceChange?[item.targetPriceChange]:[]);
  const ratingChanges=korea.flatMap(item=>item.ratingChange?[item.ratingChange]:[]);
  const investmentStrategies=aggregateText(korea,'strategies'); const majorRisks=aggregateText(korea,'risks');
  const currentThemeCounts=aggregateFocus(observations).map(item=>({key:item.key,label:item.label,mentionCount:item.mentionCount}));
  const comparison=compareHistory(currentThemeCounts,input.history);
  const marketReactions=buildMarketReactions(input.koreaMarketFacts??[],input.crossIntelligence);
  const evidenceIds=unique(observations.flatMap(item=>item.evidenceIds)).sort(); const sourceIds=unique(observations.flatMap(item=>item.sourceIds)).sort();
  const inputIds=observations.map(item=>item.id).sort();
  const investmentMapId=`investment-map:${options.issueDate}:${hash(inputIds.join('|'))}`;
  return {
    investmentMapId,issueDate:options.issueDate,institutionalFocus,koreaResearchFocus,crossMarketThemes,mostDiscussedStocks,
    newlyEmergingThemes:comparison.newlyEmergingThemes,increasedAttention:comparison.increasedAttention,decreasedAttention:comparison.decreasedAttention,
    targetPriceChanges,ratingChanges,investmentStrategies,majorRisks,marketReactions,
    comparisonWindow:input.history?options.comparisonWindow!:null,
    sourceCount:unique(observations.map(item=>item.canonicalSource)).length,researchItemCount:observations.filter(item=>item.kind!=='AI').length,
    provenance:{
      includedResearchIds:korea.map(item=>item.id).sort(),includedIntelligenceIds:observations.filter(item=>item.kind!=='KOREA_RESEARCH').map(item=>item.id).sort(),
      crossIntelligenceIds:unique(input.crossIntelligence.map(chain=>chain.crossIntelligenceId)).sort(),
      attentionExcludedMarketFactIds:unique((input.koreaMarketFacts??[]).map(fact=>fact.factId)).sort(),marketReactionFactIds:unique(marketReactions.map(reaction=>reaction.factId)).sort(),
      evidenceIds,sourceIds,duplicates:deduped.duplicates
    },
    historySnapshot:{issueDate:options.issueDate,themeMentions:currentThemeCounts},generatedAt:options.generatedAt
  };
}

function normalizeWallStreet(item:ResearchIntelligenceItem):Observation {
  const publisher=item.publisher??item.source; const evidenceIds=unique([...item.evidenceIds,...item.provenance.sources.map(source=>source.evidenceId)]);
  return {
    id:item.intelligenceId,kind:'WALL_STREET',publisher,headline:item.headline,publishedAt:item.publishedAt??item.collectedAt,eventId:item.eventId,canonicalSource:canonicalUrl(item.sourceUrl),
    focuses:intelligenceFocuses(item),company:item.companyId&&item.company?{companyId:item.companyId,company:item.company,ticker:item.ticker}:null,
    reason:item.institutionView??item.summary,strategies:[],risks:[],evidenceIds,sourceIds:item.provenance.sources.map(source=>source.sourceId),targetPriceChange:null,ratingChange:null
  };
}
function normalizeAI(item:ResearchIntelligenceItem):Observation {
  return {
    id:item.intelligenceId,kind:'AI',publisher:item.publisher,headline:item.headline,publishedAt:item.publishedAt??item.collectedAt,eventId:item.eventId,canonicalSource:canonicalUrl(item.sourceUrl),
    focuses:intelligenceFocuses(item),company:null,reason:null,strategies:[],risks:[],evidenceIds:unique([...item.evidenceIds,...item.provenance.sources.map(source=>source.evidenceId)]),
    sourceIds:item.provenance.sources.map(source=>source.sourceId),targetPriceChange:null,ratingChange:null
  };
}
function normalizeBrokerage(item:BrokerageResearchItem):Observation {
  const evidenceIds=unique(item.evidence.map(value=>value.evidenceId));
  const company=item.companyId&&item.company?{companyId:item.companyId,company:item.company,ticker:item.ticker}:null;
  const targetPriceChange=item.targetPrice&&item.targetPriceChange!=='UNKNOWN'&&item.company?{researchId:item.researchId,company:item.company,institution:item.publisher,previousTargetPrice:item.previousTargetPrice,targetPrice:item.targetPrice,direction:item.targetPriceChange,evidenceIds}:null;
  const ratingChange=item.ratingChange!=='UNKNOWN'&&item.company?{researchId:item.researchId,company:item.company,institution:item.publisher,previousRating:item.previousRating,rating:item.rating,ratingChange:item.ratingChange,evidenceIds}:null;
  return {
    id:item.researchId,kind:'KOREA_RESEARCH',publisher:item.publisher,headline:item.headline,publishedAt:item.publishedAt,eventId:item.eventId,canonicalSource:canonicalUrl(item.sourceUrl),
    focuses:uniqueFocuses([...(item.themeId?[{key:item.themeId,label:displayId(item.themeId)}]:[]),...(item.sector?[{key:sectorKey(item.sector),label:item.sector}]:[])]),company,
    reason:item.institutionView,strategies:[...item.investmentStrategy],risks:[...item.riskFactors],evidenceIds,sourceIds:item.provenance.map(source=>source.sourceRecordId),targetPriceChange,ratingChange
  };
}
function intelligenceFocuses(item:ResearchIntelligenceItem):{key:string;label:string}[] {
  return uniqueFocuses([
    ...(item.themeId?[{key:item.themeId,label:item.theme??displayId(item.themeId)}]:[]),
    ...(item.relatedThemeIds??[]).map(themeId=>({key:themeId,label:displayId(themeId)})),
    ...(item.sector?[{key:sectorKey(item.sector),label:item.sector}]:[]),
    ...item.relatedSectors.map(sector=>({key:sectorKey(sector),label:displayId(sector)}))
  ]);
}

function dedupeObservations(values:Observation[]):{observations:Observation[];duplicates:InvestmentMapProvenance['duplicates']} {
  const kept:Observation[]=[]; const duplicates:InvestmentMapProvenance['duplicates']=[];
  const ids=new Map<string,Observation>(); const reports=new Map<string,Observation>(); const urls=new Map<string,Observation>(); const events=new Map<string,Observation>();
  for(const value of values){
    const reportKey=`${value.publisher??''}\u0000${fingerprint(value.headline)}\u0000${value.publishedAt}`;
    const sourceKey=`${value.publisher??''}\u0000${value.canonicalSource}`; const eventKey=value.eventId?`${value.publisher??''}\u0000${value.eventId}`:null;
    const match=ids.get(value.id)??reports.get(reportKey)??urls.get(sourceKey)??(eventKey?events.get(eventKey):undefined);
    if(match){
      const reason=ids.has(value.id)?'SAME_RESEARCH_ID':reports.has(reportKey)?'SAME_PUBLISHER_REPORT':urls.has(sourceKey)?'SAME_CANONICAL_SOURCE':'SAME_PUBLISHER_EVENT';
      mergeObservation(match,value); duplicates.push({duplicateId:value.id,retainedId:match.id,reason}); continue;
    }
    kept.push(value);ids.set(value.id,value);reports.set(reportKey,value);urls.set(sourceKey,value);if(eventKey)events.set(eventKey,value);
  }
  return {observations:kept,duplicates};
}
function mergeObservation(target:Observation,incoming:Observation):void {
  target.focuses=uniqueFocuses([...target.focuses,...incoming.focuses]);target.strategies=unique([...target.strategies,...incoming.strategies]);target.risks=unique([...target.risks,...incoming.risks]);
  target.evidenceIds=unique([...target.evidenceIds,...incoming.evidenceIds]);target.sourceIds=unique([...target.sourceIds,...incoming.sourceIds]);
  target.company??=incoming.company;target.reason??=incoming.reason;target.targetPriceChange??=incoming.targetPriceChange;target.ratingChange??=incoming.ratingChange;
}

function aggregateFocus(observations:Observation[]):InvestmentFocusItem[] {
  const map=new Map<string,AggregateState>();
  for(const observation of observations)for(const focus of observation.focuses){
    const state=map.get(focus.key)??{key:focus.key,label:focus.label,observationIds:new Set(),institutions:new Set(),evidenceIds:new Set()};
    state.observationIds.add(observation.id);if(observation.publisher)state.institutions.add(observation.publisher);for(const evidenceId of observation.evidenceIds)state.evidenceIds.add(evidenceId);map.set(focus.key,state);
  }
  return sortFocus([...map.values()].map(toFocus));
}
function aggregateCrossMarket(wall:Observation[],korea:Observation[],chains:CrossIntelligenceChain[]):InvestmentFocusItem[] {
  const wallMap=observationFocusMap(wall),koreaMap=observationFocusMap(korea); const keys=new Set([...wallMap.keys()].filter(key=>koreaMap.has(key)));
  for(const chain of chains)if(chain.wallStreetIntelligenceIds.length&&chain.koreaResearchIds.length){if(chain.primaryThemeId)keys.add(chain.primaryThemeId);for(const themeId of chain.relatedThemeIds)keys.add(themeId);}
  const output:InvestmentFocusItem[]=[];
  for(const key of keys){
    const wallItems=wallMap.get(key)??[];const koreaItems=koreaMap.get(key)??[];const chainIds=chains.filter(chain=>chain.wallStreetIntelligenceIds.length&&chain.koreaResearchIds.length&&(chain.primaryThemeId===key||chain.relatedThemeIds.includes(key as `theme:${string}`))).flatMap(chain=>[...chain.wallStreetIntelligenceIds,...chain.koreaResearchIds]);
    const ids=unique([...wallItems.map(item=>item.id),...koreaItems.map(item=>item.id),...chainIds]);const institutions=unique([...wallItems,...koreaItems].map(item=>item.publisher).filter(nonEmpty));
    const label=wallItems.flatMap(item=>item.focuses).find(item=>item.key===key)?.label??koreaItems.flatMap(item=>item.focuses).find(item=>item.key===key)?.label??displayId(key);
    output.push({key,label,mentionCount:ids.length,institutionCount:institutions.length,supportingInstitutionNames:institutions.sort(),evidenceIds:unique([...wallItems,...koreaItems].flatMap(item=>item.evidenceIds)).sort()});
  }
  return sortFocus(output);
}
function aggregateStocks(observations:Observation[]):InvestmentStockItem[] {
  const groups=new Map<string,{companyId:CompanyId;company:string;ticker:string|null;ids:Set<string>;institutions:Set<string>;reasons:Set<string>;themes:Set<string>} >();
  for(const item of observations){if(!item.company)continue;const group=groups.get(item.company.companyId)??{...item.company,ids:new Set(),institutions:new Set(),reasons:new Set(),themes:new Set()};group.ids.add(item.id);if(item.publisher)group.institutions.add(item.publisher);if(item.reason)group.reasons.add(item.reason);for(const focus of item.focuses.filter(value=>value.key.startsWith('theme:')))group.themes.add(focus.label);groups.set(item.company.companyId,group);}
  return [...groups.values()].map(group=>({companyId:group.companyId,company:group.company,ticker:group.ticker,mentionCount:group.ids.size,institutionCount:group.institutions.size,supportingInstitutions:[...group.institutions].sort(),majorReasons:[...group.reasons],relatedThemes:[...group.themes]})).sort(compareCount);
}
function aggregateText(observations:Observation[],field:'strategies'|'risks'):InvestmentTextAggregate[] {
  const groups=new Map<string,{label:string;ids:Set<string>;institutions:Set<string>;evidenceIds:Set<string>} >();
  for(const item of observations)for(const label of item[field]){const key=fingerprint(label);const group=groups.get(key)??{label,ids:new Set(),institutions:new Set(),evidenceIds:new Set()};group.ids.add(item.id);if(item.publisher)group.institutions.add(item.publisher);for(const evidenceId of item.evidenceIds)group.evidenceIds.add(evidenceId);groups.set(key,group);}
  return [...groups.values()].map(group=>({label:group.label,mentionCount:group.ids.size,supportingInstitutions:[...group.institutions].sort(),evidenceIds:[...group.evidenceIds].sort()})).sort(compareCount);
}
function compareHistory(current:{key:string;label:string;mentionCount:number}[],history:InvestmentMapHistorySnapshot|undefined):{newlyEmergingThemes:InvestmentAttentionChange[];increasedAttention:InvestmentAttentionChange[];decreasedAttention:InvestmentAttentionChange[]} {
  if(!history)return {newlyEmergingThemes:[],increasedAttention:[],decreasedAttention:[]};
  const previous=new Map(history.themeMentions.map(item=>[item.key,item]));const now=new Map(current.map(item=>[item.key,item]));const changes:InvestmentAttentionChange[]=[];
  for(const key of unique([...previous.keys(),...now.keys()])){const before=previous.get(key),after=now.get(key);const prior=before?.mentionCount??0,currentCount=after?.mentionCount??0;if(prior===currentCount)continue;changes.push({key,label:after?.label??before!.label,previousMentionCount:prior,currentMentionCount:currentCount,change:currentCount-prior});}
  return {newlyEmergingThemes:changes.filter(item=>item.previousMentionCount===0&&item.currentMentionCount>0),increasedAttention:changes.filter(item=>item.previousMentionCount>0&&item.change>0),decreasedAttention:changes.filter(item=>item.change<0)};
}
function buildMarketReactions(facts:KoreaMarketFact[],chains:CrossIntelligenceChain[]):InvestmentMarketReaction[] {
  const linked=new Set(chains.flatMap(chain=>chain.koreaMarketFactIds));return facts.filter(fact=>linked.has(fact.factId)&&acceptedStatuses.includes(fact.verificationStatus as typeof acceptedStatuses[number])).flatMap(fact=>{
    if(!['INVESTOR_NET_FLOW','PROGRAM_NET_FLOW','SECTOR_CHANGE_PCT','SECURITY_CHANGE_PCT'].includes(fact.factType))return [];
    const direction=fact.value>0?'UP':fact.value<0?'DOWN':'FLAT';const label=fact.factType==='SECTOR_CHANGE_PCT'?`${fact.sectorLabel} 업종 반응`:fact.factType==='SECURITY_CHANGE_PCT'?`${fact.company} 시장 반응`:`${fact.marketId} ${fact.factType}`;
    return [{factId:fact.factId,label,direction,source:fact.source} as InvestmentMarketReaction];
  });
}

export function buildInvestmentMapNewsletterView(map:InvestmentMap):InvestmentMapNewsletterView {
  const changes=[...map.targetPriceChanges.map(item=>({label:`${item.company} · ${item.institution}`,detail:`목표주가 ${money(item.previousTargetPrice)} → ${money(item.targetPrice)} · ${item.direction}`})),...map.ratingChanges.map(item=>({label:`${item.company} · ${item.institution}`,detail:`투자의견 ${item.previousRating??'없음'} → ${item.rating??'없음'} · ${item.ratingChange}`}))];
  return {
    institutionalFocus:map.institutionalFocus.map(publicFocus),koreaResearchFocus:map.koreaResearchFocus.map(publicFocus),crossMarketThemes:map.crossMarketThemes.map(publicFocus),
    mostDiscussedStocks:map.mostDiscussedStocks.map(item=>({label:`${item.company}${item.ticker?` (${item.ticker})`:''}`,mentionCount:item.mentionCount,institutionCount:item.institutionCount,supportingInstitutions:[...item.supportingInstitutions],majorReasons:[...item.majorReasons],relatedThemes:[...item.relatedThemes]})),
    changes,majorRisks:map.majorRisks.map(publicText)
  };
}
export function buildInvestmentMapA4CompactView(map:InvestmentMap):InvestmentMapA4CompactView {
  return {
    institutionalFocus:takeWithoutSplittingTies(map.institutionalFocus,3).map(publicFocus),koreaResearchFocus:takeWithoutSplittingTies(map.koreaResearchFocus,3).map(publicFocus),
    crossMarketThemes:takeWithoutSplittingTies(map.crossMarketThemes,3).map(publicFocus),
    mostDiscussedStocks:takeWithoutSplittingTies(map.mostDiscussedStocks,5).map(item=>({label:`${item.company}${item.ticker?` (${item.ticker})`:''}`,mentionCount:item.mentionCount,institutionCount:item.institutionCount})),
    majorRisks:takeWithoutSplittingTies(map.majorRisks,3).map(publicText)
  };
}
function takeWithoutSplittingTies<T extends {mentionCount:number;institutionCount?:number}>(items:T[],limit:number):T[] {
  if(items.length<=limit)return [...items];const at=items[limit-1];if(!at)return [];
  const tied=items.filter(item=>item.mentionCount===at.mentionCount&&(item.institutionCount??-1)===(at.institutionCount??-1));const before=items.filter(item=>item.mentionCount>at.mentionCount||(item.mentionCount===at.mentionCount&&(item.institutionCount??-1)>(at.institutionCount??-1)));
  return before.length+tied.length<=limit?[...before,...tied]:before;
}

function observationFocusMap(values:Observation[]):Map<string,Observation[]>{const map=new Map<string,Observation[]>();for(const item of values)for(const focus of item.focuses)map.set(focus.key,[...(map.get(focus.key)??[]),item]);return map;}
function toFocus(state:AggregateState):InvestmentFocusItem{return {key:state.key,label:state.label,mentionCount:state.observationIds.size,institutionCount:state.institutions.size,supportingInstitutionNames:[...state.institutions].sort(),evidenceIds:[...state.evidenceIds].sort()};}
function sortFocus<T extends {label:string;mentionCount:number;institutionCount:number}>(values:T[]):T[]{return values.sort((a,b)=>b.mentionCount-a.mentionCount||b.institutionCount-a.institutionCount||a.label.localeCompare(b.label,'ko'));}
function compareCount<T extends {label?:string;company?:string;mentionCount:number;institutionCount?:number}>(a:T,b:T):number{return b.mentionCount-a.mentionCount||(b.institutionCount??0)-(a.institutionCount??0)||(a.label??a.company??'').localeCompare(b.label??b.company??'','ko');}
function uniqueFocuses(values:{key:string;label:string}[]):{key:string;label:string}[]{const map=new Map<string,{key:string;label:string}>();for(const value of values)if(nonEmpty(value.key)&&nonEmpty(value.label)&&!map.has(value.key))map.set(value.key,value);return [...map.values()];}
function publicFocus(item:InvestmentFocusItem):PublicFocus{return {label:item.label,mentionCount:item.mentionCount,institutionCount:item.institutionCount,supportingInstitutions:[...item.supportingInstitutionNames]};}
function publicText(item:InvestmentTextAggregate):PublicTextAggregate{return {label:item.label,mentionCount:item.mentionCount,supportingInstitutions:[...item.supportingInstitutions]};}
function acceptedIntelligence(item:ResearchIntelligenceItem):boolean{return acceptedStatuses.includes(item.verificationStatus as typeof acceptedStatuses[number]);}
function acceptedBrokerage(item:BrokerageResearchItem):boolean{return acceptedStatuses.includes(item.verificationStatus as typeof acceptedStatuses[number]);}
function canonicalUrl(value:string):string{try{const url=new URL(value);for(const key of [...url.searchParams.keys()])if(key.toLowerCase().startsWith('utm_'))url.searchParams.delete(key);url.hash='';if(url.pathname.length>1)url.pathname=url.pathname.replace(/\/+$/,'');return url.toString();}catch{return value;}}
function fingerprint(value:string):string{return value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9가-힣]+/g,' ').trim().replace(/\s+/g,' ');}
function displayId(value:string):string{return value.replace(/^(theme|sector):/,'').replaceAll('-',' ');}
function sectorKey(value:string):string{return value.startsWith('sector:')?value:`sector:${fingerprint(value).replaceAll(' ','-')}`;}
function money(value:BrokerageMoney|null):string{return value?`${value.value.toLocaleString('ko-KR')} ${value.currency}`:'없음';}
function hash(value:string):string{return createHash('sha256').update(value).digest('hex').slice(0,20);}
function requireDate(value:string):void{if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value)))throw new Error('issueDate: valid date required');}
function requireTime(value:string):void{if(!Number.isFinite(Date.parse(value)))throw new Error('generatedAt: ISO timestamp required');}

import type {MajorIndexHistory} from '../content/publisher-schema.js';
import type {EditorialReviewState} from './daily-editorial-plan.js';
import type {SearchIntelligenceSnapshot,VerifiedSearchTopic} from '../search/intelligence.js';

export interface DemandAwareEditorialContext {
  verifiedTopicIds:string[];
  publicKeywords:string[];
  selectedAngle:string|null;
  excludedQueries:string[];
  providerWarnings:string[];
  reviewState:EditorialReviewState;
  publicationGateUnchanged:true;
  internalSignalIds:string[];
}

export function buildDemandAwareEditorialContext(input:{snapshot:SearchIntelligenceSnapshot;candidateTopicIds:string[];reviewState:EditorialReviewState;preferredAngle?:string|null}):DemandAwareEditorialContext {
  const topics=input.snapshot.topics.filter(topic=>input.candidateTopicIds.includes(topic.topicId));const allowed=new Set(topics.map(item=>item.topicId));
  const matched=input.snapshot.signals.filter(signal=>allowed.has(signal.topicId));const unmatched=input.snapshot.signals.filter(signal=>!allowed.has(signal.topicId));
  const publicKeywords=dedupe(matched.map(signal=>signal.query)).filter(term=>naturalKeyword(term,topics));
  return {verifiedTopicIds:topics.map(item=>item.topicId),publicKeywords,selectedAngle:topics.length?input.preferredAngle?.trim()||topics[0]!.label:null,excludedQueries:dedupe(unmatched.map(item=>item.query)),providerWarnings:[...input.snapshot.warnings],reviewState:input.reviewState,publicationGateUnchanged:true,internalSignalIds:matched.map(item=>item.signalId)};
}

export function assertNaturalSearchTitle(title:string,keywords:string[]):void {
  if(/[|｜]{2,}|[,/#]{3,}/.test(title)||title.length>80)throw new Error('unnatural search title');
  for(const keyword of dedupe(keywords))if(occurrences(title,keyword)>1)throw new Error('keyword stuffing detected');
}

export function prepareThreeMonthChart(history:MajorIndexHistory,targetSessions=63):{history:MajorIndexHistory;state:'READY'|'INSUFFICIENT_VERIFIED_HISTORY';targetSessions:number;syntheticPoints:0}{
  const count=Math.min(history.sessionCount,...history.series.map(item=>Math.min(item.dates.length,item.closes.length,item.provenance.length)));
  if(count<targetSessions)return {history:structuredClone(history),state:'INSUFFICIENT_VERIFIED_HISTORY',targetSessions,syntheticPoints:0};
  const series=history.series.map(item=>({...structuredClone(item),dates:item.dates.slice(-targetSessions),closes:item.closes.slice(-targetSessions),provenance:item.provenance.slice(-targetSessions)}));
  return {history:{...structuredClone(history),sessionCount:targetSessions,series},state:'READY',targetSessions,syntheticPoints:0};
}

export function explainMarketTermsAtFirstMention(text:string):string {
  const definitions:Record<string,string>={VIX:'VIX (변동성지수)',DXY:'DXY (달러인덱스)','미국 10년물':'U.S. 10Y Treasury Yield (미국 10년물 국채금리)'};
  let output=text;for(const [term,expanded] of Object.entries(definitions)){const index=output.indexOf(term);if(index>=0&&!output.includes(expanded))output=`${output.slice(0,index)}${expanded}${output.slice(index+term.length)}`;}return output;
}
function naturalKeyword(value:string,topics:VerifiedSearchTopic[]):boolean {const normalized=value.trim();return normalized.length>=2&&normalized.length<=40&&topics.some(topic=>[topic.label,...topic.aliases].some(term=>normalize(normalized).includes(normalize(term))||normalize(term).includes(normalize(normalized))));}
function occurrences(text:string,term:string):number {if(!term.trim())return 0;return text.toLowerCase().split(term.toLowerCase()).length-1;}
function normalize(value:string):string{return value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9가-힣]+/g,' ').trim();}
function dedupe(values:string[]):string[]{return [...new Set(values.map(value=>value.trim()).filter(Boolean))];}

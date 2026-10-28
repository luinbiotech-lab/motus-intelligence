import {collectDemandSignals,GoogleSearchConsoleSignalProvider,NaverDataLabProvider,type SearchDemandProvider} from './providers.js';
import {searchConsoleFromEnvironment} from './google-console-live.js';
import type {DemandSignal,VerifiedSearchTopic} from './intelligence.js';
import {buildSearchRankingEvidence,type SearchRankingEvidence} from './publication-demand.js';

export type SearchFreshness='SAME_DAY_NAVER_SIGNAL'|'PREVIOUS_DAY_NAVER_SIGNAL'|'GSC_HISTORICAL'|'NO_SEARCH_SIGNAL';
export interface PreRenderSearchContext {collectedAt:string;signalDate:string|null;provider:string|null;freshness:SearchFreshness;fallbackReason:string|null;warnings:string[];orderedTopicIds:string[];selectedSecondaryTopicId:string|null;factsChanged:false;gateOverride:false;rankingEvidence?:SearchRankingEvidence}

export async function collectPreRenderSearch(topics:VerifiedSearchTopic[],at:string,environment:NodeJS.ProcessEnv=process.env):Promise<PreRenderSearchContext>{
 const providers:SearchDemandProvider[]=[],operationDate=kstDate(at),previousDate=new Date(Date.parse(operationDate+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 const clientId=environment.NAVER_DATALAB_CLIENT_ID?.trim(),clientSecret=environment.NAVER_DATALAB_CLIENT_SECRET?.trim();
 if(clientId&&clientSecret)providers.push(new NaverDataLabProvider({startDate:previousDate,endDate:operationDate,timeUnit:'date',keywordGroups:topics.map(topic=>({groupName:topic.label,keywords:[topic.label,...topic.aliases]}))},{clientId,clientSecret}));
 const google=searchConsoleFromEnvironment(environment);if(google&&environment.GOOGLE_SEARCH_CONSOLE_PROPERTY){const start=new Date(Date.parse(operationDate+'T00:00:00Z')-27*86400000).toISOString().slice(0,10);providers.push(new GoogleSearchConsoleSignalProvider(google,{propertyId:environment.GOOGLE_SEARCH_CONSOLE_PROPERTY,dimensions:['date','page','query'],startDate:start,endDate:operationDate}))}
 const collected=await collectDemandSignals(providers,topics,at),orderedTopicIds=orderVerifiedTopics(topics,collected.signals,operationDate),best=bestSignals(collected.signals,operationDate,previousDate),selected=orderedTopicIds.slice(1).find(id=>best.has(id))??null,signal=selected?best.get(selected)??null:null;
 return {collectedAt:at,signalDate:signal?.observedAt??null,provider:signal?.provider??null,freshness:freshness(signal,operationDate,previousDate),fallbackReason:providers.length?signal?null:'NO_MATCHING_VERIFIED_TOPIC':'SEARCH_PROVIDER_NOT_CONFIGURED',warnings:collected.warnings,orderedTopicIds,selectedSecondaryTopicId:selected,factsChanged:false,gateOverride:false,rankingEvidence:buildSearchRankingEvidence(topics,collected.signals,selected,operationDate)};
}

export function orderVerifiedTopics(topics:VerifiedSearchTopic[],signals:DemandSignal[],operationDate:string):string[]{const previousDate=new Date(Date.parse(operationDate+'T00:00:00Z')-86400000).toISOString().slice(0,10),best=bestSignals(signals,operationDate,previousDate),major=topics[0]?.topicId,rest=topics.slice(1).sort((a,b)=>score(best.get(b.topicId))-score(best.get(a.topicId)));return [...(major?[major]:[]),...rest.map(topic=>topic.topicId)]}

function bestSignals(signals:DemandSignal[],same:string,previous:string):Map<string,DemandSignal>{const map=new Map<string,DemandSignal>();for(const signal of signals){const prior=map.get(signal.topicId);if(!prior||rank(signal,same,previous)>rank(prior,same,previous)||rank(signal,same,previous)===rank(prior,same,previous)&&score(signal)>score(prior))map.set(signal.topicId,signal)}return map}
function rank(signal:DemandSignal,same:string,previous:string){return signal.provider==='NAVER_DATALAB'&&signal.observedAt===same?3:signal.provider==='NAVER_DATALAB'&&signal.observedAt===previous?2:signal.provider==='GOOGLE_SEARCH_CONSOLE'?1:0}
function score(signal:DemandSignal|undefined){if(!signal)return -1;return signal.metrics.relativeRatios?.at(-1)??signal.metrics.impressions??0}
function freshness(signal:DemandSignal|null,same:string,previous:string):SearchFreshness{return !signal?'NO_SEARCH_SIGNAL':signal.provider==='NAVER_DATALAB'&&signal.observedAt===same?'SAME_DAY_NAVER_SIGNAL':signal.provider==='NAVER_DATALAB'&&signal.observedAt===previous?'PREVIOUS_DAY_NAVER_SIGNAL':'GSC_HISTORICAL'}
function kstDate(value:string){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))}

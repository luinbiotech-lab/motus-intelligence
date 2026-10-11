import { createHash } from 'node:crypto';
import type { ContentLibraryStore } from '../library/content-library.js';
import { findPriorCoverage,retrieveEditorialMemory,type EditorialMemoryRecord,type EditorialMemoryStore,type PriorCoverageResult } from '../library/retrieval.js';
import {buildDemandAwareEditorialContext,type DemandAwareEditorialContext} from './demand-aware.js';
import type {SearchIntelligenceSnapshot} from '../search/intelligence.js';

export type EditorialCategory='AI_INTELLIGENCE'|'US_MARKET'|'KOREA_MARKET';
export type CoverageState='NEW'|'FOLLOW_UP'|'RELATED'|'DUPLICATE';
export type RecommendedTreatment='LEAD'|'STANDARD'|'BRIEF'|'FOLLOW_UP'|'DEFER'|'REJECT';
export type EditorialReviewState='APPROVAL_REQUIRED'|'APPROVED'|'MODIFY'|'HOLD'|'REJECT';

export interface EditorialDepthGate { whatHappened:string;whyImportant:string;whatChanged:string;marketMeaning:string;whatNext:string }
export interface EditorialCandidateInput {
  candidateId:string;topic:string;companyIds:string[];themeIds:string[];eventId:string|null;continuationOfEventId:string|null;
  sourceRefs:string[];importanceReason:string;noveltyReason:string;marketRelevance:string;sourceQuality:string;
  crossVerification:string[];recommendedTreatment?:RecommendedTreatment;lead?:boolean;depth:EditorialDepthGate;
}
export interface EditorialCandidate extends EditorialCandidateInput {
  coverageState:CoverageState;priorCoverage:{state:PriorCoverageResult['state'];relatedRecordIds:string[];basis:string[]};
  recommendedTreatment:RecommendedTreatment;memoryRefs:string[];
}
export interface DailyEditorialPlan {
  planId:string;category:EditorialCategory;issueDate:string;candidates:EditorialCandidate[];selected:EditorialCandidate[];
  deferred:EditorialCandidate[];rejected:EditorialCandidate[];reviewState:EditorialReviewState;reviewedBy:null;reviewedAt:null;
  weeklyFeedEligible:boolean;contentDepthGate:'PASS'|'FAIL';externalActions:{bloggerLookup:number;bloggerInsert:0;bloggerPatch:0;bloggerPublish:0};commerce:{enabled:false};fingerprint:string;
  demandContext:DemandAwareEditorialContext|null;
}

export function buildDailyEditorialPlan(input:{category:EditorialCategory;issueDate:string;candidates:EditorialCandidateInput[];library:ContentLibraryStore;memory:EditorialMemoryStore;generatedAt:string;searchIntelligence?:SearchIntelligenceSnapshot}):{plan:DailyEditorialPlan;memory:EditorialMemoryStore;memoryUsed:EditorialMemoryRecord[]} {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.issueDate))throw new Error('valid issueDate required');
  let memory=input.memory;const memoryUsed:EditorialMemoryRecord[]=[];const candidates=input.candidates.map(candidate=>{
    const prior=findPriorCoverage(input.library,{...(candidate.eventId?{eventId:candidate.eventId}:{}),...(candidate.continuationOfEventId?{continuationOfEventId:candidate.continuationOfEventId}:{}),companyIds:candidate.companyIds,themeIds:candidate.themeIds,sourceRefs:candidate.sourceRefs,observedAt:input.generatedAt});
    const subjectId=candidate.companyIds[0]??candidate.themeIds[0];const subjectType=candidate.companyIds.length?'COMPANY' as const:candidate.themeIds.length?'THEME' as const:null;
    const recalled=retrieveEditorialMemory(memory,subjectId&&subjectType?{subjectType,subjectId}:{},input.generatedAt);memory=recalled.store;memoryUsed.push(...recalled.records);
    const coverageState=coverage(prior);const recommendedTreatment=treatment(candidate,coverageState);
    return {...candidate,coverageState,priorCoverage:prior,recommendedTreatment,memoryRefs:recalled.records.map(item=>item.memoryId)};
  });
  const rejected=candidates.filter(item=>item.recommendedTreatment==='REJECT');const deferred=candidates.filter(item=>item.recommendedTreatment==='DEFER');const selected=candidates.filter(item=>!['REJECT','DEFER'].includes(item.recommendedTreatment));
  const depthPass=selected.length>0&&selected.every(item=>Object.values(item.depth).every(value=>value.trim().length>0));
  const reviewState=(depthPass?'APPROVAL_REQUIRED':'MODIFY') as EditorialReviewState;
  const demandContext=input.searchIntelligence?buildDemandAwareEditorialContext({snapshot:input.searchIntelligence,candidateTopicIds:unique(selected.flatMap(item=>item.themeIds)),reviewState}):null;
  const base={planId:`editorial-plan:${input.category.toLowerCase()}:${input.issueDate}`,category:input.category,issueDate:input.issueDate,candidates,selected,deferred,rejected,reviewState,reviewedBy:null,reviewedAt:null,weeklyFeedEligible:depthPass&&selected.length>0,contentDepthGate:(depthPass?'PASS':'FAIL') as 'PASS'|'FAIL',externalActions:{bloggerLookup:0,bloggerInsert:0 as const,bloggerPatch:0 as const,bloggerPublish:0 as const},commerce:{enabled:false as const},demandContext};
  return {plan:{...base,fingerprint:hash(base)},memory,memoryUsed:dedupeMemory(memoryUsed)};
}

export function selectLatestCompletedDate(input:{category:EditorialCategory;availableDates:string[];completedThrough:string;holidays?:string[]}):string|null {
  const holidays=new Set(input.holidays??[]);return [...new Set(input.availableDates)].filter(date=>date<=input.completedThrough&&!holidays.has(date)).sort().at(-1)??null;
}

export function registerPublishedEditorial(input:{plan:DailyEditorialPlan;publicPostUrl:string;publishedAt:string}):{libraryRegistration:{publicationId:string;publicPostUrl:string};weeklyFeed:{category:EditorialCategory;issueDate:string;publicationId:string};searchRegistration:{indexed:false;submittedAt:null};memoryCandidates:{statement:string;reviewState:'REVIEW_REQUIRED'}[]} {
  if(input.plan.reviewState!=='APPROVED')throw new Error('human APPROVED required before post-publish registration');
  if(!/^https:\/\//.test(input.publicPostUrl))throw new Error('verified public URL required');
  return {libraryRegistration:{publicationId:input.plan.planId,publicPostUrl:input.publicPostUrl},weeklyFeed:{category:input.plan.category,issueDate:input.plan.issueDate,publicationId:input.plan.planId},searchRegistration:{indexed:false,submittedAt:null},memoryCandidates:input.plan.selected.map(item=>({statement:`${item.topic}: 후속 보도에서 ${item.depth.whatNext}`,reviewState:'REVIEW_REQUIRED'}))};
}

function coverage(prior:PriorCoverageResult):CoverageState {return prior.state==='NONE'?'NEW':prior.state==='FOLLOW_UP'?'FOLLOW_UP':prior.state==='DUPLICATE'?'DUPLICATE':'RELATED';}
function treatment(candidate:EditorialCandidateInput,state:CoverageState):RecommendedTreatment {if(state==='DUPLICATE')return 'REJECT';if(state==='FOLLOW_UP')return 'FOLLOW_UP';if(candidate.recommendedTreatment)return candidate.recommendedTreatment;if(candidate.lead)return 'LEAD';return 'STANDARD';}
function hash(value:unknown):string{return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;}
function dedupeMemory(items:EditorialMemoryRecord[]):EditorialMemoryRecord[]{return [...new Map(items.map(item=>[item.memoryId,item])).values()];}
function unique<T>(items:T[]):T[]{return [...new Set(items)];}

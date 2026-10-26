import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createNextLiveCycle} from './editorial/next-live-cycle.js';
import type {AIIntelligenceDailyViewModel,KoreaMarketDailyViewModel,USMarketDailyViewModel} from './intelligence/daily-masters.js';
import type {SplitPublicationUnit} from './intelligence/split-daily-production.js';
import {buildPerformanceLearning,createSearchIntelligenceSnapshot,type VerifiedSearchTopic} from './search/intelligence.js';
import {collectDemandSignals,GoogleSearchConsoleSignalProvider,NaverDataLabProvider,type SearchDemandProvider} from './search/providers.js';
import {searchConsoleFromEnvironment} from './search/google-console-live.js';

const args=process.argv.slice(2);
const value=(flag:string)=>{const index=args.indexOf(flag);return index>=0?args[index+1]:undefined};

async function main(){
  const generatedAt=new Date().toISOString(),live=args.includes('--live');
  const input=await publicationUnits(live,generatedAt),units=args.includes('--exclude-ai')?input.units.filter(unit=>unit.category!=='AI_INTELLIGENCE'):input.units,topics=topicsFromUnits(units),providers:SearchDemandProvider[]=[];
  if(live&&topics.length){
    const clientId=process.env.NAVER_DATALAB_CLIENT_ID?.trim(),clientSecret=process.env.NAVER_DATALAB_CLIENT_SECRET?.trim(),end=generatedAt.slice(0,10),start=new Date(Date.parse(end+'T00:00:00Z')-6*86400000).toISOString().slice(0,10);
    if(clientId&&clientSecret)providers.push(new NaverDataLabProvider({startDate:start,endDate:end,timeUnit:'date',keywordGroups:topics.map(topic=>({groupName:topic.label,keywords:[topic.label,...topic.aliases]}))},{clientId,clientSecret}));
    const google=searchConsoleFromEnvironment();
    if(google){const gStart=new Date(Date.parse(end+'T00:00:00Z')-27*86400000).toISOString().slice(0,10);providers.push(new GoogleSearchConsoleSignalProvider(google,{propertyId:process.env.GOOGLE_SEARCH_CONSOLE_PROPERTY!,dimensions:['date','page','query'],startDate:gStart,endDate:end}));}
  }
  const collected=await collectDemandSignals(providers,topics,generatedAt),warnings=[...input.warnings,...collected.warnings,...(!live?['DRY_RUN_NO_REMOTE_PROVIDER_CALLS']:[])],snapshot=createSearchIntelligenceSnapshot({generatedAt,topics,signals:collected.signals,providerStates:collected.states,warnings}),output={mode:live?'LIVE_DEGRADED_OK':'DRY_RUN',publicationActions:{insert:0,patch:0,publish:0},normalDailyBlocked:false,snapshot,performanceLearning:buildPerformanceLearning(snapshot),commerce:{enabled:false}};
  await mkdir('data/search-intelligence',{recursive:true});
  await writeFile('data/search-intelligence/latest-'+(live?'live':'dry-run')+'.json',JSON.stringify(output,null,2)+'\n','utf8');
  const operationDate=value('--date'),operationCategory=value('--category');
  if(live&&operationDate&&operationCategory&&['ai','us','korea'].includes(operationCategory)){const operationRoot=join(process.cwd(),'data','operations',operationDate,operationCategory);await mkdir(operationRoot,{recursive:true});await writeFile(join(operationRoot,'search-intelligence.json'),JSON.stringify(output,null,2)+'\n','utf8');}
  console.log(JSON.stringify({mode:output.mode,topicCount:topics.length,signalCount:snapshot.signals.length,providerStates:snapshot.providerStates,warnings,normalDailyBlocked:false,publicationActions:output.publicationActions,commerce:output.commerce}));
}

type SearchTopicUnit={publicationId:string;category:'AI_INTELLIGENCE'|'US_MARKET'|'KOREA_MARKET';topics:string[];sourceRefs:string[]};
async function publicationUnits(live:boolean,generatedAt:string):Promise<{units:SearchTopicUnit[];warnings:string[]}>
{
  if(!live)return {units:createNextLiveCycle(generatedAt).units.map(unit=>({publicationId:unit.publicationId,category:unit.category,topics:unit.coverage.map(item=>item.topic),sourceRefs:['verified-publication:'+unit.publicationId]})),warnings:[]};
  const date=value('--date'),category=value('--category');
  if(!date||!category||!['ai','us','korea'].includes(category))return {units:[],warnings:['LIVE_SEARCH_CONTEXT_MISSING']};
  const root=join(process.cwd(),'data','operations',date,category),path=join(root,'live-unit.json'),verificationPath=join(root,'verification.json');
  if(!existsSync(path)||!existsSync(verificationPath))return {units:[],warnings:['VERIFIED_LIVE_UNIT_MISSING']};
  const unit=JSON.parse(await readFile(path,'utf8')) as SplitPublicationUnit,verification=JSON.parse(await readFile(verificationPath,'utf8')) as {verification?:string};
  const expected={ai:'AI_INTELLIGENCE',us:'US_MARKET',korea:'KOREA_MARKET'}[category];
  if(unit.category!==expected||unit.readiness!=='READY'||verification.verification!=='VERIFIED')return {units:[],warnings:['VERIFIED_LIVE_UNIT_CONTEXT_MISMATCH']};
  return {units:[topicUnit(unit)],warnings:[]};
}
function topicUnit(unit:SplitPublicationUnit):SearchTopicUnit {
  let topics:string[];
  if(unit.category==='AI_INTELLIGENCE'){const view=unit.viewModel as AIIntelligenceDailyViewModel;topics=view.issues.map(item=>item.headline);}
  else if(unit.category==='US_MARKET'){const view=unit.viewModel as USMarketDailyViewModel;topics=view.sectorsCompanies.length?view.sectorsCompanies:[view.title];}
  else {const view=unit.viewModel as KoreaMarketDailyViewModel;topics=[...view.sectors,...view.movers].map(item=>item.label);if(!topics.length)topics=[view.title];}
  return {publicationId:unit.publicationId,category:unit.category,topics:[...new Set(topics.filter(Boolean))],sourceRefs:unit.viewModel.sources.map(source=>source.url)};
}
function topicsFromUnits(units:SearchTopicUnit[]):VerifiedSearchTopic[]{return units.flatMap(unit=>unit.topics.map((topic,index)=>({topicId:unit.category.toLowerCase()+':topic:'+(index+1),label:topic,aliases:[],category:unit.category,claimRefs:[unit.publicationId],sourceRefs:unit.sourceRefs,verificationStatus:'VERIFIED' as const})))}await main();

import {mkdir,writeFile} from 'node:fs/promises';
import {createNextLiveCycle} from './editorial/next-live-cycle.js';
import {buildPerformanceLearning,createSearchIntelligenceSnapshot,type VerifiedSearchTopic} from './search/intelligence.js';
import {collectDemandSignals} from './search/providers.js';

async function main():Promise<void>{
  const generatedAt=new Date().toISOString();const cycle=createNextLiveCycle(generatedAt);const topics=topicsFromCycle(cycle.units);
  const collected=await collectDemandSignals([],topics,generatedAt);
  const snapshot=createSearchIntelligenceSnapshot({generatedAt,topics,signals:collected.signals,providerStates:collected.states,warnings:[...collected.warnings,'DRY_RUN_NO_REMOTE_PROVIDER_CALLS']});
  const output={mode:'DRY_RUN',publicationActions:{insert:0,patch:0,publish:0},normalDailyBlocked:false,snapshot,performanceLearning:buildPerformanceLearning(snapshot),commerce:{enabled:false}};
  await mkdir('data/search-intelligence',{recursive:true});await writeFile('data/search-intelligence/latest-dry-run.json',`${JSON.stringify(output,null,2)}\n`,'utf8');
  console.log(JSON.stringify({mode:output.mode,topicCount:topics.length,signalCount:snapshot.signals.length,providerStates:snapshot.providerStates,normalDailyBlocked:false,publicationActions:output.publicationActions,commerce:output.commerce}));
}
function topicsFromCycle(units:Array<{category:'AI_INTELLIGENCE'|'US_MARKET'|'KOREA_MARKET';coverage:Array<{topic:string}>;publicationId:string}>):VerifiedSearchTopic[]{return units.flatMap(unit=>unit.coverage.map((item,index)=>({topicId:`${unit.category.toLowerCase()}:topic:${index+1}`,label:item.topic,aliases:[item.topic],category:unit.category,claimRefs:[unit.publicationId],sourceRefs:[`verified-publication:${unit.publicationId}`],verificationStatus:'VERIFIED' as const})));}
await main();

import type {DemandSignal,VerifiedSearchTopic} from './intelligence.js';

const termKey=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/\s+/g,'').trim();
/** Shared category aliases obscure the difference between candidate queries. */
export function prepareSearchComparisonTopics(topics:VerifiedSearchTopic[]):VerifiedSearchTopic[]{
 const owners=new Map<string,Set<string>>();
 for(const topic of topics)for(const term of [topic.label,...topic.aliases]){const key=termKey(term);if(!key)continue;const ids=owners.get(key)??new Set<string>();ids.add(topic.topicId);owners.set(key,ids)}
 return topics.map(topic=>{const seen=new Set([termKey(topic.label)]);return {...topic,aliases:topic.aliases.filter(term=>{const key=termKey(term);if(!key||seen.has(key)||owners.get(key)!.size>1)return false;seen.add(key);return true})}});
}

// DataLab ranks only the compared, verified topic candidates. It is not a
// market-wide trending-search ranking, and GSC position is not demand rank.
export interface SearchRankingEvidence {
 scope:'VERIFIED_CANDIDATE_COMPARISON';metric:'NAVER_RELATIVE_INTEREST';
 selectedTopicId:string|null;
 ranking:Array<{rank:number;topicId:string;query:string;terms:string[];ratio:number;signalDate:string;signalId:string;sourceUrl:string;claimRefs:string[];sourceRefs:string[]}>;
}
export function buildSearchRankingEvidence(topics:VerifiedSearchTopic[],signals:DemandSignal[],selectedTopicId:string|null,date:string):SearchRankingEvidence {
 const previous=new Date(Date.parse(date+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 const eligible=signals.filter(s=>s.provider==='NAVER_DATALAB'&&s.verificationStatus==='VERIFIED'&&[date,previous].includes(s.observedAt));
 const signalDate=eligible.some(s=>s.observedAt===date)?date:previous;
 const ranking=topics.flatMap(topic=>{const s=eligible.find(s=>s.topicId===topic.topicId&&s.observedAt===signalDate);const ratio=s?.metrics.relativeRatios?.at(-1);return s&&ratio!==undefined&&Number.isFinite(ratio)&&ratio>=0&&ratio<=100?[{rank:0,topicId:topic.topicId,query:s.query,terms:[topic.label,...topic.aliases],ratio,signalDate:s.observedAt,signalId:s.signalId,sourceUrl:s.provenance.sourceUrl,claimRefs:topic.claimRefs,sourceRefs:topic.sourceRefs}]:[]}).sort((a,b)=>b.ratio-a.ratio).map((r,index)=>({...r,rank:index+1}));
 return {scope:'VERIFIED_CANDIDATE_COMPARISON',metric:'NAVER_RELATIVE_INTEREST',selectedTopicId,ranking};
}
export function evaluatePublicationDemand(input:unknown,html:string,date:string,now:string):{pass:boolean;reasons:string[]} {
 const reasons:string[]=[];
 const context=input as {collectedAt?:string;rankingEvidence?:SearchRankingEvidence}|null;
 const evidence=context?.rankingEvidence;
 const age=Date.parse(now)-Date.parse(context?.collectedAt??'');
 if(!Number.isFinite(age)||age<0||age>2*60*60*1000)reasons.push('SEARCH_EVIDENCE_STALE_OR_MISSING');
 if(evidence?.scope!=='VERIFIED_CANDIDATE_COMPARISON'||evidence?.metric!=='NAVER_RELATIVE_INTEREST'||!Array.isArray(evidence.ranking)||evidence.ranking.length<2)reasons.push('SEARCH_CANDIDATE_RANKING_MISSING');
 else {
  const previous=new Date(Date.parse(date+'T00:00:00Z')-86400000).toISOString().slice(0,10),rows=evidence.ranking;
  const termOwners=new Map<string,string>();
  for(const row of rows)for(const term of row.terms??[]){const key=termKey(term),prior=termOwners.get(key);if(prior&&prior!==row.topicId)reasons.push('SEARCH_COMPARISON_TERMS_OVERLAP');termOwners.set(key,row.topicId)}
  if(rows.some((r,i)=>r.rank!==i+1||!Number.isFinite(r.ratio)||r.ratio<0||r.ratio>100||i>0&&r.ratio>rows[i-1]!.ratio||![date,previous].includes(r.signalDate)||r.signalDate!==rows[0]!.signalDate||!r.signalId||!r.claimRefs?.length||!r.sourceRefs?.length||!/^https:\/\/naverapihub\.apigw\.ntruss\.com\/search-trend\/v1\/search$/.test(r.sourceUrl)))reasons.push('SEARCH_RANKING_PROVENANCE_INVALID');
  const selected=rows.find(r=>r.topicId===evidence.selectedTopicId);
  const prose=html.replace(/<(script|style|svg|header|ul)\b[^>]*>[\s\S]*?<\/\1>/gi,' ');
  const text=[...prose.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(match=>match[1]!.replace(/<[^>]+>/g,' ')).join(' ').replaceAll('&amp;','&').toLowerCase();
  if(!selected||selected.ratio<=0||![selected.query,selected.terms?.[0]??''].some(term=>term.length>=2&&text.includes(term.toLowerCase())))reasons.push('SEARCH_SELECTED_TOPIC_NOT_USED_IN_ARTICLE');
 }
 return {pass:reasons.length===0,reasons};
}

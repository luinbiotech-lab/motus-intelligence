import {parseFeed,isOfficialLink} from './ai-sources.js';

export type MarketResearchRegion='US_MARKET'|'KOREA_MARKET';
export type MarketResearchClass='FINANCIAL_MEDIA'|'BROKER_RESEARCH';
export interface MarketResearchEntry {publisher:string;headline:string;url:string;publishedAt:string;kind:MarketResearchClass;sourceFeed:string}
export interface ResearchFeed {publisher:string;url:string;domains:string[];region:MarketResearchRegion;kind:MarketResearchClass}
export interface MarketResearchAudit {publisher:string;url:string;status:'PASS'|'FAILED';count:number;error:string|null}
export interface MarketResearchResult {entries:MarketResearchEntry[];audit:MarketResearchAudit[]}

/** Publisher-operated public feeds. These sources are financial media, NOT broker research.
 * Add an investment-bank/broker feed only after verifying a real public feed and its content rights. */
export const MARKET_RESEARCH_FEEDS:readonly ResearchFeed[]=[
 {publisher:'CNBC Investing',url:'https://www.cnbc.com/id/15839069/device/rss/rss.html',domains:['cnbc.com'],region:'US_MARKET',kind:'FINANCIAL_MEDIA'},
 {publisher:'Bloomberg Markets',url:'https://feeds.bloomberg.com/markets/news.rss',domains:['bloomberg.com'],region:'US_MARKET',kind:'FINANCIAL_MEDIA'},
 {publisher:'한국경제 증권',url:'https://www.hankyung.com/feed/finance',domains:['hankyung.com'],region:'KOREA_MARKET',kind:'FINANCIAL_MEDIA'},
 {publisher:'매일경제 증권',url:'https://www.mk.co.kr/rss/50200011/',domains:['mk.co.kr'],region:'KOREA_MARKET',kind:'FINANCIAL_MEDIA'},
];
const relevant={
 US_MARKET:/\b(?:stocks?|markets?|equities|wall street|nasdaq|s&p|dow|federal reserve|fed|treasur(?:y|ies)|earnings|inflation|analysts?|investors?|shares?)\b/i,
 KOREA_MARKET:/(?:증시|증권|코스피|코스닥|주가|주식|투자|수급|금리|환율|시장|실적|반도체|외국인|기관|리포트|목표주가|증권사)/,
} as const;
/** Only published headlines and attributed links are retained; no scraped full articles or invented analyst opinions. */
export function selectMarketResearch(xml:string,feed:ResearchFeed,at:string,limit=4):MarketResearchEntry[]{
 const now=Date.parse(at);if(!Number.isFinite(now))return [];
 return parseFeed(xml).filter(item=>{
  if(!isOfficialLink(item.link,feed.domains)||!relevant[feed.region].test(item.title))return false;
  const time=Date.parse(item.publishedAt);
  return Number.isFinite(time)&&time<=now+300000&&now-time<=72*3600000;
 }).slice(0,limit).map(item=>({publisher:feed.publisher,headline:item.title.slice(0,220),url:item.link,publishedAt:new Date(Date.parse(item.publishedAt)).toISOString(),kind:feed.kind,sourceFeed:feed.url}));
}
export async function collectMarketResearch(region:MarketResearchRegion,at:string,fetcher:typeof fetch=fetch,feeds:readonly ResearchFeed[]=MARKET_RESEARCH_FEEDS):Promise<MarketResearchResult>{
 const entries:MarketResearchEntry[]=[],audit:MarketResearchAudit[]=[];
 for(const feed of feeds.filter(item=>item.region===region)){
  try{
   const response=await fetcher(feed.url,{headers:{accept:'application/rss+xml,application/xml,text/xml','user-agent':'MOTUS-ResearchCollector/1.0'},signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw new Error('FEED_HTTP_'+response.status);
   const text=await response.text();if(text.length>2000000)throw new Error('FEED_OVERSIZED');
   const selected=selectMarketResearch(text,feed,at);
   entries.push(...selected);audit.push({publisher:feed.publisher,url:feed.url,status:'PASS',count:selected.length,error:null});
  }catch(error){audit.push({publisher:feed.publisher,url:feed.url,status:'FAILED',count:0,error:error instanceof Error&&/^FEED_(?:HTTP_\d{3}|OVERSIZED)$/.test(error.message)?error.message:'FEED_FETCH_FAILED'})}
 }
 return {entries:[...new Map(entries.map(e=>[e.url,e])).values()].slice(0,8),audit};
}

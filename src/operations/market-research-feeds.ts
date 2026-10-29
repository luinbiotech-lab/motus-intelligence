import {parseFeed,isOfficialLink} from './ai-sources.js';

export type MarketResearchRegion='US_MARKET'|'KOREA_MARKET';
export type MarketResearchClass='FINANCIAL_MEDIA'|'BROKER_RESEARCH';
export interface MarketResearchEntry {publisher:string;headline:string;url:string;publishedAt:string;kind:MarketResearchClass;sourceFeed:string;evidence?:string[]}
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
export function selectMarketResearch(xml:string,feed:ResearchFeed,at:string,limit=2):MarketResearchEntry[]{
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

/** An actual broker-owned public research index. This parser records only the broker's
 * publication title/date/link; never interprets a title as a recommendation or target. */
export async function collectKbBrokerResearch(at:string,fetcher:typeof fetch=fetch):Promise<MarketResearchResult>{
 const feed='https://rc.kbsec.com/today/index.able';
 try{
  const response=await fetcher(feed,{headers:{accept:'text/html','user-agent':'MOTUS-ResearchCollector/1.0'},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error('FEED_HTTP_'+response.status);
  const html=await response.text();if(html.length>2000000)throw new Error('FEED_OVERSIZED');
  const entries:MarketResearchEntry[]=[];
  for(const kind of ['KB Core View','KB 월간 전략']){
   const start=html.indexOf('<h2>'+kind+'</h2>');if(start<0)continue;
   const next=html.indexOf('grp__item',start+100),block=html.slice(start,next>start?next:start+1900);
   const id=block.match(/documentid=(\d{17}[A-Z])/)?.[1],title=block.match(/class="tit"[^>]*>([^<]+)</)?.[1]?.trim();
   const date=block.match(/class="date"[^>]*>\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/)?.slice(1).map(Number);
   if(!id||!title||!date||date.length!==3)continue;
   const iso=new Date(Date.UTC(date[0]!,date[1]!-1,date[2]!,0,0,0)).toISOString();
   const elapsed=Date.parse(at)-Date.parse(iso);
   if(elapsed<0||elapsed>21*86400000)continue;
   // The public index itself publishes short bullets for this exact report card.
   // Keep only two concise, same-card statements; never parse PDFs or synthesize target prices.
   const bullets=[...block.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(match=>match[1]!.replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp|lt|gt|quot);/g,' ').replace(/\s+/g,' ').trim()).filter(Boolean).slice(0,2).map(text=>text.slice(0,85));
   entries.push({publisher:'KB증권 리서치',headline:kind+' · '+title.slice(0,180),url:'https://rc.kbsec.com/detailView.able?documentid='+id,publishedAt:iso,kind:'BROKER_RESEARCH',sourceFeed:feed,...(bullets.length?{evidence:bullets}:{})});
  }
  return {entries,audit:[{publisher:'KB증권 리서치',url:feed,status:'PASS',count:entries.length,error:null}]};
 }catch(error){return {entries:[],audit:[{publisher:'KB증권 리서치',url:feed,status:'FAILED',count:0,error:error instanceof Error&&/^FEED_(?:HTTP_\d{3}|OVERSIZED)$/.test(error.message)?error.message:'FEED_FETCH_FAILED'}]}}
}

/** First-party Goldman Sachs public Insights article references. The HTML card's
 * own date/title/URL are the only supported claims; no inferred analyst rating. */
export async function collectGoldmanBrokerResearch(at:string,fetcher:typeof fetch=fetch):Promise<MarketResearchResult>{
 const feed='https://www.goldmansachs.com/insights';
 try{
  const response=await fetcher(feed,{headers:{accept:'text/html','user-agent':'MOTUS-ResearchCollector/1.0'},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error('FEED_HTTP_'+response.status);
  const html=await response.text();if(html.length>3000000)throw new Error('FEED_OVERSIZED');
  const entries:MarketResearchEntry[]=[];
  for(const match of html.matchAll(/<a\b[^>]*href="(\/insights\/articles\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)){
   const text=match[2]!.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
   const rawDate=text.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+20\d{2}\b/i)?.[0];
   if(!rawDate)continue;
   const date=Date.parse(rawDate+" 00:00:00 UTC");if(!Number.isFinite(date)||date>Date.parse(at)||Date.parse(at)-date>30*86400000)continue;
   const headline=text.slice(0,text.indexOf(rawDate)).replace(/^(?:Markets|Economy|Artificial Intelligence|Europe|Americas)\s+/i,'').trim();
   if(!/\b(?:market|bonds?|treasury|yield|equity|equities|stock|fed|inflation|economic|earnings|investment|portfolios?)\b/i.test(headline))continue;
   const path=match[1]!;
   entries.push({publisher:'Goldman Sachs',headline:headline.slice(0,190),url:'https://www.goldmansachs.com'+path,publishedAt:new Date(date).toISOString(),kind:'BROKER_RESEARCH',sourceFeed:feed});
   if(entries.length>=3)break;
  }
  return {entries,audit:[{publisher:'Goldman Sachs',url:feed,status:'PASS',count:entries.length,error:null}]};
 }catch(error){return {entries:[],audit:[{publisher:'Goldman Sachs',url:feed,status:'FAILED',count:0,error:error instanceof Error&&/^FEED_(?:HTTP_\d{3}|OVERSIZED)$/.test(error.message)?error.message:'FEED_FETCH_FAILED'}]}}
}

/**
 * Search-ranking and market-attention signals used to choose what the article leads with.
 * - Korea: Naver Pay Securities "검색 상위" (most-searched stocks) ranking. Prices for the covered session are
 *   read from each stock's own daily price history, never from the live quote shown next to the ranking.
 * - U.S.: Yahoo Finance trending tickers (what investors are looking up) plus large-cap most-active stocks and
 *   SPDR sector ETFs, each with the change for the covered session computed from daily closes.
 */
export interface KoreaSearchStock {rank:number;name:string;code:string;close:number;changePct:number;date:string;url:string}
export interface USAttentionStock {symbol:string;name:string;koreanName:string|null;changePct:number;close:number;date:string;trendingRank:number|null;mostActiveRank:number|null;marketCap:number|null;bigMover?:boolean}
export interface SectorMove {symbol:string;label:string;changePct:number;date:string}
export interface AttentionAudit {sourceId:string;url:string;status:'PASS'|'FAILED';count:number;error:string|null}

const UA='Mozilla/5.0 (compatible; MOTUS-MarketCollector/1.0; +https://motusnova.blogspot.com)';
export const NAVER_SEARCH_TOP='https://m.stock.naver.com/api/stocks/searchTop/all?page=1&pageSize=20';
export const naverStockPriceUrl=(code:string)=>`https://m.stock.naver.com/api/stock/${code}/price?pageSize=5&page=1`;
export const YAHOO_TRENDING='https://query1.finance.yahoo.com/v1/finance/trending/US?count=20';
export const YAHOO_MOST_ACTIVE='https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=most_actives&count=25';
export const yahooSparkUrl=(symbols:string[])=>`https://query1.finance.yahoo.com/v7/finance/spark?symbols=${symbols.map(encodeURIComponent).join(',')}&range=5d&interval=1d`;

export const SECTOR_ETFS:Record<string,string>={XLK:'기술',XLC:'커뮤니케이션',XLY:'경기소비재',XLF:'금융',XLV:'헬스케어',XLI:'산업재',XLE:'에너지',XLB:'소재',XLP:'필수소비재',XLU:'유틸리티',XLRE:'부동산'};
export const US_KOREAN_NAMES:Record<string,string>={AAPL:'애플',MSFT:'마이크로소프트',NVDA:'엔비디아',GOOGL:'알파벳',GOOG:'알파벳',AMZN:'아마존',META:'메타',TSLA:'테슬라',AVGO:'브로드컴',ORCL:'오라클',AMD:'AMD',INTC:'인텔',NFLX:'넷플릭스',CRM:'세일즈포스',ADBE:'어도비',QCOM:'퀄컴',MU:'마이크론',TSM:'TSMC',ASML:'ASML',PLTR:'팔란티어',NOW:'서비스나우',IBM:'IBM',CSCO:'시스코',UBER:'우버',SHOP:'쇼피파이',PYPL:'페이팔',V:'비자',MA:'마스터카드',JPM:'JP모건',GS:'골드만삭스',MS:'모건스탠리',BAC:'뱅크오브아메리카',WFC:'웰스파고',C:'씨티그룹',BRK_B:'버크셔해서웨이',LLY:'일라이릴리',NVO:'노보노디스크',UNH:'유나이티드헬스',JNJ:'존슨앤드존슨',PFE:'화이자',MRK:'머크',ABBV:'애브비',XOM:'엑슨모빌',CVX:'셰브론',BA:'보잉',CAT:'캐터필러',GE:'GE에어로스페이스',F:'포드',GM:'GM',WMT:'월마트',COST:'코스트코',HD:'홈디포',KO:'코카콜라',PEP:'펩시코',MCD:'맥도날드',SBUX:'스타벅스',NKE:'나이키',DIS:'디즈니',T:'AT&T',VZ:'버라이즌',MRVL:'마벨테크놀로지',ARM:'Arm',SMCI:'슈퍼마이크로',DELL:'델',COIN:'코인베이스',MSTR:'스트래티지',RIVN:'리비안',LCID:'루시드',SNOW:'스노우플레이크',PANW:'팔로알토네트웍스',CRWD:'크라우드스트라이크',FTNT:'포티넷',ANET:'아리스타네트웍스',LITE:'루멘텀',SOFI:'소파이',HOOD:'로빈후드',SPCX:'스페이스X',SPOT:'스포티파이',ABNB:'에어비앤비',BABA:'알리바바',PDD:'PDD',NIO:'니오',SNDK:'샌디스크',RDDT:'레딧',WDC:'웨스턴디지털',STX:'씨게이트',CMG:'치폴레',UPS:'UPS',ENPH:'엔페이즈'};

async function json<T>(fetcher:typeof fetch,url:string):Promise<T>{
  const response=await fetcher(url,{headers:{'user-agent':UA,accept:'application/json'},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('ATTENTION_HTTP_'+response.status);
  return await response.json() as T;
}
const errorCode=(error:unknown)=>error instanceof Error&&/^ATTENTION_HTTP_\d{3}$/.test(error.message)?error.message:'ATTENTION_FETCH_FAILED';
/** Missing, null or blank provider fields are not numbers (Number('') would silently become 0). */
const num=(value:unknown)=>value===null||value===undefined||String(value).trim()===''?Number.NaN:Number(String(value).replace(/,/g,''));

/** Most-searched Korean stocks, each priced on the covered session from its own daily history. */
export async function collectKoreaSearchTop(sessionDate:string,fetcher:typeof fetch=fetch,limit=6):Promise<{stocks:KoreaSearchStock[];audit:AttentionAudit[]}>{
  const audit:AttentionAudit[]=[],stocks:KoreaSearchStock[]=[];
  try{
    const body=await json<{stocks?:Array<{stockName?:string;itemCode?:string;stockEndType?:string}>}>(fetcher,NAVER_SEARCH_TOP);
    const ranked=(body.stocks??[]).filter(item=>item.stockEndType==='stock'&&item.itemCode&&item.stockName&&!/우$|우B$|ETF|ETN|레버리지|인버스/.test(item.stockName));
    audit.push({sourceId:'naver:search-top',url:NAVER_SEARCH_TOP,status:'PASS',count:ranked.length,error:null});
    for(const [index,item] of ranked.slice(0,limit+2).entries()){
      if(stocks.length>=limit)break;
      const url=naverStockPriceUrl(item.itemCode!);
      try{
        const rows=await json<Array<{localTradedAt?:string;closePrice?:string;fluctuationsRatio?:string}>>(fetcher,url);
        const row=rows.find(entry=>entry.localTradedAt===sessionDate),close=num(row?.closePrice),change=num(row?.fluctuationsRatio);
        if(!row||!Number.isFinite(close)||close<=0||!Number.isFinite(change))throw new Error('ATTENTION_SESSION_ROW_MISSING');
        stocks.push({rank:index+1,name:item.stockName!,code:item.itemCode!,close,changePct:change,date:sessionDate,url});
        audit.push({sourceId:'naver:stock-price:'+item.itemCode,url,status:'PASS',count:1,error:null});
      }catch(error){audit.push({sourceId:'naver:stock-price:'+item.itemCode,url,status:'FAILED',count:0,error:error instanceof Error&&error.message==='ATTENTION_SESSION_ROW_MISSING'?error.message:errorCode(error)})}
    }
  }catch(error){audit.push({sourceId:'naver:search-top',url:NAVER_SEARCH_TOP,status:'FAILED',count:0,error:errorCode(error)})}
  return {stocks,audit};
}

interface SparkResponse {spark?:{result?:Array<{symbol:string;response?:Array<{meta?:{shortName?:string;longName?:string;exchangeTimezoneName?:string};timestamp?:number[];indicators?:{quote?:Array<{close?:Array<number|null>}>}}>}>}}
function nyDate(seconds:number,zone='America/New_York'){return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(seconds*1000))}

/** Session change for each symbol from daily closes: the bar dated `sessionDate` against the bar before it. */
export async function sessionChanges(symbols:string[],sessionDate:string,fetcher:typeof fetch=fetch,fetched:string[]=[]):Promise<Map<string,{name:string;close:number;changePct:number}>>{
  const result=new Map<string,{name:string;close:number;changePct:number}>();
  for(let i=0;i<symbols.length;i+=20){
    const url=yahooSparkUrl(symbols.slice(i,i+20));const body=await json<SparkResponse>(fetcher,url);fetched.push(url);
    for(const item of body.spark?.result??[]){
      const response=item.response?.[0],stamps=response?.timestamp??[],closes=response?.indicators?.quote?.[0]?.close??[],zone=response?.meta?.exchangeTimezoneName??'America/New_York';
      const index=stamps.findIndex(stamp=>nyDate(stamp,zone)===sessionDate),close=index>0?closes[index]:null,previous=index>0?closes[index-1]:null;
      if(typeof close!=='number'||typeof previous!=='number'||!(close>0)||!(previous>0))continue;
      result.set(item.symbol,{name:response?.meta?.shortName??response?.meta?.longName??item.symbol,close,changePct:(close-previous)/previous*100});
    }
  }
  return result;
}

export async function collectUSAttention(sessionDate:string,fetcher:typeof fetch=fetch):Promise<{stocks:USAttentionStock[];sectors:SectorMove[];audit:AttentionAudit[];stockUrls:string[];sectorUrls:string[]}>{
  const audit:AttentionAudit[]=[];let trending:string[]=[],active:Array<{symbol:string;marketCap:number|null}>=[];
  try{const body=await json<{finance?:{result?:Array<{quotes?:Array<{symbol?:string}>}>}}>(fetcher,YAHOO_TRENDING);trending=(body.finance?.result?.[0]?.quotes??[]).map(item=>item.symbol??'').filter(symbol=>/^[A-Z][A-Z.\-]{0,5}$/.test(symbol));audit.push({sourceId:'yahoo:trending',url:YAHOO_TRENDING,status:'PASS',count:trending.length,error:null})}
  catch(error){audit.push({sourceId:'yahoo:trending',url:YAHOO_TRENDING,status:'FAILED',count:0,error:errorCode(error)})}
  try{const body=await json<{finance?:{result?:Array<{quotes?:Array<{symbol?:string;marketCap?:number;quoteType?:string}>}>}}>(fetcher,YAHOO_MOST_ACTIVE);active=(body.finance?.result?.[0]?.quotes??[]).filter(item=>item.quoteType==='EQUITY'&&item.symbol).map(item=>({symbol:item.symbol!,marketCap:typeof item.marketCap==='number'?item.marketCap:null}));audit.push({sourceId:'yahoo:most-active',url:YAHOO_MOST_ACTIVE,status:'PASS',count:active.length,error:null})}
  catch(error){audit.push({sourceId:'yahoo:most-active',url:YAHOO_MOST_ACTIVE,status:'FAILED',count:0,error:errorCode(error)})}
  // Collapse share classes (GOOG/GOOGL) so one company is not counted twice.
  const dedupe=(symbols:string[])=>{const seen=new Set<string>();return symbols.filter(symbol=>{const key=US_KOREAN_NAMES[symbol]??symbol;if(seen.has(key))return false;seen.add(key);return true})};
  const largeActive=active.filter(item=>(item.marketCap??0)>=20e9).map(item=>item.symbol);
  const symbols=dedupe([...trending.slice(0,12),...largeActive.slice(0,10)]),sectorSymbols=Object.keys(SECTOR_ETFS);
  let changes=new Map<string,{name:string;close:number;changePct:number}>(),sectorChanges=new Map<string,{name:string;close:number;changePct:number}>();
  const stockUrls:string[]=[],sectorUrls:string[]=[];
  try{if(symbols.length)changes=await sessionChanges(symbols,sessionDate,fetcher,stockUrls);for(const url of stockUrls)audit.push({sourceId:'yahoo:spark:stocks',url,status:'PASS',count:changes.size,error:null})}
  catch(error){audit.push({sourceId:'yahoo:spark:stocks',url:symbols.length?yahooSparkUrl(symbols.slice(0,20)):YAHOO_TRENDING,status:'FAILED',count:0,error:errorCode(error)})}
  try{sectorChanges=await sessionChanges(sectorSymbols,sessionDate,fetcher,sectorUrls);for(const url of sectorUrls)audit.push({sourceId:'yahoo:spark:sectors',url,status:'PASS',count:sectorChanges.size,error:null})}
  catch(error){audit.push({sourceId:'yahoo:spark:sectors',url:yahooSparkUrl(sectorSymbols),status:'FAILED',count:0,error:errorCode(error)})}
  const stocks:USAttentionStock[]=symbols.flatMap(symbol=>{const change=changes.get(symbol);if(!change)return [];const trendingIndex=trending.indexOf(symbol),activeIndex=largeActive.indexOf(symbol),cap=active.find(item=>item.symbol===symbol)?.marketCap??null;return [{symbol,name:change.name.replace(/,? Inc\.?$|,? Corporation$|,? Corp\.?$|,? Inc$/,'').trim(),koreanName:US_KOREAN_NAMES[symbol]??null,changePct:change.changePct,close:change.close,date:sessionDate,trendingRank:trendingIndex>=0?trendingIndex+1:null,mostActiveRank:activeIndex>=0?activeIndex+1:null,marketCap:cap}]});
  const sectors:SectorMove[]=sectorSymbols.flatMap(symbol=>{const change=sectorChanges.get(symbol);return change?[{symbol,label:SECTOR_ETFS[symbol]!,changePct:change.changePct,date:sessionDate}]:[]}).sort((a,b)=>b.changePct-a.changePct);
  return {stocks,sectors,audit,stockUrls,sectorUrls};
}

export function signedPct(value:number):string {return `${value>0?'+':value<0?'-':''}${Math.abs(value).toFixed(2)}%`}
export function absPct(value:number):string {return `${Math.abs(value).toFixed(2)}%`}
export function moveWord(value:number):string {const size=Math.abs(value);if(size<0.005)return '보합';if(value>0)return size>=5?'급등':'상승';return size>=5?'급락':'하락'}
export function displayName(stock:USAttentionStock):string {return stock.koreanName??stock.name}

export const AI_BELLWETHERS=['NVDA','MSFT','GOOGL','AMZN','META','AVGO','AMD','TSM','ORCL','PLTR'];
/** Latest completed U.S. session close-to-close change for AI bellwethers (the session is taken from the data itself). */
/** The largest U.S. companies: a big move in one of them is market news whether or not it trends. */
export const US_MEGACAPS=[...AI_BELLWETHERS.filter(symbol=>symbol!=='PLTR'),'AAPL','TSLA'];
export async function collectAIBellwethers(candidateSessions:string[],fetcher:typeof fetch=fetch,symbols:string[]=AI_BELLWETHERS):Promise<{stocks:USAttentionStock[];sessionDate:string|null;audit:AttentionAudit[];urls:string[]}>{
  const AI_BELLWETHERS_LIST=symbols;
  const audit:AttentionAudit[]=[],urls:string[]=[];
  for(const sessionDate of candidateSessions){
    try{
      const fetched:string[]=[];const changes=await sessionChanges(AI_BELLWETHERS_LIST,sessionDate,fetcher,fetched);
      if(changes.size<AI_BELLWETHERS_LIST.length-2)continue;
      for(const url of fetched){audit.push({sourceId:'yahoo:spark:ai-bellwethers',url,status:'PASS',count:changes.size,error:null});urls.push(url)}
      return {stocks:AI_BELLWETHERS_LIST.flatMap(symbol=>{const change=changes.get(symbol);return change?[{symbol,name:change.name,koreanName:US_KOREAN_NAMES[symbol]??null,changePct:change.changePct,close:change.close,date:sessionDate,trendingRank:null,mostActiveRank:null,marketCap:null}]:[]}),sessionDate,audit,urls};
    }catch(error){audit.push({sourceId:'yahoo:spark:ai-bellwethers',url:yahooSparkUrl(AI_BELLWETHERS_LIST),status:'FAILED',count:0,error:errorCode(error)});break}
  }
  return {stocks:[],sessionDate:null,audit,urls};
}

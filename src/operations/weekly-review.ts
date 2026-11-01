/**
 * MOTUS weekly market review: the week that just ended and the week ahead.
 *
 * Every number comes from a collected source (Yahoo Finance daily closes, the Forex Factory economic calendar),
 * every interpretation is a named broker's own sentence quoted verbatim from the weekly report it published on
 * Naver Pay Securities' research board, and the week's own MOTUS daily articles are linked by their published
 * titles. Nothing here invents a cause, a forecast or a schedule.
 */
import {josa} from './ai-generic-synthesis.js';
import {koreanDateLabel} from './broker-briefs.js';
import {US_KOREAN_NAMES,US_MEGACAPS,signedPct} from './market-attention.js';
import {listNaverResearch,naverResearchDetail,naverResearchPageUrl,summaryText,type NaverResearchCategory,type NaverResearchItem} from './naver-research.js';

const DAY=86400000;
const UA='Mozilla/5.0 (compatible; MOTUS-MarketCollector/1.0; +https://motusnova.blogspot.com)';
const WEEKDAY=['일','월','화','수','목','금','토'];

export interface WeekWindow {runDate:string;weekStart:string;weekEnd:string;nextStart:string;nextEnd:string}
export interface WeeklyQuote {symbol:string;label:string;group:'US_INDEX'|'KOREA_INDEX'|'MACRO'|'US_STOCK'|'KOREA_STOCK';unit:'index'|'yield'|'fx'|'price';weekClose:number;weekCloseDate:string;priorClose:number;priorCloseDate:string;changePct:number;changeBp:number|null;daily:Array<{date:string;close:number}>}
export interface WeeklyBrokerQuote {broker:string;title:string;date:string;url:string;sentence:string;kind:'review'|'outlook'}
export interface CalendarEvent {at:string;kstLabel:string;country:string;countryLabel:string;title:string;koreanTitle:string|null;group:string|null;impact:'High'|'Medium';forecast:string;previous:string}
export interface MotusWeekPost {title:string;url:string;publishedAt:string;category:'US_MARKET'|'KOREA_MARKET'|'AI_INTELLIGENCE'|'OTHER'}
export interface WeeklyAudit {sourceId:string;url:string;status:'PASS'|'FAILED';count:number;error:string|null}
export interface WeeklyEvidence {window:WeekWindow;quotes:WeeklyQuote[];broker:WeeklyBrokerQuote[];calendar:CalendarEvent[];calendarCoversNextWeek:boolean;posts:MotusWeekPost[];audit:WeeklyAudit[];collectedAt:string}
export interface WeeklyParagraph {text:string;source?:{label:string;url:string}}
export interface WeeklySection {key:string;title:string;intro?:string;paragraphs?:WeeklyParagraph[];table?:{headers:string[];rows:string[][];note?:string};links?:Array<{label:string;url:string;meta:string}>}
export interface WeeklyArticle {publicationId:string;weekStart:string;weekEnd:string;title:string;subtitle:string;lead:string;sections:WeeklySection[];sources:Array<{label:string;url:string}>;readiness:'READY'|'HOLD';reasons:string[]}

const dateOf=(ms:number)=>new Date(ms).toISOString().slice(0,10);
const at0=(date:string)=>Date.parse(date+'T00:00:00Z');
const addDays=(date:string,days:number)=>dateOf(at0(date)+days*DAY);
export const shortDate=(date:string)=>{const [,m,d]=date.split('-');return `${Number(m)}/${Number(d)}`};
export const dayLabel=(date:string)=>`${koreanDateLabel(date)}(${WEEKDAY[new Date(at0(date)).getUTCDay()]})`;

/**
 * The completed Monday–Friday week a run reviews and the week it previews. A run on a weekday reviews the
 * previous full week (the current one is not finished); a weekend run reviews the week that just ended.
 */
export function weekWindow(runDate:string):WeekWindow {
  const weekday=new Date(at0(runDate)).getUTCDay(); // 0 Sunday
  const back=weekday===0?6:weekday===6?5:weekday+6;
  const weekStart=addDays(runDate,-back);
  return {runDate,weekStart,weekEnd:addDays(weekStart,4),nextStart:addDays(weekStart,7),nextEnd:addDays(weekStart,11)};
}

export const WEEKLY_INSTRUMENTS:Array<{symbol:string;label:string;group:WeeklyQuote['group'];unit:WeeklyQuote['unit']}>=[
  {symbol:'^GSPC',label:'S&P 500',group:'US_INDEX',unit:'index'},
  {symbol:'^IXIC',label:'나스닥',group:'US_INDEX',unit:'index'},
  {symbol:'^DJI',label:'다우존스',group:'US_INDEX',unit:'index'},
  {symbol:'^RUT',label:'러셀 2000',group:'US_INDEX',unit:'index'},
  {symbol:'^SOX',label:'필라델피아 반도체',group:'US_INDEX',unit:'index'},
  {symbol:'^KS11',label:'코스피',group:'KOREA_INDEX',unit:'index'},
  {symbol:'^KQ11',label:'코스닥',group:'KOREA_INDEX',unit:'index'},
  {symbol:'^TNX',label:'미국 10년물 국채금리',group:'MACRO',unit:'yield'},
  {symbol:'KRW=X',label:'원·달러 환율',group:'MACRO',unit:'fx'},
  {symbol:'DX-Y.NYB',label:'달러인덱스',group:'MACRO',unit:'index'},
  {symbol:'CL=F',label:'WTI 유가',group:'MACRO',unit:'price'},
  {symbol:'GC=F',label:'금',group:'MACRO',unit:'price'},
];
export const KOREA_LARGE_CAPS:Record<string,string>={'005930.KS':'삼성전자','000660.KS':'SK하이닉스','373220.KS':'LG에너지솔루션','207940.KS':'삼성바이오로직스','005380.KS':'현대차','000270.KS':'기아','012450.KS':'한화에어로스페이스','105560.KS':'KB금융','035420.KS':'NAVER','329180.KS':'HD현대중공업','068270.KS':'셀트리온','034020.KS':'두산에너빌리티'};

interface SparkSeries {symbol:string;response?:Array<{meta?:{exchangeTimezoneName?:string;regularMarketPrice?:number;regularMarketTime?:number};timestamp?:number[];indicators?:{quote?:Array<{close?:Array<number|null>}>}}>}
const localDate=(seconds:number,zone:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(seconds*1000));

/** Daily closes by the exchange's own calendar date; a weekend snapshot's null final close takes the regular-market price of that same session. */
export function sparkCloses(series:SparkSeries):Array<{date:string;close:number}> {
  const body=series.response?.[0],zone=body?.meta?.exchangeTimezoneName??'America/New_York',stamps=body?.timestamp??[],closes=body?.indicators?.quote?.[0]?.close??[];
  const byDate=new Map<string,number>();
  stamps.forEach((stamp,index)=>{const date=localDate(stamp,zone);let close=closes[index];
    if((close===null||close===undefined)&&index===stamps.length-1&&body?.meta?.regularMarketTime&&localDate(body.meta.regularMarketTime,zone)===date)close=body.meta.regularMarketPrice??null;
    if(typeof close==='number'&&Number.isFinite(close)&&close>0)byDate.set(date,close)});
  return [...byDate.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([date,close])=>({date,close}));
}

/** The week's last close against the last close before the week began; null when either side is missing. */
export function weeklyQuote(spec:{symbol:string;label:string;group:WeeklyQuote['group'];unit:WeeklyQuote['unit']},closes:Array<{date:string;close:number}>,window:WeekWindow):WeeklyQuote|null {
  const inWeek=closes.filter(item=>item.date>=window.weekStart&&item.date<=window.weekEnd),prior=closes.filter(item=>item.date<window.weekStart).at(-1),last=inWeek.at(-1);
  if(!last||!prior||inWeek.length<2)return null;
  // A week whose last close is not Thursday or Friday is not complete enough to call a weekly result.
  if(last.date<addDays(window.weekEnd,-1))return null;
  const changePct=(last.close-prior.close)/prior.close*100;
  return {...spec,weekClose:last.close,weekCloseDate:last.date,priorClose:prior.close,priorCloseDate:prior.date,changePct,changeBp:spec.unit==='yield'?Math.round((last.close-prior.close)*100):null,daily:inWeek};
}

/**
 * Within one market every quote must end on that market's last session of the week: a stock or index whose final
 * bar is missing (a provider gap) is dropped instead of being reported on an earlier day. A market-wide holiday
 * moves the whole market's last session and is kept.
 */
export function completeWeek(quotes:WeeklyQuote[]):WeeklyQuote[] {
  const market=(quote:WeeklyQuote)=>quote.group==='US_INDEX'||quote.group==='US_STOCK'?'US':quote.group==='KOREA_INDEX'||quote.group==='KOREA_STOCK'?'KR':null;
  const latest=new Map<string,string>();
  for(const quote of quotes){const key=market(quote);if(key&&(latest.get(key)??'')<quote.weekCloseDate)latest.set(key,quote.weekCloseDate)}
  return quotes.filter(quote=>{const key=market(quote);return !key||quote.weekCloseDate===latest.get(key)});
}
async function getJson<T>(fetcher:typeof fetch,url:string,timeout=20000):Promise<T>{
  const response=await fetcher(url,{headers:{'user-agent':UA,accept:'application/json'},signal:AbortSignal.timeout(timeout)});
  if(!response.ok)throw new Error('HTTP_'+response.status);
  return await response.json() as T;
}
const errText=(error:unknown)=>error instanceof Error?error.message.slice(0,120):'FETCH_FAILED';
export const sparkUrl=(symbols:string[],host='query1.finance.yahoo.com')=>`https://${host}/v7/finance/spark?symbols=${symbols.map(encodeURIComponent).join(',')}&range=1mo&interval=1d`;

export async function collectWeeklyQuotes(window:WeekWindow,fetcher:typeof fetch,audit:WeeklyAudit[]):Promise<WeeklyQuote[]> {
  const specs=[...WEEKLY_INSTRUMENTS,...US_MEGACAPS.map(symbol=>({symbol,label:US_KOREAN_NAMES[symbol]??symbol,group:'US_STOCK' as const,unit:'price' as const})),...Object.entries(KOREA_LARGE_CAPS).map(([symbol,label])=>({symbol,label,group:'KOREA_STOCK' as const,unit:'price' as const}))];
  const quotes:WeeklyQuote[]=[];
  for(let i=0;i<specs.length;i+=15){
    const batch=specs.slice(i,i+15);let body:{spark?:{result?:SparkSeries[]}}|null=null,used='';
    for(const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com']){used=sparkUrl(batch.map(item=>item.symbol),host);try{body=await getJson(fetcher,used);const count=(body as {spark?:{result?:SparkSeries[]}}).spark?.result?.length??0;audit.push({sourceId:'yahoo:spark:'+i,url:used,status:'PASS',count,error:null});break}catch(error){audit.push({sourceId:'yahoo:spark:'+i,url:used,status:'FAILED',count:0,error:errText(error)})}}
    for(const series of body?.spark?.result??[]){const spec=batch.find(item=>item.symbol===series.symbol);if(!spec)continue;const quote=weeklyQuote(spec,sparkCloses(series),window);if(quote)quotes.push(quote)}
  }
  const order=new Map(specs.map((spec,index)=>[spec.symbol,index]));
  return completeWeek(quotes).sort((a,b)=>(order.get(a.symbol)??0)-(order.get(b.symbol)??0));
}

/* ---------------- Broker weekly reports ---------------- */

const WEEKLY_TITLE=/주간|weekly|위클리|다음\s?주|week/i;
const NOT_MARKET_WEEKLY=/china|중국|japan|일본|헬스케어|healthcare|산업재|에너지|energy|소비재|platform|IT\s?H\/W|ETF|commodity|원자재|파생|펀드|fund|quant|퀀트|theme|신흥국|defense|carbon|ESG|크레딧|credit|채권|EPS|bitcoin|비트코인|전망과 전략|년 (?:주식|경제|금융)|20\d\d년/i;
/** Weekly market, strategy and macro notes; sector, country and product weeklies and annual outlooks are not the week's market call. */
export function isWeeklyMarketReport(item:Pick<NaverResearchItem,'title'>):boolean {return WEEKLY_TITLE.test(item.title)&&!NOT_MARKET_WEEKLY.test(item.title)}

const AHEAD=/다음\s?주|차주|주초|주중|주 후반|주후반|앞두고|예정돼|예정된|예정이다|\d{1,2}월\s?\d{1,2}일\s?(?:미국|발표|예정)/;
const MARKET=/KOSPI|KOSDAQ|코스피|코스닥|S&P|나스닥|다우|증시|주식시장|금융시장|경기지표|고용|물가|중간선거|업종|외국인|기관|반도체|금리|달러|환율|연준|FOMC|실적/;
const MOVE=/상승|하락|반등|급락|급등|강세|약세|순매수|순매도|등락|마감|부진|호조|이탈|회복|돌파|하회|상회|유입|유출|\d+(?:\.\d+)?\s?%/;
const PREDICATE=/(?:다|음|함|임|됨|전망|예상|기대|우려|지속|확대|축소|부각|유입|등락|상승|하락|반등|강세|약세|마감|기록|작용|필요|주목|확인|유지|전환|가능성|부담|요인|관건)\.?$/;
/** Whole sentences of a broker summary: bullet lines as they are, prose split at sentence ends; bold headings are not sentences. */
export function summarySentences(html:string):string[] {
  const out:string[]=[];
  for(const raw of summaryText(html.replace(/<(strong|b|h\d)\b[^>]*>[\s\S]*?<\/\1>/gi,'')).split('\n')){
    const line=raw.replace(/^[-•ㆍ·▪]\s*/,'').trim();if(!line)continue;
    const parts=/^[-•ㆍ·▪]/.test(raw.trim())?[line]:line.split(/(?<=(?:다|음|함|임|됨)\.)\s+/);
    for(const part of parts){const text=part.replace(/\s+/g,' ').trim();if(text.length>=25&&text.length<=160&&PREDICATE.test(text)&&!/\s:\s|^[^가-힣]*$/.test(text))out.push(text)}
  }
  return out;
}
/** One review and one outlook sentence per report: the review must be about the market's move, the outlook about what comes next. */
export function pickBrokerSentences(sentences:string[]):{review:string|null;outlook:string|null} {
  const usable=sentences.filter(text=>!/\d{1,2}\/\d{1,2}\s?~|\d{1,2}월\s?\d{1,2}일\s?~|본 자료|투자 판단|Compliance|무단/i.test(text));
  const outlook=usable.find(text=>AHEAD.test(text)&&MARKET.test(text))??null;
  const score=(text:string)=>(MARKET.test(text)?2:0)+(MOVE.test(text)?2:0)+(/주간|금주|이번\s?주|한\s?주/.test(text)?1:0)-(text.length>150?1:0);
  const review=usable.filter(text=>text!==outlook&&MARKET.test(text)&&MOVE.test(text)&&!/^다음\s?주/.test(text)).sort((a,b)=>score(b)-score(a))[0]??null;
  return {review,outlook};
}

export async function collectWeeklyResearch(window:WeekWindow,fetcher:typeof fetch,audit:WeeklyAudit[],limit=8):Promise<WeeklyBrokerQuote[]> {
  const from=addDays(window.weekEnd,-2),to=window.runDate,found:Array<{item:NaverResearchItem;category:NaverResearchCategory}>=[];
  for(const category of ['market','invest','economy'] as const){
    try{const items=await listNaverResearch(fetcher,category,100);audit.push({sourceId:'naver-research:'+category,url:`https://m.stock.naver.com/api/research/${category}`,status:'PASS',count:items.length,error:null});
      for(const item of items)if(item.writeDate>=from&&item.writeDate<=to&&isWeeklyMarketReport(item))found.push({item,category})}
    catch(error){audit.push({sourceId:'naver-research:'+category,url:`https://m.stock.naver.com/api/research/${category}`,status:'FAILED',count:0,error:errText(error)})}
  }
  found.sort((a,b)=>b.item.writeDate.localeCompare(a.item.writeDate)||b.item.researchId-a.item.researchId);
  const quotes:WeeklyBrokerQuote[]=[],brokers=new Set<string>();
  for(const {item,category} of found){
    if(quotes.filter(q=>q.kind==='review').length+quotes.filter(q=>q.kind==='outlook').length>=limit*2)break;
    // One note per broker and series keeps a single house from filling the section.
    const series=item.brokerName+'|'+item.title.replace(/[\d().\s\-_/]+/g,'').slice(0,8);if(brokers.has(series))continue;
    try{const detail=await naverResearchDetail(fetcher,category,item.researchId);audit.push({sourceId:'naver-research:'+category+':'+item.researchId,url:naverResearchPageUrl(category,item.researchId),status:'PASS',count:1,error:null});
      const pick=pickBrokerSentences(summarySentences(detail.content));if(!pick.review&&!pick.outlook)continue;brokers.add(series);
      const base={broker:item.brokerName,title:item.title,date:item.writeDate,url:detail.attachUrl??naverResearchPageUrl(category,item.researchId)};
      if(pick.review)quotes.push({...base,sentence:pick.review,kind:'review'});
      if(pick.outlook)quotes.push({...base,sentence:pick.outlook,kind:'outlook'});
    }catch(error){audit.push({sourceId:'naver-research:'+category+':'+item.researchId,url:naverResearchPageUrl(category,item.researchId),status:'FAILED',count:0,error:errText(error)})}
  }
  return quotes;
}

/* ---------------- Economic calendar (Forex Factory weekly feed) ---------------- */

export const FF_THIS_WEEK='https://nfs.faireconomy.media/ff_calendar_thisweek.json';
export const FF_CALENDAR_PAGE='https://www.forexfactory.com/calendar';
const COUNTRY:Record<string,string>={USD:'미국',CNY:'중국',JPY:'일본',EUR:'유로존',GBP:'영국',AUD:'호주',CAD:'캐나다'};
const EVENT_NAMES:Array<[RegExp,string,string]>=[
  [/^Non-Farm Employment Change/i,'비농업 고용','고용보고서'],[/^Unemployment Rate/i,'실업률','고용보고서'],[/^Average Hourly Earnings/i,'평균 시간당 임금','고용보고서'],
  [/^ADP Non-Farm Employment Change/i,'ADP 민간 고용','ADP 고용'],[/^JOLTS Job Openings/i,'JOLTS 구인건수','구인건수'],[/^Unemployment Claims/i,'신규 실업수당 청구건수','실업수당'],
  [/^ISM Manufacturing PMI/i,'ISM 제조업 PMI','ISM 지수'],[/^ISM Services PMI/i,'ISM 서비스업 PMI','ISM 지수'],[/^ISM Manufacturing Prices/i,'ISM 제조업 가격지수','ISM 지수'],[/^ISM Services Prices/i,'ISM 서비스업 가격지수','ISM 지수'],
  [/^Final Manufacturing PMI/i,'S&P 글로벌 제조업 PMI(확정)',''],[/^Final Services PMI/i,'S&P 글로벌 서비스업 PMI(확정)',''],[/^Flash Manufacturing PMI/i,'제조업 PMI(예비)',''],[/^Flash Services PMI/i,'서비스업 PMI(예비)',''],
  [/^Core CPI/i,'근원 소비자물가(CPI)','CPI'],[/^CPI/i,'소비자물가(CPI)','CPI'],[/^Core PPI/i,'근원 생산자물가(PPI)','PPI'],[/^PPI/i,'생산자물가(PPI)','PPI'],
  [/^Core PCE Price Index/i,'근원 PCE 물가','PCE 물가'],[/^PCE Price Index/i,'PCE 물가','PCE 물가'],[/GDP/i,'국내총생산(GDP)','GDP'],
  [/^Federal Funds Rate/i,'FOMC 기준금리 결정','FOMC'],[/^FOMC Statement/i,'FOMC 성명','FOMC'],[/^FOMC Press Conference/i,'FOMC 기자회견','FOMC'],[/^FOMC Meeting Minutes/i,'FOMC 의사록','FOMC 의사록'],
  [/^Fed Chair .* Speaks/i,'연준 의장 발언','연준 의장 발언'],[/^FOMC Member (.+) Speaks/i,'연준 위원 발언',''],
  [/^Core Retail Sales/i,'근원 소매판매','소매판매'],[/^Retail Sales/i,'소매판매','소매판매'],
  [/^Prelim UoM Consumer Sentiment/i,'미시간대 소비자심리지수(예비)','소비심리'],[/^Revised UoM Consumer Sentiment/i,'미시간대 소비자심리지수(확정)',''],[/UoM Inflation Expectations/i,'미시간대 기대인플레이션',''],[/^CB Consumer Confidence/i,'콘퍼런스보드 소비자신뢰지수','소비심리'],
  [/^Trade Balance/i,'무역수지',''],[/^Crude Oil Inventories/i,'원유 재고',''],[/^Durable Goods Orders/i,'내구재 주문',''],[/^Core Durable Goods Orders/i,'근원 내구재 주문',''],[/^Factory Orders/i,'공장 주문',''],
  [/^Prelim Nonfarm Productivity/i,'비농업 생산성(예비)',''],[/^Prelim Unit Labor Costs/i,'단위노동비용(예비)',''],[/^Empire State Manufacturing/i,'뉴욕 제조업지수',''],[/^Philly Fed Manufacturing/i,'필라델피아 제조업지수',''],
  [/^Building Permits/i,'건축 허가',''],[/^Housing Starts/i,'주택 착공',''],[/^Existing Home Sales/i,'기존주택 판매',''],[/^New Home Sales/i,'신규주택 판매',''],[/^Pending Home Sales/i,'잠정주택 판매',''],
  [/^(\d+)-y Bond Auction/i,'$1년물 국채 입찰',''],[/^Treasury Currency Report/i,'재무부 환율보고서',''],
  [/^Caixin Manufacturing PMI/i,'차이신 제조업 PMI',''],[/^Caixin Services PMI/i,'차이신 서비스업 PMI',''],[/^Manufacturing PMI/i,'제조업 PMI',''],[/^Non-Manufacturing PMI/i,'비제조업 PMI',''],
  [/^BOJ Policy Rate/i,'일본은행 기준금리 결정','일본은행'],[/^Main Refinancing Rate/i,'ECB 기준금리 결정','ECB'],[/^Official Bank Rate/i,'영란은행 기준금리 결정','영란은행'],[/^Cash Rate/i,'호주중앙은행 기준금리 결정','호주중앙은행'],
  [/^Monetary Policy Statement/i,'통화정책 성명',''],[/^BOE Monetary Policy Report/i,'영란은행 통화정책 보고서',''],[/^Overnight Rate/i,'캐나다중앙은행 기준금리 결정',''],
];
export function koreanEventName(title:string):{name:string|null;group:string|null} {
  const clean=title.replace(/\s+[mqy]\/[mqy]$/i,'').trim();
  for(const [pattern,name,group] of EVENT_NAMES){const match=clean.match(pattern);if(match)return {name:name.replace('$1',match[1]??''),group:group||null}}
  return {name:null,group:null};
}
const KEPT=new Set(['USD','CNY','JPY','EUR','GBP']);
/** U.S. high- and medium-impact releases and the high-impact ones of the economies that move Korean markets, in KST. */
export function parseForexFactory(body:unknown,window:WeekWindow):{events:CalendarEvent[];coversNextWeek:boolean} {
  if(!Array.isArray(body))return {events:[],coversNextWeek:false};
  const events:CalendarEvent[]=[];let covers=false;
  for(const raw of body as Array<Record<string,unknown>>){
    const title=String(raw.title??'').trim(),country=String(raw.country??''),impact=String(raw.impact??''),when=Date.parse(String(raw.date??''));
    if(!title||!Number.isFinite(when))continue;
    const local=String(raw.date).slice(0,10),kst=new Date(when+9*3600000),kstDate=kst.toISOString().slice(0,10),hh=kst.toISOString().slice(11,16);
    if(local>=window.nextStart&&local<=window.nextEnd)covers=true;
    // Next week in Korean time: Monday 00:00 KST through the Friday U.S. session (early Saturday KST).
    if(kstDate<window.nextStart||kstDate>addDays(window.nextEnd,1))continue;
    if(!KEPT.has(country)||!(impact==='High'||(impact==='Medium'&&country==='USD')))continue;
    const named=koreanEventName(title);
    // A release with no fixed time (00:00 local in the feed's own zone) is shown by date only.
    const allDay=/T00:00:00/.test(String(raw.date));
    events.push({at:new Date(when).toISOString(),kstLabel:allDay?dayLabel(local):`${dayLabel(kstDate)} ${hh}`,country,countryLabel:COUNTRY[country]??country,title,koreanTitle:named.name,group:named.group,impact:impact as 'High'|'Medium',forecast:String(raw.forecast??'').trim(),previous:String(raw.previous??'').trim()});
  }
  events.sort((a,b)=>a.at.localeCompare(b.at));
  return {events,coversNextWeek:covers};
}
export async function collectCalendar(window:WeekWindow,fetcher:typeof fetch,audit:WeeklyAudit[]):Promise<{events:CalendarEvent[];coversNextWeek:boolean}> {
  try{const body=await getJson<unknown>(fetcher,FF_THIS_WEEK);const parsed=parseForexFactory(body,window);audit.push({sourceId:'forexfactory:thisweek',url:FF_THIS_WEEK,status:parsed.coversNextWeek?'PASS':'FAILED',count:parsed.events.length,error:parsed.coversNextWeek?null:'FEED_NOT_YET_ON_NEXT_WEEK'});return parsed}
  catch(error){audit.push({sourceId:'forexfactory:thisweek',url:FF_THIS_WEEK,status:'FAILED',count:0,error:errText(error)});return {events:[],coversNextWeek:false}}
}

/* ---------------- The week's MOTUS daily articles ---------------- */

export const MOTUS_FEED='https://motusnova.blogspot.com/feeds/posts/default?alt=json&max-results=40';
export function parseMotusFeed(body:unknown,window:WeekWindow):MotusWeekPost[] {
  const entries=(body as {feed?:{entry?:Array<{title?:{$t?:string};published?:{$t?:string};link?:Array<{rel?:string;href?:string}>;category?:Array<{term?:string}>}>}})?.feed?.entry??[];
  const from=Date.parse(window.weekStart+'T00:00:00+09:00'),to=Date.parse(addDays(window.weekEnd,1)+'T23:59:59+09:00'),posts:MotusWeekPost[]=[];
  for(const entry of entries){
    const title=entry.title?.$t?.trim()??'',published=entry.published?.$t??'',url=entry.link?.find(link=>link.rel==='alternate')?.href??'',terms=(entry.category??[]).map(item=>item.term??'').join(' ');
    const time=Date.parse(published);if(!title||!/^https:\/\/motusnova\.blogspot\.com\/\d{4}\/\d{2}\/[^?#]+\.html$/.test(url)||!Number.isFinite(time)||time<from||time>to)continue;
    if(/주간|weekly/i.test(terms+' '+title))continue;
    const text=terms+' '+title,category=/AI|인공지능/.test(text)?'AI_INTELLIGENCE':/미국|뉴욕|나스닥|S&P|다우|us-market/i.test(text)?'US_MARKET':/국내|코스피|코스닥|korea/i.test(text)?'KOREA_MARKET':'OTHER';
    posts.push({title,url,publishedAt:new Date(time).toISOString(),category});
  }
  return posts.sort((a,b)=>a.publishedAt.localeCompare(b.publishedAt));
}
export async function collectMotusPosts(window:WeekWindow,fetcher:typeof fetch,audit:WeeklyAudit[]):Promise<MotusWeekPost[]> {
  try{const posts=parseMotusFeed(await getJson<unknown>(fetcher,MOTUS_FEED),window);audit.push({sourceId:'motus:feed',url:MOTUS_FEED,status:'PASS',count:posts.length,error:null});return posts}
  catch(error){audit.push({sourceId:'motus:feed',url:MOTUS_FEED,status:'FAILED',count:0,error:errText(error)});return []}
}

export async function collectWeeklyEvidence(runDate:string,fetcher:typeof fetch=fetch,collectedAt=new Date().toISOString()):Promise<WeeklyEvidence> {
  const window=weekWindow(runDate),audit:WeeklyAudit[]=[];
  const [quotes,broker,calendar,posts]=await Promise.all([collectWeeklyQuotes(window,fetcher,audit),collectWeeklyResearch(window,fetcher,audit),collectCalendar(window,fetcher,audit),collectMotusPosts(window,fetcher,audit)]);
  return {window,quotes,broker,calendar:calendar.events,calendarCoversNextWeek:calendar.coversNextWeek,posts,audit,collectedAt};
}

/* ---------------- Article ---------------- */

const quote=(value:string)=>`“${value.replace(/[“"]/g,'‘').replace(/[”]/g,'’').replace(/\s+/g,' ').trim().replace(/[.。]$/,'')}”`;
function said(text:string):string {const char=text.replace(/[”’\s]+$/,'').slice(-1),code=char.charCodeAt(0)-0xac00;return `${text}${code>=0&&code<11172&&code%28!==0?'이라고':'라고'}`}
const fmt=(value:number,digits=2)=>new Intl.NumberFormat('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value);
const move=(pct:number)=>Math.abs(pct)<0.005?'보합':pct>0?'상승':'하락';
const titlePct=(pct:number)=>Math.abs(pct)<0.005?'보합':`${Math.abs(pct)<0.1?Math.abs(pct).toFixed(2):Math.abs(pct).toFixed(1)}% ${move(pct)}`;
export function weekRangeLabel(window:WeekWindow):string {const [,m1,d1]=window.weekStart.split('-'),[,m2,d2]=window.weekEnd.split('-');return m1===m2?`${Number(m1)}월 ${Number(d1)}~${Number(d2)}일`:`${Number(m1)}월 ${Number(d1)}일~${Number(m2)}월 ${Number(d2)}일`}
function valueText(quote:WeeklyQuote):string {return quote.unit==='yield'?`${fmt(quote.weekClose)}%`:quote.unit==='fx'?`${fmt(quote.weekClose)}원`:quote.unit==='price'&&(quote.group==='KOREA_STOCK')?`${fmt(quote.weekClose,0)}원`:quote.unit==='price'&&quote.group==='US_STOCK'?`$${fmt(quote.weekClose)}`:quote.unit==='price'?`$${fmt(quote.weekClose)}`:fmt(quote.weekClose)}
function changeText(quote:WeeklyQuote):string {return quote.unit==='yield'?`${quote.changeBp!>0?'+':''}${quote.changeBp}bp`:signedPct(quote.changePct)}

/** “미국 고용보고서와 ISM 지수”: the country is said once and the particle follows the first name's final syllable. */
export function joinEvents(names:string[]):string {if(names.length<2)return names[0]??'';const [first,second]=names as [string,string];const rest=first.startsWith('미국 ')&&second.startsWith('미국 ')?second.slice(3):second;return `${josa(first,'과','와')} ${rest}`}
/** Next week's headline releases, one per group in time order (e.g. 고용보고서, ISM 지수). */
export function headlineEvents(events:CalendarEvent[],limit=2):string[] {
  const out:string[]=[];
  for(const event of events)if(event.country==='USD'&&event.impact==='High'&&event.group&&!out.includes(event.group))out.push(event.group);
  for(const event of events)if(event.country!=='USD'&&event.impact==='High'&&event.group&&!out.includes(event.group))out.push(event.group);
  return out.slice(0,limit).map(group=>/^(?:FOMC|ECB|일본은행|영란은행|호주중앙은행)/.test(group)?group:`미국 ${group}`);
}

export function buildWeeklyArticle(evidence:WeeklyEvidence,options:{requireCalendar:boolean}={requireCalendar:true}):WeeklyArticle {
  const {window}=evidence,reasons:string[]=[],find=(label:string)=>evidence.quotes.find(item=>item.label===label);
  const sp=find('S&P 500'),nasdaq=find('나스닥'),dow=find('다우존스'),kospi=find('코스피'),kosdaq=find('코스닥'),tenYear=find('미국 10년물 국채금리'),krw=find('원·달러 환율');
  if(!sp||!nasdaq||!dow)reasons.push('WEEKLY_US_INDEX_MISSING');
  if(!kospi||!kosdaq)reasons.push('WEEKLY_KOREA_INDEX_MISSING');
  const reviews=evidence.broker.filter(item=>item.kind==='review'),outlooks=evidence.broker.filter(item=>item.kind==='outlook');
  if(!evidence.broker.length)reasons.push('WEEKLY_BROKER_NOTES_MISSING');
  if(options.requireCalendar&&!evidence.calendarCoversNextWeek)reasons.push('WEEKLY_CALENDAR_NOT_ON_NEXT_WEEK');
  if(!evidence.calendar.length&&!outlooks.length)reasons.push('WEEKLY_NEXT_WEEK_EVIDENCE_MISSING');
  const range=weekRangeLabel(window),nextRange=weekRangeLabel({...window,weekStart:window.nextStart,weekEnd:window.nextEnd});
  const usLead=[sp,nasdaq,dow].filter((item):item is WeeklyQuote=>Boolean(item)).sort((a,b)=>Math.abs(b.changePct)-Math.abs(a.changePct))[0];
  const headline=headlineEvents(evidence.calendar);
  const title=usLead&&kospi?`[주간 증시] ${usLead.label} 주간 ${titlePct(usLead.changePct)}·코스피 ${titlePct(kospi.changePct)}…다음 주 ${headline.length?headline.join('·').replace(/·미국 /,'·')+' 주목':'증시 일정'}`:`[주간 증시] ${range} 결산과 다음 주 일정`;
  const subtitle=`${range} 뉴욕·서울 증시 결산과 ${nextRange} 경제지표·이벤트 일정`;
  const leadParts:string[]=[];
  if(sp&&nasdaq&&dow)leadParts.push(`${range} 한 주 동안 뉴욕증시는 S&P 500 ${signedPct(sp.changePct)}, 나스닥 ${signedPct(nasdaq.changePct)}, 다우존스 ${signedPct(dow.changePct)}로 마감했다.`);
  if(kospi&&kosdaq)leadParts.push(`국내 증시는 코스피가 주간 ${signedPct(kospi.changePct)}(${fmt(kospi.weekClose)}), 코스닥이 ${signedPct(kosdaq.changePct)}(${fmt(kosdaq.weekClose)})를 기록했다.`);
  if(tenYear){const bp=tenYear.changeBp!,rate=`미국 10년물 국채금리는 ${fmt(tenYear.weekClose)}%로 한 주 사이 ${bp===0?'보합이었다':`${Math.abs(bp)}bp ${bp>0?'올랐다':'내렸다'}`}.`;leadParts.push(krw?`${rate} 원·달러 환율은 ${fmt(krw.weekClose)}원으로 주간 ${Math.abs(krw.changePct).toFixed(2)}% ${krw.changePct>0?'올랐다(원화 약세)':krw.changePct<0?'내렸다(원화 강세)':'보합이었다'}.`:rate)}
  if(headline.length)leadParts.push(`다음 주(${nextRange})에는 ${joinEvents(headline)} 발표가 예정돼 있다.`);
  const sections:WeeklySection[]=[];
  // 1) The week in numbers.
  const indexRows=evidence.quotes.filter(item=>item.group==='US_INDEX'||item.group==='KOREA_INDEX'||item.group==='MACRO');
  if(indexRows.length)sections.push({key:'weekly-scoreboard',title:'주간 성적표: 지수·금리·환율',table:{headers:['구분','주간 종가','주간 등락'],rows:indexRows.map(item=>[item.label,valueText(item),changeText(item)]),note:`주간 등락은 직전 주 마지막 거래일(${[...new Set(indexRows.map(item=>dayLabel(item.priorCloseDate)))].join('·')}) 종가 대비 이번 주 마지막 거래일 종가 기준. 금리는 bp(0.01%p), 유가·금은 근월물 선물 가격.`}});
  // 2) What happened, day by day, through the week's own articles.
  const posts=evidence.posts.filter(item=>item.category!=='OTHER');
  if(posts.length)sections.push({key:'weekly-daily',title:'이번 주 시장을 움직인 장면',intro:'MOTUS가 이번 주 발행한 데일리 기사 제목으로 한 주를 되짚었다. 제목을 누르면 그날의 원인 분석과 증권가 해석을 볼 수 있다.',links:posts.map(item=>({label:item.title,url:item.url,meta:`${dayLabel(new Date(Date.parse(item.publishedAt)+9*3600000).toISOString().slice(0,10))} · ${item.category==='US_MARKET'?'미국증시':item.category==='KOREA_MARKET'?'국내증시':'AI 인텔리전스'}`}))});
  // 3) Large caps.
  const movers=(group:'US_STOCK'|'KOREA_STOCK')=>{const rows=evidence.quotes.filter(item=>item.group===group).sort((a,b)=>b.changePct-a.changePct);return rows.length>=4?rows:[]};
  const us=movers('US_STOCK'),kr=movers('KOREA_STOCK'),pick=(rows:WeeklyQuote[])=>[...rows.slice(0,3),...rows.slice(-3).filter(item=>!rows.slice(0,3).includes(item))];
  if(us.length||kr.length)sections.push({key:'weekly-large-caps',title:'대형주 주간 등락',intro:'미국 시가총액 상위 기술주와 국내 시가총액 상위 종목 가운데 이번 주 가장 많이 오르고 내린 종목이다.',table:{headers:['시장','종목','주간 종가','주간 등락'],rows:[...pick(us).map(item=>['미국',`${item.label}(${item.symbol})`,valueText(item),signedPct(item.changePct)]),...pick(kr).map(item=>['국내',item.label,valueText(item),signedPct(item.changePct)])]}});
  // 4) Brokers on the week.
  const cite=(item:WeeklyBrokerQuote,verb:string)=>({text:`${josa(item.broker,'은','는')} ${koreanDateLabel(item.date)} 「${item.title}」에서 ${said(quote(item.sentence))} ${verb}.`,source:{label:`${item.broker} ${item.title} (${koreanDateLabel(item.date)})`,url:item.url}});
  if(reviews.length)sections.push({key:'weekly-broker-review',title:'증권가가 본 이번 주',intro:'증권사가 이번 주 말 공개한 주간 리포트의 요약문을 그대로 인용했다.',paragraphs:reviews.slice(0,5).map(item=>cite(item,'진단했다'))});
  // 5) Next week's calendar.
  if(evidence.calendar.length)sections.push({key:'weekly-calendar',title:`다음 주 주요 일정 (${nextRange})`,table:{headers:['일시(한국시간)','국가','지표·이벤트','예상','이전'],rows:evidence.calendar.slice(0,24).map(item=>[item.kstLabel,item.countryLabel,(item.koreanTitle??item.title)+(item.impact==='High'?' ★':''),item.forecast||'-',item.previous||'-']),note:'★는 시장 영향이 큰 일정. 예상치는 Forex Factory 집계 기준이며, 일정은 발표 기관 사정에 따라 바뀔 수 있다.'}});
  // 6) What brokers say to watch.
  if(outlooks.length)sections.push({key:'weekly-broker-outlook',title:'증권가가 꼽은 다음 주 변수',paragraphs:outlooks.slice(0,5).map(item=>cite(item,'짚었다'))});
  const sourceList:Array<[string,{label:string;url:string}]>=[...evidence.broker.map(item=>[item.url,{label:`${item.broker} ${item.title} (${koreanDateLabel(item.date)})`,url:item.url}] as [string,{label:string;url:string}]),['yahoo',{label:'Yahoo Finance 일별 종가 (지수·금리·환율·종목)',url:'https://finance.yahoo.com/markets/'}]];
  if(evidence.calendar.length)sourceList.push(['ff',{label:'Forex Factory 경제 캘린더',url:FF_CALENDAR_PAGE}]);
  const sources=[...new Map(sourceList).values()];
  return {publicationId:`motus-weekly-${window.weekStart}`,weekStart:window.weekStart,weekEnd:window.weekEnd,title,subtitle,lead:leadParts.join(' '),sections,sources,readiness:reasons.length?'HOLD':'READY',reasons};
}

/**
 * Broker research from Naver Pay Securities' research board (m.stock.naver.com/api/research), which carries the
 * same broker PDFs as other aggregators but lists the morning and closing comments within minutes of publication,
 * with the broker's own summary text and, for company reports, the published rating and target price.
 *
 * Every item keeps its broker, title, date and PDF link; summaries are the broker's own text and are quoted only
 * through the same verbatim extraction used for PDF briefs.
 */
import type {BrokerReport,BrokerReportKind} from './broker-briefs.js';

export const NAVER_RESEARCH_API='https://m.stock.naver.com/api/research';
export type NaverResearchCategory='market'|'invest'|'economy'|'industry'|'company';
export interface NaverResearchItem {researchId:number;title:string;brokerName:string;writeDate:string;itemCode?:string;itemName?:string;category?:string}
export interface NaverResearchDetail {attachUrl:string|null;content:string;opinion:string|null;goalPrice:string|null}

const UA='Mozilla/5.0 (compatible; MOTUS-ResearchCollector/1.0; +https://motusnova.blogspot.com)';
export const naverResearchListUrl=(category:NaverResearchCategory,pageSize=60)=>`${NAVER_RESEARCH_API}/${category}?page=1&pageSize=${pageSize}`;
export const naverResearchDetailUrl=(category:NaverResearchCategory,id:number)=>`${NAVER_RESEARCH_API}/${category}/${id}`;
export const naverResearchPageUrl=(category:NaverResearchCategory,id:number)=>`https://m.stock.naver.com/research/${category}/${id}`;

async function json<T>(fetcher:typeof fetch,url:string):Promise<T>{
  const response=await fetcher(url,{headers:{'user-agent':UA,accept:'application/json'},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('NAVER_RESEARCH_HTTP_'+response.status);
  return await response.json() as T;
}

export async function listNaverResearch(fetcher:typeof fetch,category:NaverResearchCategory,pageSize=60):Promise<NaverResearchItem[]>{
  const body=await json<unknown>(fetcher,naverResearchListUrl(category,pageSize));
  if(!Array.isArray(body))throw new Error('NAVER_RESEARCH_SHAPE');
  return body.filter((item):item is NaverResearchItem=>Boolean(item&&typeof item==='object'&&Number.isFinite((item as NaverResearchItem).researchId)&&typeof (item as NaverResearchItem).title==='string'&&typeof (item as NaverResearchItem).brokerName==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(String((item as NaverResearchItem).writeDate)))).map(item=>({...item,title:item.title.trim(),brokerName:item.brokerName.trim()}));
}

export async function naverResearchDetail(fetcher:typeof fetch,category:NaverResearchCategory,id:number):Promise<NaverResearchDetail>{
  const body=await json<{researchContent?:{attachUrl?:string;content?:string;opinion?:string;goalPrice?:string}}>(fetcher,naverResearchDetailUrl(category,id));
  const content=body.researchContent;if(!content)throw new Error('NAVER_RESEARCH_SHAPE');
  const attach=typeof content.attachUrl==='string'&&/^https:\/\/stock\.pstatic\.net\/stock-research\/.+\.pdf$/i.test(content.attachUrl)?content.attachUrl:null;
  const opinion=typeof content.opinion==='string'&&content.opinion.trim()&&!/^(?:없음|-|N\/?A)$/i.test(content.opinion.trim())?content.opinion.trim():null;
  const goal=typeof content.goalPrice==='string'&&/^\d{3,}$/.test(content.goalPrice.trim())&&Number(content.goalPrice)>0?content.goalPrice.trim():null;
  return {attachUrl:attach,content:typeof content.content==='string'?content.content:'',opinion,goalPrice:goal};
}

/** The broker's summary HTML as plain lines (paragraphs and line breaks kept, entities decoded). */
export function summaryText(html:string):string {
  return html.replace(/<br\s*\/?>/gi,'\n').replace(/<\/(?:p|div|li|h\d)>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&').split('\n').map(line=>line.replace(/[ \t ]+/g,' ').trim()).join('\n');
}

/**
 * Splits prose summary paragraphs into sentences so each can be classified and quoted on its own; bullet lines
 * stay as they are. A prose sentence becomes a '- ' bullet only when it ends a sentence (…다./…음.), so a
 * fragment is never quoted.
 */
export function summaryAsBullets(html:string):string {
  const out:string[]=[];
  for(const line of summaryText(html).split('\n')){
    if(!line){out.push('');continue}
    if(/^[-•ㆍ·▪]\s/.test(line)||!/(?:다|음|함|임|됨)\.$/.test(line)){out.push(line);continue}
    const sentences=line.split(/(?<=(?:다|음|함|임|됨)\.)\s+/).map(item=>item.trim()).filter(Boolean);
    out.push('');for(const sentence of sentences)out.push(/(?:다|음|함|임|됨)\.$/.test(sentence)?'- '+sentence:sentence);out.push('');
  }
  return out.join('\n');
}

/** Dates printed in a title: (10월 29일), 10/29, 26.10.28, 261030, 2026.10.30, 2026-10-30. */
export function titleDates(title:string,year:number):string[] {
  const dates=new Set<string>(),pad=(value:number)=>String(value).padStart(2,'0');
  const push=(y:number,m:number,d:number)=>{if(m>=1&&m<=12&&d>=1&&d<=31)dates.add(`${y}-${pad(m)}-${pad(d)}`)};
  for(const match of title.matchAll(/(\d{1,2})월\s*(\d{1,2})일/g))push(year,Number(match[1]),Number(match[2]));
  for(const match of title.matchAll(/(?<![\d.])(20\d{2})[.\-](\d{1,2})[.\-](\d{1,2})(?![\d])/g))push(Number(match[1]),Number(match[2]),Number(match[3]));
  for(const match of title.matchAll(/(?<![\d.])(\d{2})\.(\d{2})\.(\d{2})(?![\d.])/g))push(2000+Number(match[1]),Number(match[2]),Number(match[3]));
  for(const match of title.matchAll(/(?<!\d)(\d{2})(\d{2})(\d{2})(?!\d)/g))if(Number(match[1])>=20)push(2000+Number(match[1]),Number(match[2]),Number(match[3]));
  for(const match of title.matchAll(/(?<![\d./])(\d{1,2})\/(\d{1,2})(?![\d/])/g))push(year,Number(match[1]),Number(match[2]));
  return [...dates];
}

const NOT_MARKET=/Carbon|ESG|Defense|ETF|탑픽|EPS LIVE|신한생각|Weekly|위클리|월간|Monthly|IPO|비상장|크레딧|Credit|채권|퀀트|Quant|원자재|Commodity/i;
const DAILY=/brief|daily|digest|market|morning|start|wake|letter|time|comment|코멘트|마감|레이더|아침|모닝|시황|증시|슥|데일리/i;
/** Daily market comments only: thematic, ESG, ETF and weekly notes are not session commentary. */
export function isMarketComment(item:NaverResearchItem):boolean {return (DAILY.test(item.title)||/^\d{1,2}\/\d{1,2}[,\s]/.test(item.title))&&!NOT_MARKET.test(item.title)}

export function naverReport(item:NaverResearchItem,kind:BrokerReportKind,detail:NaverResearchDetail|null,category:NaverResearchCategory):BrokerReport {
  const goal=detail?.goalPrice?new Intl.NumberFormat('en-US').format(Number(detail.goalPrice)):null;
  return {kind,date:item.writeDate,title:item.title,broker:item.brokerName,analysts:'',url:detail?.attachUrl??naverResearchPageUrl(category,item.researchId),summary:[],targetPrice:goal,rating:detail?.opinion??null,stockCode:item.itemCode&&/^\d{6}$/.test(item.itemCode)?item.itemCode:null,company:item.itemName?.trim()||null};
}

/** One key per broker report across aggregators: broker, date and the title without spacing, punctuation or a leading company tag. */
export function reportKey(report:Pick<BrokerReport,'broker'|'date'|'title'|'stockCode'>):string {
  const title=report.title.replace(/^.+?\(\d{6}\)\s*/,'').replace(/[\s\[\](){}.,·:;!?'"“”‘’_\-–—/]+/g,'').toLowerCase();
  return `${report.broker.replace(/\s+/g,'')}|${report.date}|${report.stockCode??''}|${title}`;
}

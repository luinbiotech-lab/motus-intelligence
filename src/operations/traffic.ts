/** Helpers for the daily traffic analysis input (owner request 2026-11-04). */
export interface ContentFeatures {textLength:number;imageCount:number;chartCount:number;headingCount:number;tableCount:number;linkCount:number}
/**
 * Section headings. Naver SmartEditor bodies have no <h2>-<h4>: writers mark sections with quotation components or
 * large-font paragraphs (MOT-037, read-only probe of five 11/7 competitor posts: se-quotation 0-6, se-fs-fs24 0-7,
 * <h1-4> only in the page chrome). Those are counted for SmartEditor bodies; other HTML counts h1-h4/role=heading.
 */
export function headingCount(html:string):number {
  if(!/se-component\b/.test(html))return (html.match(/<h[1-4]\b|role="heading"/gi)??[]).length;
  const quotations=(html.match(/se-component se-quotation\b/g)??[]).length;
  const largeParagraphs=html.split(/se-text-paragraph\b/).slice(1).filter(part=>/se-fs-fs(?:2[4-9]|[3-9]\d)\b/.test(part.split(/<\/p>/)[0]??'')).length;
  return quotations+largeParagraphs;
}

/** Plain features of an article body (HTML). */
export function contentFeatures(html:string):ContentFeatures {
  const text=html.replace(/<(script|style)[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&[a-z#0-9]+;/gi,' ').replace(/\s+/g,' ').trim();
  return {textLength:text.length,imageCount:(html.match(/<img\b/gi)??[]).length,chartCount:(html.match(/<svg\b/gi)??[]).length,headingCount:headingCount(html),tableCount:(html.match(/<table\b/gi)??[]).length,linkCount:(html.match(/<a\s[^>]*href=/gi)??[]).length};
}
/** The headline's first words without figures (search phrase candidates). */
function headlineWords(title:string):string[] {
  return (title.split(/…|\.\.\.|,|·/)[0]??'').replace(/\[[^\]]*\]/g,' ').replace(/[\d.,]+%?|[▲▼+\-−%()]/g,' ').split(/\s+/).filter(word=>word.length>=2&&!/^(급락해|급등해|상승해|하락해|마감|기록)$/.test(word));
}
function categoryPhrase(labels:string[]):string|null {
  return labels.some(label=>/국내증시/.test(label))?'코스피 마감':labels.some(label=>/미국증시/.test(label))?'뉴욕증시 마감':labels.some(label=>/AI/.test(label))?'AI 뉴스':labels.some(label=>/주간/.test(label))?'주간 증시 전망':null;
}
/** Search keywords for an article: the category's market phrase and the headline's first words without figures. */
export function articleKeywords(title:string,labels:string[]):string[] {
  // Weekly outlook (owner 2026-11-16, MOT-051): the title's first words are not a search phrase; use the phrases people type.
  if(labels.some(label=>/주간/.test(label)))return ['주간 증시 전망','이번주 증시 전망'];
  const head=headlineWords(title).slice(0,3).join(' ').trim();
  return [...new Set([categoryPhrase(labels),head].filter((item):item is string=>Boolean(item&&item.length>=2)))];
}
/**
 * Fallback keywords for DataLab when a keyword's series comes back empty (too little volume; MOT-045, ledger MO-7):
 * shorter headline heads ('AMD 급락' → 'AMD'), then the first word with '주가' for company headlines. Primary keywords excluded.
 */
export function articleKeywordFallbacks(title:string,labels:string[]):string[] {
  const primary=articleKeywords(title,labels);
  const words=headlineWords(title);
  const candidates=labels.some(label=>/주간/.test(label))?['주간 증시','증시 전망']:[words.slice(0,2).join(' '),words[0]??'',words[0]&&!/증시|코스피|코스닥|지수|마감/.test(words[0])?`${words[0]} 주가`:''];
  return [...new Set(candidates.map(item=>item.trim()).filter(item=>item.length>=2&&!primary.includes(item)))];
}
export interface DatalabSeries {keyword:string;series:Array<[string,number]>;fallbackFor?:string;emptyFallback?:string|null}
/**
 * Replace empty DataLab series with fallback keywords. `query` gets the replacement keywords in one call (≤5 groups).
 * Empty entries stay in the result (so the report can say which keyword had no signal) and name their replacement.
 */
export async function fillEmptyDatalabSeries(results:DatalabSeries[],fallbacks:string[],query:(keywords:string[])=>Promise<DatalabSeries[]>):Promise<DatalabSeries[]> {
  const empty=results.filter(item=>!item.series.length);
  const tried=new Set(results.map(item=>item.keyword));
  const pool=fallbacks.filter(item=>!tried.has(item));
  if(!empty.length||!pool.length)return results.map(item=>item.series.length?item:{...item,emptyFallback:null});
  const replies=await query(pool.slice(0,5));
  const byKeyword=new Map(replies.map(item=>[item.keyword,item]));
  const usable=pool.filter(keyword=>byKeyword.get(keyword)?.series.length);
  const out:DatalabSeries[]=[];
  for(const item of results){
    if(item.series.length){out.push(item);continue}
    const next=usable.shift()??null;
    out.push({...item,emptyFallback:next});
    if(next)out.push({...byKeyword.get(next)!,fallbackFor:item.keyword});
  }
  return out;
}


/**
 * One page key for Search Console rows and feed URLs (MOT-050): Blogger serves phones `?m=1`, and rows can come as
 * http, with a fragment or another query. Lower-cased host, https, no query or fragment.
 */
export function normalizeBlogUrl(url:string):string {
  try{const parsed=new URL(url);return `https://${parsed.host.toLowerCase()}${parsed.pathname}`}catch{return url.split(/[?#]/)[0]??url}
}
export interface SearchConsoleRow {keys?:string[];clicks?:number;impressions?:number;ctr?:number;position?:number}
export interface SearchConsolePage {page:string;clicks:number;impressions:number;ctr:number|null;position:number|null;dates:string[];variants:string[]}
/**
 * Per-page totals of page×date rows (MOT-050: rows not matching a D-1 article were dropped, so a PASS could not say
 * which pages were shown). Variants (`?m=1`, http) are merged; position is the impression-weighted average. Top `limit`
 * by impressions, then clicks. Only measured rows are used; a page without impressions has ctr/position null.
 */
export function searchConsolePages(rows:SearchConsoleRow[],limit=20):SearchConsolePage[] {
  const pages=new Map<string,{clicks:number;impressions:number;weighted:number;dates:Set<string>;variants:Set<string>}>();
  for(const row of rows){
    const raw=row.keys?.[0];if(!raw)continue;
    const key=normalizeBlogUrl(raw),entry=pages.get(key)??{clicks:0,impressions:0,weighted:0,dates:new Set<string>(),variants:new Set<string>()};
    const impressions=row.impressions??0;
    entry.clicks+=row.clicks??0;entry.impressions+=impressions;entry.weighted+=(row.position??0)*impressions;
    if(row.keys?.[1])entry.dates.add(row.keys[1]);entry.variants.add(raw);pages.set(key,entry);
  }
  return [...pages].map(([page,e])=>({page,clicks:e.clicks,impressions:e.impressions,ctr:e.impressions?e.clicks/e.impressions:null,position:e.impressions?Math.round(e.weighted/e.impressions*10)/10:null,dates:[...e.dates].sort(),variants:[...e.variants].sort()}))
    .sort((a,b)=>b.impressions-a.impressions||b.clicks-a.clicks||a.page.localeCompare(b.page)).slice(0,limit);
}

/**
 * URL Inspection retry (MO-21, MOT-057). 11/20: three 30-second timeouts used up the 6-minute budget and 7 more URLs
 * were SKIPPED_TIME_BUDGET; 11/22: one URL got HTTP 500. Before this change there was no retry (one attempt per URL).
 * The call is read-only, so a transient failure (timeout, network error, HTTP 5xx) is retried once, only while the
 * time budget still has room. 4xx (including 429 quota) is not retried: the same request would fail the same way.
 */
export type InspectionAttempt = Error | {ok:boolean;status:number};
export function isRetryableInspectionFailure(result:InspectionAttempt):boolean {
  if(result instanceof Error)return true;
  return !result.ok&&result.status>=500;
}
export async function inspectWithRetry<T extends InspectionAttempt>(attempt:()=>Promise<T>,deadline:number,now:()=>number=Date.now):Promise<{result:T;attempts:number}> {
  const first=await attempt();
  if(!isRetryableInspectionFailure(first)||now()>deadline)return {result:first,attempts:1};
  return {result:await attempt(),attempts:2};
}

/** Why an inspection was not measured, as a short fixed reason. */
export function inspectionFailureReason(error:string):string {
  if(error==='SKIPPED_TIME_BUDGET')return 'SKIPPED_TIME_BUDGET';
  if(/timeout|aborted/i.test(error))return 'TIMEOUT';
  const status=error.match(/^HTTP (\d{3})/)?.[1];
  if(status)return status.startsWith('5')?'HTTP_5XX':status==='429'?'HTTP_429':'HTTP_4XX';
  return 'OTHER';
}

/** Counts of measured and unmeasured inspections, so the report states the gap instead of reading it as a change. */
export function summarizeInspections(inspections:Array<{error?:string;attempts?:number;verdict?:unknown}>):{total:number;measured:number;unmeasured:number;byReason:Record<string,number>;retried:number;recoveredByRetry:number} {
  const byReason:Record<string,number>={};let measured=0,retried=0,recovered=0;
  for(const item of inspections){
    if((item.attempts??1)>1){retried++;if(!item.error)recovered++}
    if(item.error){const reason=inspectionFailureReason(item.error);byReason[reason]=(byReason[reason]??0)+1}else measured++;
  }
  return {total:inspections.length,measured,unmeasured:inspections.length-measured,byReason,retried,recoveredByRetry:recovered};
}

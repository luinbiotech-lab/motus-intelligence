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

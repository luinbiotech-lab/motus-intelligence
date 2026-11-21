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
/** Search keywords for an article: the category's market phrase and the headline's first words without figures. */
export function articleKeywords(title:string,labels:string[]):string[] {
  // Weekly outlook (owner 2026-11-16, MOT-051): the title's first words are not a search phrase; use the phrases people type.
  if(labels.some(label=>/주간/.test(label)))return ['주간 증시 전망','이번주 증시 전망'];
  const base=labels.some(label=>/국내증시/.test(label))?'코스피 마감':labels.some(label=>/미국증시/.test(label))?'뉴욕증시 마감':labels.some(label=>/AI/.test(label))?'AI 뉴스':labels.some(label=>/주간/.test(label))?'주간 증시 전망':null;
  const head=(title.split(/…|\.\.\.|,|·/)[0]??'').replace(/\[[^\]]*\]/g,' ').replace(/[\d.,]+%?|[▲▼+\-−%()]/g,' ').split(/\s+/).filter(word=>word.length>=2&&!/^(급락해|급등해|상승해|하락해|마감|기록)$/.test(word)).slice(0,3).join(' ').trim();
  return [...new Set([base,head].filter((item):item is string=>Boolean(item&&item.length>=2)))];
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

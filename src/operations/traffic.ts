/** Helpers for the daily traffic analysis input (owner request 2026-11-04). */
export interface ContentFeatures {textLength:number;imageCount:number;chartCount:number;headingCount:number;tableCount:number;linkCount:number}
/** Plain features of an article body (HTML). */
export function contentFeatures(html:string):ContentFeatures {
  const text=html.replace(/<(script|style)[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&[a-z#0-9]+;/gi,' ').replace(/\s+/g,' ').trim();
  return {textLength:text.length,imageCount:(html.match(/<img\b/gi)??[]).length,chartCount:(html.match(/<svg\b/gi)??[]).length,headingCount:(html.match(/<h[1-4]\b|role="heading"/gi)??[]).length,tableCount:(html.match(/<table\b/gi)??[]).length,linkCount:(html.match(/<a\s[^>]*href=/gi)??[]).length};
}
/** Search keywords for an article: the category's market phrase and the headline's first words without figures. */
export function articleKeywords(title:string,labels:string[]):string[] {
  const base=labels.some(label=>/국내증시/.test(label))?'코스피 마감':labels.some(label=>/미국증시/.test(label))?'뉴욕증시 마감':labels.some(label=>/AI/.test(label))?'AI 뉴스':labels.some(label=>/주간/.test(label))?'주간 증시 전망':null;
  const head=(title.split(/…|\.\.\.|,|·/)[0]??'').replace(/\[[^\]]*\]/g,' ').replace(/[\d.,]+%?|[▲▼+\-−%()]/g,' ').split(/\s+/).filter(word=>word.length>=2&&!/^(급락해|급등해|상승해|하락해|마감|기록)$/.test(word)).slice(0,3).join(' ').trim();
  return [...new Set([base,head].filter((item):item is string=>Boolean(item&&item.length>=2)))];
}


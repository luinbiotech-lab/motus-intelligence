export interface EditorialQualityResult {pass:boolean;reasons:string[];notes:string[];visibleText:string;proseTextLength:number;proseBlockCount:number;koreanTextRatio:number;englishCopiedTextRatio:number}

export function evaluateEditorialQuality(title:string,html:string):EditorialQualityResult {
  const reasons:string[]=[],notes:string[]=[];
  const decoded=decodeRepeated(html),withoutCode=decoded.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' '),visible=withoutCode.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const proseHtml=withoutCode.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi,' ').replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi,' ').replace(/<ul\b[^>]*>[\s\S]*?<\/ul>/gi,' ');
  const blocks=[...proseHtml.matchAll(/<(?:p|li)\b[^>]*>([\s\S]*?)<\/(?:p|li)>/gi)].map(match=>match[1]!.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()).filter(value=>value.length>=40);
  const korean=(title.match(/[가-힣]/g)??[]).length,latin=(title.match(/[A-Za-z]/g)??[]).length,bodyKorean=(visible.match(/[가-힣]/g)??[]).length,bodyLatin=(visible.match(/[A-Za-z]/g)??[]).length;
  if(title.length<12||!korean||latin>korean*1.5)reasons.push('title is not natural Korean-first editorial copy');
  if(titleContainsCalendarDate(title))reasons.push('calendar date exposed in title');
  if(/^\s*(?:MOTUS\b|AI 인텔리전스\s*:|미국증시 마감\s*:)/i.test(title))reasons.push('mechanical title prefix exposed');
  if(/<(?:script|style)\b/i.test(decoded))reasons.push('script or style payload present');
  if(/(?:^|[>\s])https?:\/\//i.test(visible))reasons.push('plain or encoded raw URL exposed');
  if(/(무슨 일이 있었나|왜 중요한가|핵심 내용|산업 연결|시장 연결)\s*:?/i.test(visible))reasons.push('internal editorial label exposed');
  if(/주요 지수가 함께 오른 만큼 특정 업종보다 시장 전반의 위험 선호가 개선|발표 제목과 본문은.{0,80}관한 내용을 다룬다|원문에서 언급된 제품·플랫폼은|원문에서 함께 언급된 국가·기업은/.test(visible))reasons.push('generic template prose or unsupported market breadth inference detected');
  const proseTextLength=blocks.reduce((sum,block)=>sum+block.length,0);
  if(proseTextLength<900||blocks.length<4)reasons.push('article depth insufficient');
  if(blocks.length&&new Set(blocks.map(normalize)).size!==blocks.length)reasons.push('boilerplate prose repetition detected');
  const koreanTextRatio=bodyKorean/Math.max(bodyKorean+bodyLatin,1),englishCopiedTextRatio=bodyLatin/Math.max(bodyKorean+bodyLatin,1);
  if(koreanTextRatio<0.43||englishCopiedTextRatio>0.57)reasons.push('body contains excessive English copied text');
  if(/(?:&(?:amp;){1,3}lt;|&lt;)\s*(?:script|style|img|a)\b/i.test(html))reasons.push('double-encoded markup present');
  if(reasons.length===0&&latin>korean)notes.push('English company or product names are concentrated; Korean-first context retained');
  return {pass:reasons.length===0,reasons:[...new Set(reasons)],notes,visibleText:visible,proseTextLength,proseBlockCount:blocks.length,koreanTextRatio,englishCopiedTextRatio};
}

export function titleContainsCalendarDate(title:string):boolean {
  return /(?:\b(?:19|20)\d{2}[-./](?:0?[1-9]|1[0-2])[-./](?:0?[1-9]|[12]\d|3[01])\b|(?:(?:19|20)\d{2}년\s*)?(?:0?[1-9]|1[0-2])월\s*(?:0?[1-9]|[12]\d|3[01])일)/u.test(title);
}

export function publisherConcentrationWarning(publishers:string[],majorIssueVerified:boolean):string|null {const normalized=publishers.map(value=>value.trim().toLowerCase()).filter(Boolean);if(normalized.length<2||new Set(normalized).size>1)return null;return majorIssueVerified?'publisher concentration accepted for one clearly verified major issue':'publisher concentration requires editorial review'}

function decodeRepeated(value:string){let result=value;for(let i=0;i<3;i++){const next=result.replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&#39;',"'");if(next===result)break;result=next}return result}
function normalize(value:string){return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()}

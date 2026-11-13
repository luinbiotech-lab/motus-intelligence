/**
 * Daily Naver blog summary (owner decision 2026-11-11: open a Naver blog channel, posted by hand ~5 min a day).
 * Naver's own top results for '코스피 마감' / '뉴욕증시 마감' are all Naver blogs, and MOTUS posts are absent there.
 * The summary is a new, shorter text across the day's categories (not a copy of any MOTUS post, which Naver's
 * similar-document filter could demote): an own intro, the key facts, one check point per category, and a link to
 * the full MOTUS article. Deterministic, no AI call. Facts come only from the published units.
 */
export interface NaverSummaryPart {category:'korea'|'us'|'ai';title:string;url:string;keyPoints:string[];synthesis?:string|null;checkpoint?:string|null;heroImageUrl?:string|null;topStock?:string|null}
export interface NaverSummary {date:string;title:string;body:string;tags:string[];category:string;imageUrl:string|null;markdown:string}

// Owner's Naver blog (Lucius Insight Lab) keeps its categories; the briefing is a sub-category of 자본시장·투자 분석.
export const NAVER_CATEGORY='자본시장·투자 분석 > 증시 브리핑';
const NAME:Record<NaverSummaryPart['category'],string>={korea:'국내증시',us:'뉴욕증시',ai:'AI 산업·AI주'};
const clean=(value:string)=>value.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();

/** Key-point items and the 'MOTUS 정리' paragraph from the rendered article. */
export function extractArticleFacts(html:string):{keyPoints:string[];synthesis:string|null}{
  // The key-points box (editorial-article keyPoints): numbered <p><span>N</span><span>text</span></p> rows.
  const box=html.match(/data-section="key-points"[\s\S]*?<\/p><\/div>/)?.[0]??'';
  const keyPoints=[...box.matchAll(/<p\b[^>]*><span\b[^>]*>\d+<\/span><span>([\s\S]*?)<\/span><\/p>/g)].map(match=>clean(match[1]!)).filter(text=>text.length>=8).slice(0,3);
  const synthesis=[...html.matchAll(/<(?:p|div)\b[^>]*>(MOTUS 정리:[\s\S]*?)<\/(?:p|div)>/g)].map(match=>clean(match[1]!)).find(text=>text.startsWith('MOTUS 정리:'))??null;
  return {keyPoints,synthesis:synthesis?synthesis.replace(/^MOTUS 정리:\s*/,'').slice(0,220):null};
}

const headline=(part:NaverSummaryPart)=>part.category==='korea'?part.title.split('…')[0]!.replace(/^\d+월 \d+일\s*/,''):part.category==='us'?(part.title.split('…')[1]??part.title.split('…')[0]!):part.title.split('…')[0]!;
const dateKo=(iso:string)=>`${Number(iso.slice(5,7))}월 ${Number(iso.slice(8,10))}일`;
/**
 * 2026-11-12 owner: the image (article title '11월 11일 코스피 마감…') and the summary title ('11월 12일 증시 브리핑')
 * named different days. The summary is about the market session the articles cover, so it is dated by the session
 * date printed in the Korea or U.S. article title; the operation date is only the fallback.
 */
const sessionOf=(part:NaverSummaryPart|undefined)=>part?.title.match(/^(\d{1,2}월 \d{1,2}일)/)?.[1]??null;
const sessionLabel=(list:NaverSummaryPart[],date:string)=>{for(const key of ['korea','us'] as const){const match=list.find(part=>part.category===key)?.title.match(/^(\d{1,2}월 \d{1,2}일)/);if(match)return match[1]!}return dateKo(date)};

/**
 * 2026-11-13 owner: the intro was polite ('정리했습니다') while the body was plain ('했다'). The whole summary is plain
 * style. A sourced line that is written politely (e.g. a quoted broker sentence) is left out, and the template itself is
 * checked so a polite ending can never be published.
 */
const POLITE=/(습니다|습니까|입니다|합니다|됩니다|십니다|세요|십시오|해요|어요|에요|예요)/g;
export function politeEndings(text:string):string[]{return [...new Set(text.match(POLITE)??[])]}
const plain=(text:string)=>politeEndings(text).length===0;

export function buildNaverSummary(date:string,parts:NaverSummaryPart[]):NaverSummary{
  const order=['korea','us','ai'] as const,list=order.map(key=>parts.find(part=>part.category===key)).filter((part):part is NaverSummaryPart=>Boolean(part&&part.url&&part.keyPoints.length));
  if(!list.length)throw new Error('no published category with key points');
  const day=sessionLabel(list,date),title=`${day} 증시 브리핑: ${list.slice(0,2).map(headline).map(text=>text.trim()).join(', ')}`.slice(0,80);
  const usDay=sessionOf(list.find(part=>part.category==='us')),lines:string[]=[`${usDay&&usDay!==day?`${day} 국내 장 마감과 직전 뉴욕증시(${usDay} 마감), AI 관련 흐름을`:`${day} 장 마감 기준으로 국내·미국 증시와 AI 관련 흐름을`} 숫자 중심으로 짧게 정리했다. 항목마다 핵심 수치와 다음에 확인할 점을 적었고, 차트와 증권사 리포트 인용이 들어간 전체 분석은 각 항목 끝 링크에 있다.`,''];
  list.forEach((part,index)=>{
    const session=sessionOf(part);lines.push(`${index+1}. ${NAME[part.category]}${session&&session!==day?`(${session} 마감)`:''} — ${headline(part).trim()}`);
    for(const point of part.keyPoints.filter(plain))lines.push(`· ${point}`);
    if(part.synthesis&&plain(part.synthesis))lines.push(`· ${/증권사|증권가|리포트/.test(part.synthesis)?'증권가 공통 시각':'MOTUS 정리'}: ${part.synthesis}`);
    if(part.checkpoint&&plain(part.checkpoint))lines.push(`· 다음에 볼 것: ${part.checkpoint}`);
    lines.push(`→ 전체 분석: ${part.url}`,'');
  });
  lines.push('※ 공개된 시세와 증권사 리포트를 정리한 정보이며 투자 권유가 아니다. 투자 판단과 책임은 투자자 본인에게 있다.');
  const body=lines.join('\n');
  const polite=politeEndings(body);if(polite.length)throw new Error('NAVER_SUMMARY_MIXED_STYLE:'+polite.join(','));
  const tags=[...new Set(['오늘의증시','증시브리핑','코스피마감','코스닥','뉴욕증시','나스닥','미국증시','AI주','환율','MOTUS',...list.map(part=>part.topStock??'').filter(Boolean).map(name=>name.replace(/\s+/g,''))])].slice(0,15);
  const imageUrl=list.find(part=>part.heroImageUrl)?.heroImageUrl??null;
  const markdown=[`# 네이버 블로그 올리기 — ${date}`,'',`**제목** (복사)`,'',title,'',`**카테고리**: ${NAVER_CATEGORY}`,'',`**태그** (복사)`,'',tags.map(tag=>'#'+tag).join(' '),'',imageUrl?`**대표 이미지** (저장 후 첨부): ${imageUrl}`:'**대표 이미지**: 없음','','**본문** (아래 전체 복사)','','```text',body,'```',''].join('\n');
  return {date,title,body,tags,category:NAVER_CATEGORY,imageUrl,markdown};
}

/** A published article as read from ops-data, with when it went public (searchRegistration.registeredAt). */
export interface PublishedCandidate extends NaverSummaryPart {operationDate:string;registeredAt:string}
/**
 * 2026-11-13 owner: the summary reached him near noon the next day, so it went up in the evening, a day late. The Naver
 * post is now prepared right after the Korea close article goes public (~17:15 KST): that day's Korea close, plus the
 * U.S. and AI articles that were already public at that moment (published within the 30 hours before it). Articles
 * published later belong to the next evening's post, so a summary never changes after it is handed over.
 */
export const EVENING_WINDOW_HOURS=30;
export function selectEveningParts(units:PublishedCandidate[]):{anchor:PublishedCandidate;parts:PublishedCandidate[]}|null{
  const at=(unit:PublishedCandidate)=>Date.parse(unit.registeredAt),valid=units.filter(unit=>Number.isFinite(at(unit)));
  const anchor=valid.filter(unit=>unit.category==='korea').sort((a,b)=>at(b)-at(a))[0];
  if(!anchor)return null;
  const pick=(category:'us'|'ai')=>valid.filter(unit=>unit.category===category&&at(unit)<=at(anchor)&&at(anchor)-at(unit)<=EVENING_WINDOW_HOURS*3600e3).sort((a,b)=>at(b)-at(a))[0];
  return {anchor,parts:[anchor,pick('us'),pick('ai')].filter((unit):unit is PublishedCandidate=>Boolean(unit))};
}
/** Phone copy text: title, tags and body in the order they are pasted into the Naver app. */
export function phoneText(summary:NaverSummary):string{return ['[제목]',summary.title,'','[태그]',summary.tags.map(tag=>'#'+tag).join(' '),'','[대표 이미지] 링크를 열어 길게 눌러 저장',summary.imageUrl??'없음','','[본문]',summary.body,''].join('\n')}

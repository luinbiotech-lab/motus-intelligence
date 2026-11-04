/**
 * Which article data a daily report may chart (루인 review P0, 2026-11-04): only a unit whose rendered article is
 * byte-for-byte the article stored on Blogger (the same check the daily publication itself uses), so the PDF never
 * carries a title, lead, broker note or figure the published article did not. The publishing run's snapshot
 * (published-unit.json) is tried first, the category's live-unit.json second; each rejection is recorded with its
 * own reason code. A published article without a matching unit is linked, not charted.
 */
import type {SplitPublicationUnit} from '../intelligence/split-daily-production.js';
import type {BloggerPostReadback} from '../services/blogger.js';
import {storedContentValid} from '../production/auto-publish.js';
import type {DailyCategory} from '../reports/daily-pdf.js';

export interface PublishedArticle {url:string;sessionDate:string|null;attemptId:string|null;postId:string|null}
/** The article this operation date published (last PUBLISHED/REPUBLISHED ledger entry with a public URL). */
export function publishedArticle(ledger:string):PublishedArticle|null {
  let found:PublishedArticle|null=null;
  for(const line of ledger.split('\n').filter(Boolean)){
    try{const entry=JSON.parse(line) as {event?:string;publicPostUrl?:string|null;sessionDate?:string;attemptId?:string;postId?:string|null};
      if((entry.event==='PUBLISHED'||entry.event==='REPUBLISHED')&&entry.publicPostUrl)found={url:entry.publicPostUrl,sessionDate:entry.sessionDate??null,attemptId:entry.attemptId?String(entry.attemptId):null,postId:entry.postId??null}}
    catch{/* a torn line is skipped */}
  }
  return found;
}

export interface CategoryFiles {ledger:string;snapshot:string|null;live:string|null}
export interface UnitCandidate {source:'SNAPSHOT'|'LIVE';unit:SplitPublicationUnit}
export interface CategoryPlan {published:PublishedArticle|null;candidates:UnitCandidate[];reasons:string[]}
/** Candidate units for a category, each rejection with its reason (ABSENT, UNREADABLE, INVALID, SESSION_MISMATCH). */
export function planCategory(category:DailyCategory,files:CategoryFiles):CategoryPlan {
  const published=publishedArticle(files.ledger),reasons:string[]=[],candidates:UnitCandidate[]=[];
  if(!published)return {published:null,candidates,reasons:['NOT_PUBLISHED']};
  for(const [source,text] of [['SNAPSHOT',files.snapshot],['LIVE',files.live]] as const){
    if(text===null){reasons.push(`${source}_ABSENT`);continue}
    let unit:Partial<SplitPublicationUnit>;
    try{unit=JSON.parse(text) as Partial<SplitPublicationUnit>}catch{reasons.push(`${source}_UNREADABLE`);continue}
    if(unit.category!==category||!unit.viewModel||!unit.title||typeof unit.render?.html!=='string'){reasons.push(`${source}_INVALID`);continue}
    if(published.sessionDate&&unit.observedDate!==published.sessionDate){reasons.push(`${source}_SESSION_MISMATCH`);continue}
    candidates.push({source,unit:unit as SplitPublicationUnit});
  }
  return {published,candidates,reasons};
}

/** The post as published, without the per-article PDF link block some posts received on 2026-11-04. */
export function withoutDailyPdfLink(html:string):string {return html.replace(/<section data-section="daily-pdf"[\s\S]*?<\/section>/g,'')}
/** The candidate whose rendered article equals the stored post, or why none does. */
export function verifiedCandidate(plan:CategoryPlan,post:BloggerPostReadback):{candidate:UnitCandidate}|{reason:string} {
  if(!plan.published)return {reason:'NOT_PUBLISHED'};
  if(post.status!=='PUBLISHED'||post.url!==plan.published.url)return {reason:'POST_IDENTITY_MISMATCH'};
  if(!plan.candidates.length)return {reason:'NO_CANDIDATE_UNIT'};
  const stored={...post,content:withoutDailyPdfLink(post.content)};
  for(const candidate of plan.candidates)if(storedContentValid(candidate.unit,stored))return {candidate};
  return {reason:'CONTENT_MISMATCH'};
}

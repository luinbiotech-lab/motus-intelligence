/**
 * Backfill of already published posts (coordinator 2026-11-11, owner approval required before execution).
 * Measured 2026-11-11: 33 of 51 public posts had no internal link and 43 had no image. New posts get both since
 * #119/#120; this adds the same internal-link block and, when the post has no image, a title card to old posts.
 * The original body is never rewritten: the card is placed first and the link block last, the original is kept
 * byte for byte as a backup, and a revert restores it exactly.
 */
import {createHash} from 'node:crypto';
import {relatedPosts} from '../publishers/editorial-article.js';
import {type RelatedPost,pickRelatedPosts} from '../publishers/related-posts.js';

export const BACKFILL_MARKER='<!-- motus-backfill:v1 -->';
export const BACKFILL_ROOT='data/daily-report/backfill';
export const BACKFILL_IMAGE_BASE='https://raw.githubusercontent.com/luinbiotech-lab/motus-intelligence/ops-data/data/daily-report/backfill/img/';
export type FeedPost=RelatedPost&{postId:string};
export interface BackfillCandidate {postId:string;url:string;title:string;label:string;published:string}
export interface BackfillPlanItem {postId:string;url:string;title:string;labels:string[];originalSha256:string;proposedSha256:string;image:string|null;relatedCount:number}

export const sha256=(value:string)=>'sha256:'+createHash('sha256').update(value).digest('hex');

export function parseFeedWithIds(body:unknown):FeedPost[]{
  const feed=body as {feed?:{entry?:Array<{id?:{$t?:string};title?:{$t?:string};published?:{$t?:string};category?:Array<{term?:string}>;link?:Array<{rel?:string;href?:string}>}>}};
  const decode=(value:string)=>value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
  const canonical=['국내증시','미국증시','AI 인텔리전스','주간 증시','리포트'];
  return (feed.feed?.entry??[]).map(entry=>({postId:(entry.id?.$t??'').match(/post-(\d+)$/)?.[1]??'',title:decode(entry.title?.$t??''),url:entry.link?.find(link=>link.rel==='alternate')?.href??'',label:(entry.category??[]).map(item=>item.term??'').find(term=>canonical.includes(term))??legacyLabel((entry.category??[]).map(item=>item.term??'')),published:(entry.published?.$t??'').slice(0,10)})).filter(post=>post.postId&&post.title&&/^https:\/\/motusnova\.blogspot\.com\/\d{4}\/\d{2}\/[\w.-]+\.html$/.test(post.url));
}
/** Early posts carried '미국증시 (U.S. Market)' style labels; they belong to the same category. */
export function legacyLabel(terms:string[]):string{for(const term of terms){if(term.startsWith('국내증시'))return '국내증시';if(term.startsWith('미국증시'))return '미국증시';if(term.startsWith('AI 인텔리전스'))return 'AI 인텔리전스'}return ''}

/** Oldest first, skipping posts already backfilled or already carrying the link block (checked again on the body). */
export function backfillOrder(posts:FeedPost[],done:Set<string>):FeedPost[]{return [...posts].filter(post=>!done.has(post.postId)).sort((a,b)=>a.published.localeCompare(b.published)||a.url.localeCompare(b.url))}

export type Eligibility={eligible:true;needsLinks:boolean;needsImage:boolean}|{eligible:false;reason:string};
export function eligibility(content:string):Eligibility{
  const body=content.trim();
  if(!/^<article\b[\s\S]*<\/article>$/i.test(body))return {eligible:false,reason:'body is not a single <article> (not a pipeline post)'};
  if(body.includes(BACKFILL_MARKER))return {eligible:false,reason:'already backfilled'};
  const needsLinks=!/data-section="related-posts"/.test(body),needsImage=!/<img\b/i.test(body);
  if(!needsLinks&&!needsImage)return {eligible:false,reason:'already has internal links and an image'};
  return {eligible:true,needsLinks,needsImage};
}

/** The card first, the original body untouched, the link block before </article>. */
export function backfillContent(original:string,input:{post:FeedPost;all:FeedPost[];image?:{file:string;alt:string}|null}):{content:string;related:number}{
  const body=original.trim(),state=eligibility(body);if(!state.eligible)throw new Error('not eligible: '+state.reason);
  const picked=state.needsLinks?pickRelatedPosts(input.all.filter(post=>post.url!==input.post.url),input.post.label,input.post.published):[];
  const block=picked.length?relatedPosts(picked,input.post.label):'';
  const image=state.needsImage&&input.image&&/^hero-[0-9a-f]{12}\.png$/.test(input.image.file)?`<figure data-section="hero-image" style="margin:0 0 22px"><img src="${BACKFILL_IMAGE_BASE}${input.image.file}" alt="${input.image.alt.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}" width="1200" height="630" style="display:block;width:100%;height:auto;border:0"></figure>`:'';
  const open=body.match(/^<article\b[^>]*>/i)![0],inner=body.slice(open.length,body.length-'</article>'.length);
  return {content:`${open}${BACKFILL_MARKER}${image}${inner}${block}</article>`,related:(block.match(/<li /g)??[]).length};
}
/** Exact restore check: the backfilled body minus the added parts is the original. */
export function stripBackfill(content:string):string{
  const body=content.trim();if(!body.includes(BACKFILL_MARKER))return body;
  return body.replace(BACKFILL_MARKER,'').replace(/<figure data-section="hero-image"[^>]*><img src="https:\/\/raw\.githubusercontent\.com\/luinbiotech-lab\/motus-intelligence\/ops-data\/data\/daily-report\/backfill\/img\/[^"]+"[^>]*><\/figure>/,'').replace(/<section data-section="related-posts"[\s\S]*<\/section>(?=<\/article>$)/,'');
}

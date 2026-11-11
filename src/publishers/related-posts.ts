/**
 * Internal links for each article (owner 2026-11-11, crawl allocation).
 * Measured 2026-11-11: 51 public posts, 33 with no internal link, and every article since 11/06 linked only to the
 * five newest posts, so a post older than about two days received no new internal link at all. The block now keeps
 * the newest posts, adds the same category's previous edition, and rotates two archive posts by date so every
 * older post is linked again over time. Category pages are linked separately (relatedCategoryHubs).
 */
export type RelatedPost={title:string;url:string;label:string;published:string};
export const MOTUS_BLOG_ORIGIN='https://motusnova.blogspot.com';
export const RELATED_CANONICAL_LABELS=['국내증시','미국증시','AI 인텔리전스','주간 증시','리포트'] as const;
/** Posts read from the public feed; the window covers the whole archive (51 posts on 2026-11-11). */
export const RELATED_FEED_URL=`${MOTUS_BLOG_ORIGIN}/feeds/posts/summary?alt=json&max-results=150`;

export function parseRelatedFeed(body:unknown):RelatedPost[]{
  const feed=body as {feed?:{entry?:Array<{title?:{$t?:string};published?:{$t?:string};category?:Array<{term?:string}>;link?:Array<{rel?:string;href?:string}>}>}};
  const decode=(value:string)=>value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
  return (feed.feed?.entry??[]).map(entry=>({title:decode(entry.title?.$t??''),url:entry.link?.find(link=>link.rel==='alternate')?.href??'',label:(entry.category??[]).map(item=>item.term??'').find(term=>(RELATED_CANONICAL_LABELS as readonly string[]).includes(term))??'',published:(entry.published?.$t??'').slice(0,10)})).filter(post=>post.title&&post.url);
}

/**
 * newest (at most 3, two per label) + the same label's previous edition + 2 archive posts chosen by the operation
 * date, so consecutive days link different older posts. Posts of this label on or after the operation date are left
 * out (a republish never links to itself). Deterministic for the same input.
 */
export function pickRelatedPosts(all:RelatedPost[],label:string,operationDate:string):RelatedPost[]{
  const posts=[...all].filter(post=>!(post.label===label&&post.published>=operationDate)).sort((a,b)=>b.published.localeCompare(a.published));
  const picked:RelatedPost[]=[],has=(post:RelatedPost)=>picked.some(item=>item.url===post.url),perLabel=new Map<string,number>();
  for(const post of posts){if(picked.length>=3)break;const count=perLabel.get(post.label)??0;if(count>=2)continue;perLabel.set(post.label,count+1);picked.push(post)}
  const previous=posts.find(post=>post.label===label);
  if(previous&&!has(previous))picked.push(previous);
  const archive=posts.slice(12).filter(post=>!has(post));
  if(archive.length){
    const seed=[...(operationDate+label)].reduce((sum,char)=>(sum*31+char.codePointAt(0)!)>>>0,7);
    const first=seed%archive.length;picked.push(archive[first]!);
    if(archive.length>1)picked.push(archive[(first+Math.max(1,Math.floor(archive.length/2)))%archive.length]!);
  }
  return picked.slice(0,6);
}

/** Category (label) pages: the hubs a crawler follows to reach every post of a category. */
export function relatedCategoryHubs(current:string):Array<{label:string;url:string}>{
  return ['국내증시','미국증시','AI 인텔리전스','리포트'].sort((a,b)=>Number(b===current)-Number(a===current)).map(label=>({label,url:`${MOTUS_BLOG_ORIGIN}/search/label/${encodeURIComponent(label)}`}));
}

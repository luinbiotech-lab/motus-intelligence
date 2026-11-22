/**
 * URL Inspection sample carry-over (MO-13, MOT-053).
 *
 * The daily traffic input inspects the fixed sample, the previous day's articles and the newest 50 feed posts.
 * When new posts push an older indexed post out of the newest 50, it silently leaves the sample, so the indexed
 * count falls (9 → 5 → 3 → 2 between 11/14 and 11/19) without any page losing its index. This keeps every URL that
 * was indexed (verdict PASS) in a recent earlier capture in today's sample, so a drop means a real change.
 * Read-only: it only chooses which URLs to inspect.
 */

export interface PriorCapture {
  /** Analysis date of the earlier traffic-input.json (YYYY-MM-DD). */
  date:string;
  input:unknown;
}

export interface CarriedIndexedUrl {
  url:string;
  /** Latest earlier capture date in which this URL was PASS. */
  lastPassDate:string;
}

/** Same page regardless of http/https, the mobile `?m=1` variant, a fragment or a trailing query. */
export function normalizeInspectionUrl(raw:string):string {
  try{
    const url=new URL(raw);
    url.protocol='https:';url.hash='';url.searchParams.delete('m');
    return url.search?url.href:url.origin+url.pathname;
  }catch{return raw.trim()}
}

/**
 * URLs that were PASS in captures within `maxAgeDays` before `date`, newest PASS first, at most `limit`.
 * Captures dated on or after `date` are ignored (re-runs must not read the future).
 */
export function carriedIndexedUrls(date:string,priors:PriorCapture[],options:{maxAgeDays?:number;limit?:number}={}):CarriedIndexedUrl[] {
  const maxAgeDays=options.maxAgeDays??14,limit=options.limit??20;
  const floor=new Date(Date.parse(date+'T00:00:00Z')-maxAgeDays*86400000).toISOString().slice(0,10);
  const latest=new Map<string,string>();
  for(const prior of priors){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(prior.date)||prior.date>=date||prior.date<floor)continue;
    const status=(prior.input as {indexStatus?:{state?:string;inspections?:unknown}}|null)?.indexStatus;
    if(status?.state!=='PASS'||!Array.isArray(status.inspections))continue;
    for(const item of status.inspections as Array<{url?:unknown;verdict?:unknown}>){
      if(typeof item?.url!=='string'||item.verdict!=='PASS')continue;
      const url=normalizeInspectionUrl(item.url),seen=latest.get(url);
      if(!seen||prior.date>seen)latest.set(url,prior.date);
    }
  }
  return [...latest].map(([url,lastPassDate])=>({url,lastPassDate}))
    .sort((a,b)=>b.lastPassDate.localeCompare(a.lastPassDate)||a.url.localeCompare(b.url)).slice(0,limit);
}

/**
 * Inspection order: fixed sample, the day's articles, carried indexed URLs, then recent feed posts; de-duplicated on
 * the normalized URL, capped at `max`. Carried URLs come before the feed so the cap or time budget drops feed posts
 * first, never a previously indexed page.
 */
export function inspectionUrlOrder(groups:{fixed:string[];articles:string[];carried:string[];recent:string[]},max=60):Array<{url:string;source:'fixed'|'article'|'carried'|'recent'}> {
  const out:Array<{url:string;source:'fixed'|'article'|'carried'|'recent'}>=[],seen=new Set<string>();
  for(const [source,urls] of [['fixed',groups.fixed],['article',groups.articles],['carried',groups.carried],['recent',groups.recent]] as const)
    for(const url of urls){const key=normalizeInspectionUrl(url);if(!url||seen.has(key))continue;seen.add(key);out.push({url,source})}
  return out.slice(0,max);
}

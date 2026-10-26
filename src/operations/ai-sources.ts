/**
 * Official AI source registry and evidence helpers (free, no LLM).
 *
 * Every candidate must come from an official publisher channel, link to that publisher's own domain,
 * carry a verifiable publication date, and contain enough first-party text to state facts. When an
 * article page refuses automated access (e.g. HTTP 403), the publisher's own RSS body is used as the
 * fallback evidence and recorded as such; such RSS-only items may support an issue but never lead it.
 */

/** Only OFFICIAL_PAGE (article body paragraphs) is lead-grade; every other basis is summary-grade. */
export type AIEvidenceBasis='OFFICIAL_PAGE'|'OFFICIAL_PAGE_SUMMARY'|'OFFICIAL_RSS_FULLTEXT'|'OFFICIAL_RSS_SUMMARY';

export interface OfficialAISource {
  id:string;publisher:string;url:string;domains:string[];
  /** true when the channel also publishes non-AI news and items must pass the AI relevance filter */
  aiFilter:boolean;
  kind:'rss'|'anthropic-index';
}

export const OFFICIAL_AI_SOURCES:OfficialAISource[]=[
  {id:'openai',publisher:'OpenAI',url:'https://openai.com/news/rss.xml',domains:['openai.com'],aiFilter:false,kind:'rss'},
  {id:'google-ai',publisher:'Google AI',url:'https://blog.google/technology/ai/rss/',domains:['blog.google'],aiFilter:false,kind:'rss'},
  {id:'google-deepmind',publisher:'Google DeepMind',url:'https://deepmind.google/blog/rss.xml',domains:['deepmind.google'],aiFilter:false,kind:'rss'},
  {id:'nvidia',publisher:'NVIDIA',url:'https://blogs.nvidia.com/feed/',domains:['blogs.nvidia.com','nvidia.com'],aiFilter:false,kind:'rss'},
  {id:'nvidia-newsroom',publisher:'NVIDIA',url:'https://nvidianews.nvidia.com/releases.xml',domains:['nvidianews.nvidia.com','nvidia.com'],aiFilter:true,kind:'rss'},
  {id:'microsoft',publisher:'Microsoft',url:'https://blogs.microsoft.com/feed/',domains:['blogs.microsoft.com','microsoft.com'],aiFilter:true,kind:'rss'},
  {id:'microsoft-source',publisher:'Microsoft',url:'https://news.microsoft.com/source/feed/',domains:['news.microsoft.com','microsoft.com'],aiFilter:true,kind:'rss'},
  {id:'aws-news',publisher:'Amazon AWS',url:'https://aws.amazon.com/blogs/aws/feed/',domains:['aws.amazon.com'],aiFilter:true,kind:'rss'},
  {id:'aws-whats-new',publisher:'Amazon AWS',url:'https://aws.amazon.com/about-aws/whats-new/recent/feed/',domains:['aws.amazon.com'],aiFilter:true,kind:'rss'},
  {id:'meta',publisher:'Meta',url:'https://about.fb.com/news/feed/',domains:['about.fb.com'],aiFilter:true,kind:'rss'},
  {id:'anthropic',publisher:'Anthropic',url:'https://www.anthropic.com/news',domains:['anthropic.com'],aiFilter:false,kind:'anthropic-index'},
];

export interface FeedItem {title:string;link:string;publishedAt:string;summary:string;fullText:string}

export function decodeText(value:string):string {
  return value.replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ')
    .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(entity,digits:string)=>{const code=digits[0]!.toLowerCase()==='x'?parseInt(digits.slice(1),16):Number(digits);return code>0&&code<=0x10ffff?String.fromCodePoint(code):entity})
    .replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&apos;/gi,"'").replace(/&quot;/gi,'"').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
}

function tag(block:string,names:string[]):string {
  for(const name of names){const escaped=name.replace(':','\\:');const match=block.match(new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`,'i'));if(match)return match[1]!}
  return '';
}

export function parseFeed(xml:string):FeedItem[] {
  return [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map(match=>{
    const block=match[0],href=block.match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1]??decodeText(tag(block,['link']));
    return {title:decodeText(tag(block,['title'])),link:href.trim(),publishedAt:decodeText(tag(block,['pubDate','published','updated','dc:date'])),summary:decodeText(tag(block,['description','summary'])),fullText:decodeText(tag(block,['content:encoded','content']))};
  }).filter(item=>item.title&&/^https:\/\//.test(item.link));
}

/** Links from the Anthropic news index, excluding category/landing pages. */
export function parseAnthropicIndex(html:string):string[] {
  const category=new Set(['announcements','features','product','policy','research','company','events','press','customers']);
  const slugs=[...html.matchAll(/href=["'](?:https:\/\/www\.anthropic\.com)?\/news\/([a-z0-9][a-z0-9-]{2,})["']/gi)].map(match=>match[1]!.toLowerCase()).filter(slug=>!category.has(slug));
  return [...new Set(slugs)].map(slug=>`https://www.anthropic.com/news/${slug}`);
}

export function isOfficialLink(link:string,domains:string[]):boolean {
  try{const url=new URL(link);if(url.protocol!=='https:')return false;const host=url.hostname.toLowerCase();return domains.some(domain=>host===domain||host.endsWith('.'+domain))}catch{return false}
}

const AI_TERMS=/\b(?:ai|a\.i\.|artificial intelligence|machine learning|generative|genai|llms?|large language models?|foundation models?|frontier models?|agents?|agentic|copilot|gemini|gemma|claude|chatgpt|gpt-?\d|llama|bedrock|sagemaker|nova|inference|training|gpus?|accelerated computing|supercomput\w*|data cent(?:er|re)s?|ai factor(?:y|ies)|neural|deep learning|reasoning models?|multimodal)\b/i;
const NON_NEWS=/\b(?:how to|hands-on|step[- ]by[- ]step|tutorial|walkthrough|best practices|deep dive into|getting started|webinar|podcast|career advice|recipe|quiz)\b/i;

export function isAIRelevant(title:string,text:string):boolean {return AI_TERMS.test(title)||(text.match(new RegExp(AI_TERMS.source,'gi'))??[]).length>=3}
/** Mixed-topic channels (newsroom, corporate blog, product updates) must name AI in the headline itself. */
const AI_HEADLINE=/\b(?:ai|a\.i\.|artificial intelligence|machine learning|generative|genai|llms?|large language models?|foundation models?|frontier models?|ai agents?|agentic|copilot|gemini|gemma|claude|chatgpt|gpt-?\d|llama|bedrock|sagemaker|amazon nova|amazon q|trainium|inferentia|gpus?|supercomput\w*|ai factor(?:y|ies)|deep learning|reasoning models?|multimodal|blackwell|vera rubin|dgx|omniverse)\b/i;
/** Mixed-topic channels (newsroom, corporate blog, product updates) must name AI explicitly in the headline. */
export function isAIHeadline(title:string):boolean {return AI_HEADLINE.test(title)}
export function isNewsLike(title:string):boolean {return !NON_NEWS.test(title)}

/** Publication date stated by the article page itself (meta, JSON-LD or <time>). */
export function pagePublishedDate(html:string):string|null {return pagePublishedDateDetail(html)?.iso??null}

/** Page publication date plus whether it came from a timestamped structured field (meta / JSON-LD / time) rather than a printed date-only line. */
export function pagePublishedDateDetail(html:string):{iso:string;structured:boolean}|null {
  const patterns=[
    /<meta\b[^>]*(?:property|name|itemprop)=["'](?:article:published_time|og:article:published_time|datePublished|publish[-_]?date|date)["'][^>]*content=["']([^"']+)["']/i,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["'](?:article:published_time|datePublished)["']/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
    /<time\b[^>]*datetime=["']([^"']+)["']/i,
  ];
  for(const pattern of patterns){const raw=html.match(pattern)?.[1];if(raw&&Number.isFinite(Date.parse(raw)))return {iso:new Date(Date.parse(raw)).toISOString(),structured:/T\d{2}:\d{2}/.test(raw)}}
  const text=decodeText(html.slice(0,60000)).match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.? (\d{1,2}), (20\d{2})\b/);
  if(text){const parsed=Date.parse(`${text[1]} ${text[2]}, ${text[3]} 12:00:00 UTC`);if(Number.isFinite(parsed))return {iso:new Date(parsed).toISOString(),structured:false}}
  return null;
}

export function pageTitle(html:string):string {
  return decodeText(html.match(/<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1]??html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]??'').replace(/\s*[|\\-–—]\s*(?:Anthropic|OpenAI|NVIDIA.*|Microsoft.*|AWS.*|Meta)\s*$/i,'').trim();
}

/** Main-body paragraphs of an official page (navigation and short fragments removed). */
export function pageBodyText(html:string,max=4000):string {
  const scope=html.match(/<article\b[\s\S]*?<\/article>/i)?.[0]??html.match(/<main\b[\s\S]*?<\/main>/i)?.[0]??html;
  const paragraphs=[...scope.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(match=>decodeText(match[1]!)).filter(value=>value.length>=60&&!/cookie|subscribe|sign up|privacy policy|all rights reserved/i.test(value));
  return [...new Set(paragraphs)].join(' ').slice(0,max);
}

/** Publication dates agree when they fall on the same or adjacent UTC day (time-zone stamping differences). */
export function datesAgree(a:string,b:string):boolean {
  const left=Date.parse(a),right=Date.parse(b);
  return Number.isFinite(left)&&Number.isFinite(right)&&Math.abs(left-right)<=36*3600000;
}

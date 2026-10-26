// Temporary runner diagnostic: reports status and freshness of candidate official AI sources via annotations.
const candidates=[
 ['openai','https://openai.com/news/rss.xml'],
 ['openai-page','https://openai.com/index/securing-our-frontier-model-training-environment/'],
 ['google-ai','https://blog.google/technology/ai/rss/'],
 ['deepmind-1','https://deepmind.google/blog/rss.xml'],
 ['deepmind-2','https://deepmind.google/discover/blog/rss.xml'],
 ['nvidia-blog','https://blogs.nvidia.com/feed/'],
 ['nvidia-news','https://nvidianews.nvidia.com/releases.xml'],
 ['microsoft','https://blogs.microsoft.com/feed/'],
 ['microsoft-ai','https://blogs.microsoft.com/ai/feed/'],
 ['ms-source','https://news.microsoft.com/source/feed/'],
 ['aws-news','https://aws.amazon.com/blogs/aws/feed/'],
 ['aws-ml','https://aws.amazon.com/blogs/machine-learning/feed/'],
 ['amazon-news','https://www.aboutamazon.com/news/rss'],
 ['meta-news','https://about.fb.com/news/feed/'],
 ['meta-ai','https://ai.meta.com/blog/rss/'],
 ['anthropic-news','https://www.anthropic.com/news'],
 ['anthropic-rss','https://www.anthropic.com/rss.xml'],
 ['anthropic-feed','https://www.anthropic.com/news/rss.xml'],
];
const ua={'user-agent':'MOTUS-Internal-Collector/1.0',accept:'application/rss+xml,application/atom+xml,application/xml,text/xml,text/html'};
for(const [id,url] of candidates){
  try{
    const r=await fetch(url,{headers:ua,signal:AbortSignal.timeout(20000),redirect:'follow'});const t=await r.text();
    const items=[...t.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map(m=>m[0]);
    const first=items[0]??'';const g=n=>(first.match(new RegExp(`<${n}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${n}>`,'i'))?.[1]??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
    const enc=(first.match(/<content:encoded>[\s\S]*?<\/content:encoded>/i)?.[0]??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').length;
    const newsLinks=[...new Set([...t.matchAll(/href=["'](\/news\/[a-z0-9-]+)["']/gi)].map(m=>m[1]))].slice(0,5).join(' ');
    const pub=(t.match(/(?:article:published_time|datePublished)["']?\s*(?:content=|:)\s*["']([^"']+)/i)?.[1])??'';
    console.log(`::notice title=${id}::status=${r.status} final=${r.url.slice(0,80)} bytes=${t.length} items=${items.length} first=${g('pubDate')||g('published')||g('updated')} | ${g('title').slice(0,70)} | descLen=${g('description').length||g('summary').length} encLen=${enc} newsLinks=${newsLinks} pagePub=${pub}`);
  }catch(e){console.log(`::notice title=${id}::ERROR ${e.message}`)}
}

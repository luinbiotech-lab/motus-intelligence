import {writeFileSync} from 'node:fs';
const checks=[
 ['https://aws.amazon.com/about-aws/whats-new/2026/10/bedrock-web-search-domain-user-location/',['OpenAI','Bedrock','web search']],
 ['https://blogs.nvidia.com/blog/kazakhstan-ai-compute-ecosystem/',['Vera Rubin','Kazakhstan','published','datePublished']],
 ['https://blogs.microsoft.com/on-the-issues/2026/10/22/expanding-ai-literacy-with-the-american-library-association-and-community-based-programs/',['Public Library Association','United States','U.S.','America','datePublished']],
];
const out=[];
for(const [url,terms] of checks){
  const r=await fetch(url,{headers:{'user-agent':'MOTUS-Internal-Collector/1.0'}});const html=await r.text();
  const text=html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  const meta=(html.match(/(article:published_time|datePublished)["'][^>]{0,120}/gi)||[]).slice(0,3);
  out.push({url,status:r.status,finalUrl:r.url,meta,hits:terms.map(t=>({t,ctx:[...text.matchAll(new RegExp('.{0,160}'+t.replace(/[.]/g,'\\.')+'.{0,160}','g'))].slice(0,3).map(m=>m[0])}))});
}
writeFileSync('qa/out/src.json',JSON.stringify(out,null,2));

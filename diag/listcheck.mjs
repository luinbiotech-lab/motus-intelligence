import fs from 'node:fs';
const j=await (await fetch('https://motusnova.blogspot.com/feeds/posts/default?alt=json&max-results=4',{headers:{'user-agent':'Mozilla/5.0'}})).json();
const out=j.feed.entry.map(e=>'# '+e.title.$t+'\n'+e.published.$t+'\n'+e.content.$t.replace(/<style[\s\S]*?<\/style>/g,'').replace(/<svg[\s\S]*?<\/svg>/g,'[차트]').replace(/<(h[1-4])[^>]*>/g,'\n## ').replace(/<\/(p|li|h[1-4]|div|tr)>/g,'\n').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&#8230;/g,'…').replace(/[ \t]+/g,' ').replace(/\n\s*\n+/g,'\n'));
fs.mkdirSync('out',{recursive:true});fs.writeFileSync('out/posts.txt',out.join('\n\n==========\n\n'));

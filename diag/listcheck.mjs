import {writeFileSync,mkdirSync} from 'node:fs';
mkdirSync('out',{recursive:true});
const html=await (await fetch('https://motusnova.blogspot.com/',{headers:{'user-agent':'MOTUS-Label-Check/1.0'}})).text();
const labels=[...html.matchAll(/\/search\/label\/([^"'?#&<]+)/gi)].map(m=>decodeURIComponent(m[1].replace(/\+/g,' ')));
const feed=await (await fetch('https://motusnova.blogspot.com/feeds/posts/summary?alt=json&max-results=80')).json();
const cats={};for(const e of feed.feed.entry??[])for(const c of e.category??[])cats[c.term]=(cats[c.term]??0)+1;
writeFileSync('out/labels.json',JSON.stringify({menuLabels:[...new Set(labels)],postLabelCounts:cats,blogCategories:(feed.feed.category??[]).map(c=>c.term)},null,2));

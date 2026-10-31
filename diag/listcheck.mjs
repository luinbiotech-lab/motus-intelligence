import fs from 'node:fs';
const r=await fetch('https://motusnova.blogspot.com/2026/10/286-10-3.html?m=1&t='+Date.now(),{headers:{'user-agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'}});
const h=await r.text();
const t=(h.match(/<title>([\s\S]*?)<\/title>/)||[])[1];
const body=h.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<style[\s\S]*?<\/style>/g,'').replace(/<svg[\s\S]*?<\/svg>/g,'[차트]').replace(/<(h[1-4])[^>]*>/g,'\n## ').replace(/<\/(p|li|h[1-4]|div)>/g,'\n').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&#8230;/g,'…').replace(/[ \t]+/g,' ').replace(/\n\s*\n+/g,'\n');
fs.mkdirSync('out',{recursive:true});fs.writeFileSync('out/probe.txt',[r.status,t,body.includes('인텔(INTC)'),body.includes('업종과 종목'),body.slice(body.indexOf('MOTUS |'),body.indexOf('MOTUS |')+1500)].join('\n'));

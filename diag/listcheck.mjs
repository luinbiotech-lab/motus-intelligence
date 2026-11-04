import {writeFileSync,mkdirSync} from 'node:fs';
mkdirSync('out',{recursive:true});
const raw=p=>`https://raw.githubusercontent.com/luinbiotech-lab/motus-intelligence/ops-data/${p}`;
const article=h=>h.match(/<article\b[^>]*>[\s\S]*<\/article>/i)?.[0]??h;
const canonical=h=>h.replaceAll('&amp;','&').replaceAll('&quot;','"').replace(/>\s+</g,'><').replace(/\s+/g,' ').trim();
const strip=h=>h.replace(/<section data-section="daily-pdf"[\s\S]*?<\/section>/g,'');
const out={};
for(const [d,c] of [['2026-11-04','korea'],['2026-11-04','us'],['2026-11-04','ai'],['2026-10-30','us'],['2026-10-30','korea']]){
  const ledger=await (await fetch(raw(`data/operations/${d}/${c}/publish-ledger.jsonl`))).text();
  const pub=ledger.split('\n').filter(Boolean).map(l=>{try{return JSON.parse(l)}catch{return {}}}).filter(e=>e.event==='PUBLISHED'||e.event==='REPUBLISHED').at(-1);
  const page=await (await fetch(pub.publicPostUrl)).text();
  const pa=canonical(strip(article(page)));
  const r={url:pub.publicPostUrl,pageArticleLen:pa.length};
  for(const f of ['published-unit.json','live-unit.json']){const res=await fetch(raw(`data/operations/${d}/${c}/${f}`));if(!res.ok){r[f]='absent';continue}const u=await res.json();const ua=canonical(article(u.render?.html??''));
    let i=0;while(i<Math.min(ua.length,pa.length)&&ua[i]===pa[i])i++;
    r[f]={equal:ua===pa,len:ua.length,firstDiff:i,unitAt:ua.slice(i,i+80),pageAt:pa.slice(i,i+80)}}
  out[`${d}/${c}`]=r;
}
writeFileSync('out/match.json',JSON.stringify(out,null,2));

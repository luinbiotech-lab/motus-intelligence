/**
 * MOTUS daily briefing web app (owner 2026-11-16: "요약문을 앱으로" → installable web app first, cost 0).
 * Static pages built from the evening Naver summaries (data/daily-report/<op date>/naver-evening.md): one page per
 * session day, a latest page, an archive, a web app manifest and a small offline service worker. Pages are plain HTML
 * so search engines can index them; every item links to the full MOTUS article.
 */
export interface BriefingItem {heading:string;lines:string[];articleUrl:string|null}
export interface BriefingDay {sessionDate:string;operationDate:string;title:string;tags:string[];imageUrl:string|null;intro:string;items:BriefingItem[];disclaimer:string}

const esc=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/** Parses the evening summary markdown that naver-summary.ts writes (title, tags, image and the copied body block). */
export function parseEveningMarkdown(markdown:string,operationDate:string):BriefingDay{
  const title=markdown.match(/\*\*제목\*\* \(복사\)\s*\n\s*\n([^\n]+)/)?.[1]?.trim()??'';
  const tags=(markdown.match(/\*\*태그\*\* \(복사\)\s*\n\s*\n([^\n]+)/)?.[1]??'').split(/\s+/).filter(tag=>tag.startsWith('#')).map(tag=>tag.slice(1));
  const imageUrl=markdown.match(/\*\*대표 이미지\*\*[^:]*:\s*(https:\/\/\S+)/)?.[1]??null;
  const body=markdown.match(/```text\n([\s\S]*?)```/)?.[1]??'';
  if(!title||!body)throw new Error('BRIEFING_SUMMARY_UNPARSEABLE:'+operationDate);
  const blocks=body.trim().split(/\n\s*\n/).map(block=>block.trim()).filter(Boolean);
  const intro=blocks.find(block=>!/^\d+\.\s/.test(block)&&!block.startsWith('※'))??'';
  const disclaimer=blocks.find(block=>block.startsWith('※'))?.replace(/^※\s*/,'')??'';
  const items=blocks.filter(block=>/^\d+\.\s/.test(block)).map(block=>{
    const [head,...rest]=block.split('\n').map(line=>line.trim());
    const link=rest.find(line=>line.startsWith('→'))?.match(/https:\/\/\S+/)?.[0]??null;
    return {heading:head!.replace(/^\d+\.\s*/,''),lines:rest.filter(line=>line.startsWith('·')).map(line=>line.replace(/^·\s*/,'')),articleUrl:link};
  });
  const month=Number(title.match(/^(\d{1,2})월/)?.[1]),day=Number(title.match(/^\d{1,2}월\s*(\d{1,2})일/)?.[1]);
  let year=Number(operationDate.slice(0,4));if(month===12&&operationDate.slice(5,7)==='01')year-=1;
  const sessionDate=month&&day?`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`:operationDate;
  return {sessionDate,operationDate,title,tags,imageUrl,intro,items,disclaimer};
}

const SITE_NAME='MOTUS 증시 브리핑';
function shell(input:{title:string;description:string;canonical:string;base:string;body:string;image?:string|null}):string{
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(input.title)}</title>
<meta name="description" content="${esc(input.description)}">
<link rel="canonical" href="${esc(input.canonical)}">
<meta property="og:type" content="article"><meta property="og:title" content="${esc(input.title)}"><meta property="og:description" content="${esc(input.description)}">${input.image?`<meta property="og:image" content="${esc(input.image)}">`:''}
<meta name="theme-color" content="#0f3d5e">
<link rel="manifest" href="${input.base}manifest.webmanifest">
<link rel="icon" href="${input.base}icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${input.base}icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="MOTUS 브리핑">
<style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#16202a;--muted:#5b6672;--line:#e3e7ec;--accent:#0f3d5e;--up:#c62828;--down:#1565c0}
@media (prefers-color-scheme:dark){:root{--bg:#0e1419;--card:#151d24;--ink:#e8edf2;--muted:#9aa7b3;--line:#24303a;--accent:#7fb8e0}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif}
header{background:var(--accent);color:#fff;padding:14px 16px calc(14px);position:sticky;top:0;z-index:2}
header a{color:#fff;text-decoration:none}header .brand{font-weight:700;letter-spacing:.02em}header nav{float:right;font-size:14px}header nav a{margin-left:14px;opacity:.9}
main{max-width:720px;margin:0 auto;padding:16px}
h1{font-size:21px;line-height:1.4;margin:6px 0 4px}.date{color:var(--muted);font-size:14px}
.intro{color:var(--muted);font-size:15px;margin:10px 0 14px}
.hero{width:100%;border-radius:12px;display:block;margin:8px 0 14px;aspect-ratio:1200/630;object-fit:cover;background:var(--line)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:0 0 12px}
.card h2{font-size:17px;margin:0 0 8px;line-height:1.45}.card ul{margin:0;padding-left:18px}.card li{margin:4px 0}
.more{display:inline-block;margin-top:10px;font-weight:600;color:var(--accent);text-decoration:none}
.tags{color:var(--muted);font-size:13px;margin:6px 0 16px}.note{color:var(--muted);font-size:13px;border-top:1px solid var(--line);padding-top:12px;margin-top:18px}
.list a{display:block;padding:12px 0;border-bottom:1px solid var(--line);color:var(--ink);text-decoration:none}.list small{color:var(--muted);display:block}
.install{display:none;background:var(--card);border:1px dashed var(--line);border-radius:12px;padding:12px 14px;font-size:14px;margin:0 0 14px}
.pager{display:flex;justify-content:space-between;font-size:14px;margin:6px 0 0}.pager a{color:var(--accent);text-decoration:none}
</style>
</head>
<body>
<header><a class="brand" href="${input.base}">MOTUS 증시 브리핑</a><nav><a href="${input.base}">오늘</a><a href="${input.base}archive.html">지난 브리핑</a></nav></header>
<main>
<div class="install" id="install"><b>홈 화면에 추가</b>하면 앱처럼 열립니다. 아이폰: 공유 버튼 → '홈 화면에 추가'. 안드로이드: 메뉴 → '앱 설치' 또는 '홈 화면에 추가'.</div>
${input.body}
</main>
<script>
if('serviceWorker' in navigator)navigator.serviceWorker.register('${input.base}sw.js').catch(()=>{});
if(!(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)&&!navigator.standalone){var i=document.getElementById('install');if(i)i.style.display='block'}
</script>
</body>
</html>
`;
}

const color=(text:string)=>esc(text).replace(/([+-]\d[\d,]*(?:\.\d+)?%(?:p)?)/g,(match)=>`<span style="color:var(--${match.startsWith('-')?'down':'up'})">${match}</span>`);

export function dayPath(day:BriefingDay):string{return `d/${day.sessionDate}.html`}

export function renderDayPage(day:BriefingDay,origin:string,base:string,neighbours:{newer?:BriefingDay|null;older?:BriefingDay|null}={}):string{
  const description=day.items.map(item=>item.heading).join(' · ').slice(0,150);
  const items=day.items.map(item=>`<section class="card"><h2>${esc(item.heading)}</h2><ul>${item.lines.map(line=>`<li>${color(line)}</li>`).join('')}</ul>${item.articleUrl?`<a class="more" href="${esc(item.articleUrl)}">전체 분석 보기 →</a>`:''}</section>`).join('\n');
  const pager=`<div class="pager">${neighbours.older?`<a href="${base}${dayPath(neighbours.older)}">← ${esc(neighbours.older.sessionDate)}</a>`:'<span></span>'}${neighbours.newer?`<a href="${base}${dayPath(neighbours.newer)}">${esc(neighbours.newer.sessionDate)} →</a>`:'<span></span>'}</div>`;
  const body=`<div class="date">${esc(day.sessionDate)} 장 마감 기준</div><h1>${esc(day.title)}</h1>${day.imageUrl?`<img class="hero" src="${esc(day.imageUrl)}" alt="${esc(day.title)}" loading="lazy">`:''}<p class="intro">${esc(day.intro)}</p>\n${items}\n<div class="tags">${day.tags.map(tag=>'#'+esc(tag)).join(' ')}</div>${pager}<p class="note">${esc(day.disclaimer)}</p>`;
  return shell({title:`${day.title} | ${SITE_NAME}`,description,canonical:origin+dayPath(day),base,body,image:day.imageUrl});
}

export function renderArchive(days:BriefingDay[],origin:string,base:string):string{
  const body=`<h1>지난 브리핑</h1><div class="list">${days.map(day=>`<a href="${base}${dayPath(day)}"><small>${esc(day.sessionDate)}</small>${esc(day.title)}</a>`).join('')}</div>`;
  return shell({title:`지난 브리핑 | ${SITE_NAME}`,description:'MOTUS가 매일 장 마감 직후 정리한 국내·미국 증시와 AI 브리핑 목록',canonical:origin+'archive.html',base,body});
}

export function manifest(base:string):string{
  return JSON.stringify({name:SITE_NAME,short_name:'MOTUS 브리핑',description:'장 마감 직후 국내·미국 증시와 AI 흐름을 숫자로 정리한 하루 브리핑',lang:'ko',start_url:base,scope:base,display:'standalone',background_color:'#f6f7f9',theme_color:'#0f3d5e',icons:[{src:base+'icon-192.png',sizes:'192x192',type:'image/png'},{src:base+'icon-512.png',sizes:'512x512',type:'image/png'},{src:base+'icon-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]},null,2);
}

/** Network first for pages (the briefing changes daily), cache as the offline fallback. */
export function serviceWorker(version:string):string{
  return `const CACHE='motus-briefing-${version}';
self.addEventListener('install',e=>{self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
e.respondWith(fetch(r).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(r,copy));return res}).catch(()=>caches.match(r).then(m=>m||caches.match('./'))))});
`;
}

export const ICON_SVG='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#0f3d5e"/><path d="M96 352 L184 248 L256 304 L352 176 L416 224" fill="none" stroke="#fff" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"/><text x="256" y="452" font-family="Arial,Helvetica,sans-serif" font-size="88" font-weight="700" fill="#fff" text-anchor="middle">MOTUS</text></svg>';

export function sitemap(days:BriefingDay[],origin:string):string{
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${origin}</loc></url>\n<url><loc>${origin}archive.html</loc></url>\n${days.map(day=>`<url><loc>${origin}${dayPath(day)}</loc><lastmod>${day.sessionDate}</lastmod></url>`).join('\n')}\n</urlset>\n`;
}

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
function shell(input:{title:string;description:string;canonical:string;base:string;body:string;image?:string|null;pushEndpoint?:string|null}):string{
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
header{background:linear-gradient(135deg,#0b2545,#13406b);color:#fff;padding:14px 16px;position:sticky;top:0;z-index:2;box-shadow:0 2px 10px rgba(0,0,0,.12)}
header a{color:#fff;text-decoration:none}header .brand{font-weight:700;letter-spacing:.02em}header nav{float:right;font-size:14px}header nav a{margin-left:14px;opacity:.9}
main{max-width:720px;margin:0 auto;padding:16px}
h1{font-size:23px;line-height:1.38;margin:8px 0 6px;letter-spacing:-.02em}.date{display:inline-block;color:var(--accent);background:var(--card);border:1px solid var(--line);border-radius:999px;font-size:12.5px;font-weight:700;padding:3px 10px}
.intro{color:var(--muted);font-size:15px;margin:10px 0 14px}
.hero{width:100%;border-radius:12px;display:block;margin:8px 0 14px;aspect-ratio:1200/630;object-fit:cover;background:var(--line)}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px;margin:0 0 14px;box-shadow:0 1px 3px rgba(16,32,48,.06)}
.chip{display:inline-block;font-size:12px;font-weight:800;letter-spacing:.04em;border-radius:999px;padding:3px 10px;margin:0 0 8px;color:#fff;background:var(--accent)}.chip.k{background:#b3261e}.chip.u{background:#1f4e8c}.chip.a{background:#6b4fbb}
.card h2{font-size:18px;margin:0 0 10px;line-height:1.45;letter-spacing:-.01em}.card ul{margin:0;padding:0;list-style:none}.card li{margin:0;padding:7px 0 7px 14px;position:relative;border-top:1px solid var(--line);font-size:15.5px}.card li:first-child{border-top:0}.card li:before{content:"";position:absolute;left:0;top:17px;width:5px;height:5px;border-radius:50%;background:var(--muted)}.card li b{color:var(--accent)}
.more{display:inline-block;margin-top:10px;font-weight:600;color:var(--accent);text-decoration:none}
.tags{color:var(--muted);font-size:13px;margin:6px 0 16px}.note{color:var(--muted);font-size:13px;border-top:1px solid var(--line);padding-top:12px;margin-top:18px}
.list a{display:block;padding:12px 0;border-bottom:1px solid var(--line);color:var(--ink);text-decoration:none}.list small{color:var(--muted);display:block}
.alert{display:block;width:100%;margin:0 0 12px;padding:12px;border:0;border-radius:12px;background:var(--accent);color:#fff;font-size:15px;font-weight:700;line-height:1.45;white-space:normal}.alert[data-state=info]{background:#fff7e6;color:#7a4b00;border:1px solid #f0c36d;font-weight:600;text-align:left}.alert[data-state=ok]{background:#e8f6ee;color:#11633a;border:1px solid #9bd3b2}.install{display:none;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px;font-size:13.5px;color:var(--muted);margin:16px 0 0}.install b{color:var(--ink)}
.pager{display:flex;justify-content:space-between;font-size:14px;margin:6px 0 0}.pager a{color:var(--accent);text-decoration:none}
</style>
</head>
<body>
<header><a class="brand" href="${input.base}">MOTUS 증시 브리핑</a><nav><a href="${input.base}">오늘</a><a href="${input.base}archive.html">지난 브리핑</a></nav></header>
<main>
${input.pushEndpoint?`<button class="alert" id="alert" hidden>매일 저녁 브리핑 알림 받기</button>`:''}
${input.body}
<div class="install" id="install"><b>홈 화면에 추가</b>하면 앱처럼 열립니다. 아이폰: 공유 버튼 → '홈 화면에 추가'. 안드로이드: 메뉴 → '앱 설치' 또는 '홈 화면에 추가'.</div>
</main>
<script>
if('serviceWorker' in navigator)navigator.serviceWorker.register('${input.base}sw.js').catch(()=>{});
if(!(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)&&!navigator.standalone){var i=document.getElementById('install');if(i)i.style.display='block'}${input.pushEndpoint?`
var P='${input.pushEndpoint}',A=document.getElementById('alert');
function k(s){s=s.replace(/-/g,'+').replace(/_/g,'/');var b=atob(s+'==='.slice((s.length+3)%4)),o=new Uint8Array(b.length);for(var j=0;j<b.length;j++)o[j]=b.charCodeAt(j);return o}
var S=window.matchMedia&&matchMedia('(display-mode: standalone)').matches||navigator.standalone===true,IOS=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
function say(t,ok){A.textContent=t;A.setAttribute('data-state',ok?'ok':'info')}
if(A&&IOS&&!S){A.hidden=false;A.onclick=function(){say('아이폰은 홈 화면 앱에서만 알림을 받을 수 있습니다. 공유 버튼 → “홈 화면에 추가” → 홈 화면의 MOTUS 아이콘으로 열고 다시 눌러 주세요.')}}
else if(A&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window){navigator.serviceWorker.ready.then(function(reg){return reg.pushManager.getSubscription()}).then(function(s){A.hidden=false;if(s)say('알림 신청 완료 — 매일 저녁 보내 드립니다',1)}).catch(function(){A.hidden=false});
if(Notification.permission==='denied'){A.hidden=false;A.onclick=function(){say('알림이 꺼져 있습니다. 휴대폰 설정 → 알림 → MOTUS(또는 브라우저)에서 허용한 뒤 다시 눌러 주세요.')};}
else A.onclick=function(){if(A.disabled)return;A.disabled=true;var step='권한',t=setTimeout(function(){A.disabled=false;say('응답이 없습니다('+step+' 단계). 화면을 새로고침한 뒤 다시 눌러 주세요.')},20000);
function fail(){clearTimeout(t);A.disabled=false;say(step==='권한'?'알림을 허용하지 않으셨습니다. 다시 누르고 “허용”을 눌러 주세요.':'알림 신청 실패('+step+' 단계) — 다시 눌러 주세요.')}
say('알림 허용 창을 띄우는 중…');Notification.requestPermission().then(function(p){if(p!=='granted')throw 0;step='서버 연결';say('알림 신청 중…');return Promise.all([navigator.serviceWorker.ready,fetch(P+'vapid-public-key').then(function(r){if(!r.ok)throw 0;return r.text()})])}).then(function(v){step='구독';return v[0].pushManager.subscribe({userVisibleOnly:true,applicationServerKey:k(v[1].trim())})}).then(function(s){step='등록';return fetch(P+'subscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(s)})}).then(function(r){if(!r.ok)throw 0;clearTimeout(t);say('알림 신청 완료 — 매일 저녁 보내 드립니다',1)}).catch(fail)}}`:''}
</script>
</body>
</html>
`;
}

const color=(text:string)=>esc(text).replace(/([+-]\d[\d,]*(?:\.\d+)?%(?:p)?)/g,(match)=>`<span style="color:var(--${match.startsWith('-')?'down':'up'})">${match}</span>`);

export function dayPath(day:BriefingDay):string{return `d/${day.sessionDate}.html`}

export function renderDayPage(day:BriefingDay,origin:string,base:string,neighbours:{newer?:BriefingDay|null;older?:BriefingDay|null}={},pushEndpoint:string|null=null):string{
  const description=day.items.map(item=>item.heading).join(' · ').slice(0,150);
  // 2026-11-18 owner (design first): each card leads with a coloured category chip, then the headline.
  const chipOf=(heading:string)=>{const [head,...rest]=heading.split(' — ');const kind=/국내/.test(head!)?'k':/뉴욕|미국/.test(head!)?'u':/AI/.test(head!)?'a':'';return rest.length?`<span class="chip ${kind}">${esc(head!)}</span><h2>${esc(rest.join(' — '))}</h2>`:`<h2>${esc(heading)}</h2>`};
  const items=day.items.map(item=>`<section class="card">${chipOf(item.heading)}<ul>${item.lines.map(line=>`<li>${color(line).replace(/^(MOTUS 정리|증권가 공통 시각|다음에 볼 것|공식 발표):/,'<b>$1</b>:')}</li>`).join('')}</ul>${item.articleUrl?`<a class="more" href="${esc(item.articleUrl)}">전체 분석 보기 →</a>`:''}</section>`).join('\n');
  const pager=`<div class="pager">${neighbours.older?`<a href="${base}${dayPath(neighbours.older)}">← ${esc(neighbours.older.sessionDate)}</a>`:'<span></span>'}${neighbours.newer?`<a href="${base}${dayPath(neighbours.newer)}">${esc(neighbours.newer.sessionDate)} →</a>`:'<span></span>'}</div>`;
  const body=`<div class="date">${esc(day.sessionDate)} 장 마감 기준</div><h1>${esc(day.title)}</h1>${day.imageUrl?`<img class="hero" src="${esc(day.imageUrl)}" alt="${esc(day.title)}" loading="lazy">`:''}<p class="intro">${esc(day.intro)}</p>\n${items}\n<div class="tags">${day.tags.map(tag=>'#'+esc(tag)).join(' ')}</div>${pager}<p class="note">${esc(day.disclaimer)}</p>`;
  return shell({title:`${day.title} | ${SITE_NAME}`,description,canonical:origin+dayPath(day),base,body,image:day.imageUrl,pushEndpoint});
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
self.addEventListener('push',e=>{let d={};try{d=e.data?e.data.json():{}}catch(_){}e.waitUntil(self.registration.showNotification(d.title||'MOTUS 증시 브리핑',{body:d.body||'오늘 장 마감 브리핑이 올라왔습니다.',icon:'icon-192.png',badge:'icon-192.png',data:{url:d.url||'./'}}))});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.openWindow((e.notification.data&&e.notification.data.url)||'./'))});
`;
}

export const ICON_SVG='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#0f3d5e"/><path d="M96 352 L184 248 L256 304 L352 176 L416 224" fill="none" stroke="#fff" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"/><text x="256" y="452" font-family="Arial,Helvetica,sans-serif" font-size="88" font-weight="700" fill="#fff" text-anchor="middle">MOTUS</text></svg>';

export function sitemap(days:BriefingDay[],origin:string):string{
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${origin}</loc></url>\n<url><loc>${origin}archive.html</loc></url>\n${days.map(day=>`<url><loc>${origin}${dayPath(day)}</loc><lastmod>${day.sessionDate}</lastmod></url>`).join('\n')}\n</urlset>\n`;
}

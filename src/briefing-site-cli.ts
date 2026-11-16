/**
 * Builds the MOTUS briefing web app (owner 2026-11-16) from the evening summaries.
 * Usage: node dist/src/briefing-site-cli.js --out site --origin https://example.github.io/motus-intelligence/
 * Reads data/daily-report/<op date>/naver-evening.md only; writes static files; no network or blog calls.
 */
import {existsSync,readdirSync} from 'node:fs';
import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {ICON_SVG,dayPath,manifest,parseEveningMarkdown,renderArchive,renderDayPage,serviceWorker,sitemap,type BriefingDay} from './reports/briefing-site.js';

const args=process.argv.slice(2),value=(flag:string)=>{const index=args.indexOf(flag);return index>=0?args[index+1]:undefined};
const out=value('--out')??'site',origin=(value('--origin')??'').replace(/\/?$/,'/');
if(!/^https:\/\//.test(origin))throw new Error('--origin https://… required');
const base=new URL(origin).pathname;
const root=join('data','daily-report'),byDate=new Map<string,BriefingDay>();
for(const op of (existsSync(root)?readdirSync(root):[]).filter(name=>/^\d{4}-\d{2}-\d{2}$/.test(name)).sort()){
  const path=join(root,op,'naver-evening.md');if(!existsSync(path))continue;
  try{const day=parseEveningMarkdown(await readFile(path,'utf8'),op);byDate.set(day.sessionDate,day)}catch(error){console.error('SKIP '+op+' '+String(error))}
}
const days=[...byDate.values()].sort((a,b)=>b.sessionDate.localeCompare(a.sessionDate));
if(!days.length)throw new Error('BRIEFING_NO_SUMMARY');
await mkdir(join(out,'d'),{recursive:true});
for(const [index,day] of days.entries())await writeFile(join(out,dayPath(day)),renderDayPage(day,origin,base,{newer:days[index-1]??null,older:days[index+1]??null}),'utf8');
await writeFile(join(out,'index.html'),renderDayPage(days[0]!,origin,base,{older:days[1]??null}),'utf8');
await writeFile(join(out,'archive.html'),renderArchive(days,origin,base),'utf8');
await writeFile(join(out,'manifest.webmanifest'),manifest(base),'utf8');
await writeFile(join(out,'sw.js'),serviceWorker(days[0]!.sessionDate),'utf8');
await writeFile(join(out,'icon.svg'),ICON_SVG,'utf8');
await writeFile(join(out,'sitemap.xml'),sitemap(days,origin),'utf8');
await writeFile(join(out,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${origin}sitemap.xml\n`,'utf8');
for(const size of [180,192,512])await copyFile(join('assets','briefing',`icon-${size}.png`),join(out,`icon-${size}.png`));
console.log(`BRIEFING_SITE ${days.length} days, latest ${days[0]!.sessionDate} → ${out}`);

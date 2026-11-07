/**
 * Representative image for each article (owner 2026-11-07, traffic review: posts had no image, so search results,
 * feeds and share previews showed none). A 1200x630 card is drawn from facts the article itself carries (label,
 * date, title, the session's largest charted moves), rendered to PNG with headless Chromium and stored next to the
 * unit in ops-data, which the persist job pushes; the article links it from the public repository.
 *
 * Off unless MOTUS_HERO_IMAGE=on (production workflow only). Any failure (no Chromium, no Korean font, render error)
 * returns null and the article is published without an image, never with a broken one built from guesses.
 */
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {koreanFontInstalled} from '../reports/pdf-render.js';

export const HERO_WIDTH=1200,HERO_HEIGHT=630;
export const HERO_BASE_URL='https://raw.githubusercontent.com/luinbiotech-lab/motus-intelligence/ops-data/';
export type HeroCategory='us'|'korea'|'ai';
/** issueDate is shown on the card; storeDate is the operation date whose ops-data folder holds the file. */
export interface HeroInput {category:HeroCategory;issueDate:string;storeDate:string;title:string;moves:Array<{label:string;value:number}>}
export const HERO_LABEL:Record<HeroCategory,string>={us:'미국증시',korea:'국내증시',ai:'AI 인텔리전스'};
export interface HeroImage {url:string;alt:string;width:number;height:number}

const esc=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const dateKo=(iso:string)=>`${Number(iso.slice(0,4))}년 ${Number(iso.slice(5,7))}월 ${Number(iso.slice(8,10))}일`;
const pct=(value:number)=>`${value>0?'+':value<0?'−':''}${Math.abs(value).toFixed(2)}%`;
const ACCENT:Record<HeroCategory,string>={us:'#5fa8ff',korea:'#ff8a65',ai:'#b39dff'};

/** The largest moves among the article's charted rows (at most three, biggest absolute change first). */
export function heroMoves(rows:Array<{label:string;value:number}>|undefined):Array<{label:string;value:number}> {
  return (rows??[]).filter(row=>Number.isFinite(row.value)).sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)).slice(0,3);
}

/** Self-contained card markup. Deterministic: the same input always yields the same bytes of HTML. */
export function heroCardHtml(input:HeroInput):string {
  const accent=ACCENT[input.category],titleSize=input.title.length>34?52:input.title.length>24?60:68;
  const tiles=input.moves.map(move=>`<div class="tile"><div class="tl">${esc(move.label.length>14?move.label.slice(0,13)+'…':move.label)}</div><div class="tv" style="color:${move.value>0?'#ff6b6b':move.value<0?'#6aa8ff':'#c7d2de'}">${pct(move.value)}</div></div>`).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}html,body{width:${HERO_WIDTH}px;height:${HERO_HEIGHT}px}
body{font-family:'Noto Sans CJK KR','Noto Sans KR',sans-serif;background:#03162e;color:#fff;padding:56px 64px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden}
body:before{content:"";position:absolute;left:0;top:0;bottom:0;width:14px;background:${accent}}
.top{display:flex;justify-content:space-between;align-items:center;font-size:24px;font-weight:700;color:#c7d8ea;letter-spacing:.02em}
.brand{font-size:30px;font-weight:900;color:#fff;letter-spacing:.06em}.brand span{color:${accent}}
.label{display:inline-block;padding:6px 16px;border:2px solid ${accent};color:${accent};font-size:24px;font-weight:800;margin-bottom:22px}
h1{font-size:${titleSize}px;line-height:1.28;font-weight:900;letter-spacing:-.02em;word-break:keep-all;overflow-wrap:anywhere;max-height:${titleSize*1.28*3}px;overflow:hidden}
.tiles{display:flex;gap:18px}.tile{flex:1;background:rgba(255,255,255,.07);border-top:3px solid ${accent};padding:16px 20px}
.tl{font-size:22px;color:#c7d8ea;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tv{font-size:40px;font-weight:900;margin-top:4px}
</style></head><body><div class="top"><div class="brand">MOTUS <span>·</span> What Moves the World</div><div>${esc(dateKo(input.issueDate))}</div></div>
<div><div class="label">${esc(HERO_LABEL[input.category])}</div><h1>${esc(input.title)}</h1></div>
<div class="tiles">${tiles}</div></body></html>`;
}

export function heroFileName(input:HeroInput):string {
  return `hero-${createHash('sha256').update(heroCardHtml(input)).digest('hex').slice(0,12)}.png`;
}

type Browser={newPage:(options:Record<string,unknown>)=>Promise<{setContent:(html:string,options:{waitUntil:string})=>Promise<void>;screenshot:(options:Record<string,unknown>)=>Promise<Uint8Array>}>;close:()=>Promise<void>};
/** PNG bytes of the card, or null when no headless Chromium or Korean font is available. */
export async function renderHeroPng(html:string):Promise<Uint8Array|null> {
  if(!koreanFontInstalled())return null;
  let chromium:{launch:()=>Promise<Browser>};
  try{chromium=((await import('playwright-core' as string)) as {chromium:typeof chromium}).chromium}catch{try{chromium=((await import('playwright' as string)) as {chromium:typeof chromium}).chromium}catch{return null}}
  const browser=await chromium.launch();
  try{const page=await browser.newPage({viewport:{width:HERO_WIDTH,height:HERO_HEIGHT},deviceScaleFactor:1});await page.setContent(html,{waitUntil:'load'});return await page.screenshot({type:'png',clip:{x:0,y:0,width:HERO_WIDTH,height:HERO_HEIGHT}})}
  finally{await browser.close()}
}

/** PNG signature and size check (a 1200x630 card is never a few hundred bytes). */
export function validHeroPng(bytes:Uint8Array):boolean {
  return bytes.length>8000&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47;
}

/**
 * Renders and stores the card under data/operations/<date>/<category>/ and returns how the article links it, or
 * null (feature off, renderer unavailable, render failure). Never throws.
 */
export async function prepareHeroImage(input:HeroInput,options:{root?:string;enabled?:boolean;render?:(html:string)=>Promise<Uint8Array|null>}={}):Promise<HeroImage|null> {
  if(!(options.enabled??process.env.MOTUS_HERO_IMAGE==='on'))return null;
  try{
    const html=heroCardHtml(input),bytes=await (options.render??renderHeroPng)(html);
    if(!bytes||!validHeroPng(bytes)){console.log('::warning title=Hero image::not rendered; article goes out without an image');return null}
    const rel=join('data','operations',input.storeDate,input.category,heroFileName(input));
    await mkdir(join(options.root??process.cwd(),'data','operations',input.storeDate,input.category),{recursive:true});
    await writeFile(join(options.root??process.cwd(),rel),bytes);
    return {url:HERO_BASE_URL+rel.split(/[\\/]/).join('/'),alt:`${HERO_LABEL[input.category]} ${dateKo(input.issueDate)}: ${input.title}`,width:HERO_WIDTH,height:HERO_HEIGHT};
  }catch(error){console.log(`::warning title=Hero image::${String(error instanceof Error?error.message:error).slice(0,200)}`);return null}
}

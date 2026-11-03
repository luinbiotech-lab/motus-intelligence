/**
 * HTML → A4 PDF with headless Chromium. Playwright is installed only in the workflow that renders reports
 * (`npm install --no-save playwright-core` + `npx playwright-core install --with-deps chromium`), so it is loaded
 * dynamically and the rest of the codebase does not depend on it.
 */
import {execFileSync} from 'node:child_process';
export function koreanFontInstalled():boolean {try{return /Noto Sans CJK/i.test(execFileSync('fc-list',[':lang=ko','family'],{encoding:'utf8'}))}catch{return false}}
export async function renderPdf(html:string):Promise<Uint8Array> {
  const load=async(name:string)=>(await import(name)) as {chromium:{launch:()=>Promise<{newPage:()=>Promise<{setContent:(html:string,options:{waitUntil:string})=>Promise<void>;pdf:(options:Record<string,unknown>)=>Promise<Uint8Array>;}>;close:()=>Promise<void>}>}};
  let playwright;try{playwright=await load('playwright-core')}catch{playwright=await load('playwright')}
  // Korean glyphs must come from an installed CJK font, never tofu boxes (document.fonts.check cannot tell for system fonts).
  if(!koreanFontInstalled())throw new Error('PDF_KOREAN_FONT_MISSING: install fonts-noto-cjk');
  const browser=await playwright.chromium.launch();
  try{
    const page=await browser.newPage();await page.setContent(html,{waitUntil:'load'});
    return await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true});
  }finally{await browser.close()}
}
/** Basic structural check of a rendered PDF: signature, size and page count. */
export function checkPdf(bytes:Uint8Array,expectedPages:number):{ok:boolean;pages:number;size:number} {
  const text=new TextDecoder('latin1').decode(bytes),pages=(text.match(/\/Type\s*\/Page[^s]/g)??[]).length;
  return {ok:text.startsWith('%PDF-')&&bytes.length>20000&&pages===expectedPages,pages,size:bytes.length};
}

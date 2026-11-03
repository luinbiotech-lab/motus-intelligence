/**
 * HTML → A4 PDF with headless Chromium. Playwright is installed only in the workflow that renders reports
 * (`npm install --no-save playwright-core` + `npx playwright-core install --with-deps chromium`), so it is loaded
 * dynamically and the rest of the codebase does not depend on it.
 */
export async function renderPdf(html:string):Promise<Uint8Array> {
  const load=async(name:string)=>(await import(name)) as {chromium:{launch:()=>Promise<{newPage:()=>Promise<{setContent:(html:string,options:{waitUntil:string})=>Promise<void>;pdf:(options:Record<string,unknown>)=>Promise<Uint8Array>;evaluate:<T>(fn:()=>T)=>Promise<T>}>;close:()=>Promise<void>}>}};
  let playwright;try{playwright=await load('playwright-core')}catch{playwright=await load('playwright')}
  const browser=await playwright.chromium.launch();
  try{
    const page=await browser.newPage();await page.setContent(html,{waitUntil:'load'});
    // Korean glyphs must come from a real font, never tofu boxes: the page reports whether the CJK font loaded.
    const fontOk=await page.evaluate(()=>document.fonts.check('12px "Noto Sans CJK KR"'));
    if(!fontOk)throw new Error('PDF_KOREAN_FONT_MISSING: install fonts-noto-cjk');
    return await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true});
  }finally{await browser.close()}
}
/** Basic structural check of a rendered PDF: signature, size and page count. */
export function checkPdf(bytes:Uint8Array,expectedPages:number):{ok:boolean;pages:number;size:number} {
  const text=new TextDecoder('latin1').decode(bytes),pages=(text.match(/\/Type\s*\/Page[^s]/g)??[]).length;
  return {ok:text.startsWith('%PDF-')&&bytes.length>20000&&pages===expectedPages,pages,size:bytes.length};
}

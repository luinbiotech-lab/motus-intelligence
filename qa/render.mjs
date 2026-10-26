import {chromium} from 'playwright';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
mkdirSync('qa/out',{recursive:true});
const urls=readFileSync('qa/urls.txt','utf8').split('\n').map(s=>s.trim()).filter(s=>s.startsWith('http'));
const browser=await chromium.launch();
for(const [i,url] of urls.entries()){
  for(const [name,vp,mobile] of [['mobile',{width:390,height:844},true],['desktop',{width:1366,height:900},false]]){
    const ctx=await browser.newContext({viewport:vp,isMobile:mobile,deviceScaleFactor:mobile?2:1,userAgent:mobile?'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1':undefined});
    const page=await ctx.newPage();const resp=await page.goto(url,{waitUntil:'networkidle',timeout:60000});
    await page.screenshot({path:`qa/out/${i}-${name}.png`,fullPage:true});
    if(name==='mobile'){
      const info=await page.evaluate(()=>{const post=document.querySelector('.post-body')||document.querySelector('article')||document.body;return {title:document.title,h:[...document.querySelectorAll('h1,h2,h3,h4')].map(e=>e.tagName+': '+e.innerText.trim()),overflowX:document.documentElement.scrollWidth>window.innerWidth,scrollWidth:document.documentElement.scrollWidth,text:post.innerText,links:[...post.querySelectorAll('a')].map(a=>a.innerText.trim()+' -> '+a.href),wideEls:[...post.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>window.innerWidth+1).slice(0,10).map(e=>e.tagName+'.'+e.className)}});
      writeFileSync(`qa/out/${i}.json`,JSON.stringify({url,status:resp?.status(),...info},null,2));
    }
    await ctx.close();
  }
}
await browser.close();

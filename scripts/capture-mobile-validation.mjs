import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';

const url=process.argv[2];
const output=resolve(process.argv[3]??'artifacts/mobile-validation');
if(!url)throw new Error('usage: node scripts/capture-mobile-validation.mjs <url> [output]');
const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile=join(output,'chrome-profile');
const port=9331;
await mkdir(output,{recursive:true});
const child=spawn(chrome,[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1','--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
try{
  await waitForChrome(port);
  const target=await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`,{method:'PUT'}).then(response=>response.json());
  const cdp=await connect(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  const results=[];
  for(const width of [320,360,375,390,430]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:1200,deviceScaleFactor:1,mobile:true,screenWidth:width,screenHeight:1200});
    const loaded=cdp.wait('Page.loadEventFired',15000);
    await cdp.send('Page.navigate',{url:`${url}${url.includes('?')?'&':'?'}mobileAudit=${width}`});
    await loaded;
    await new Promise(resolveDelay=>setTimeout(resolveDelay,700));
    const evaluation=await cdp.send('Runtime.evaluate',{returnByValue:true,expression:`(()=>{const article=document.querySelector('article[data-layout]')||document.querySelector('.post-body article')||document.querySelector('article');if(!article)return {article:false};const visible=[...article.querySelectorAll('*')].filter(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0});const overflowing=visible.filter(el=>{const r=el.getBoundingClientRect();return r.left<-1||r.right>innerWidth+1||el.scrollWidth>el.clientWidth+1}).map(el=>({tag:el.tagName,text:(el.textContent||'').trim().slice(0,50),left:Math.round(el.getBoundingClientRect().left),right:Math.round(el.getBoundingClientRect().right),clientWidth:el.clientWidth,scrollWidth:el.scrollWidth}));return {article:true,innerWidth,documentScrollWidth:document.documentElement.scrollWidth,bodyScrollWidth:document.body.scrollWidth,articleClientWidth:article.clientWidth,articleScrollWidth:article.scrollWidth,overflowing,sourceLinks:[...article.querySelectorAll('a[href]')].length,layout:article.getAttribute('data-layout'),commerce:/affiliate|commerce|제휴|광고/i.test(article.innerHTML),internal:/eventId|themeId|companyId|publicationId|verificationStatus|confidenceScore/i.test(article.innerHTML)};})()`});
    const metrics=evaluation.result.value;
    const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});
    await writeFile(join(output,`korea-${width}.png`),Buffer.from(shot.data,'base64'));
    results.push({width,...metrics,pass:Boolean(metrics.article&&metrics.documentScrollWidth<=metrics.innerWidth&&metrics.bodyScrollWidth<=metrics.innerWidth&&metrics.articleScrollWidth<=metrics.articleClientWidth+1&&metrics.overflowing.length===0&&metrics.sourceLinks>0&&!metrics.commerce&&!metrics.internal)});
  }
  await writeFile(join(output,'mobile-validation.json'),JSON.stringify({url,generatedAt:new Date().toISOString(),results},null,2));
  console.log(JSON.stringify(results,null,2));
  cdp.close();
}finally{child.kill();}

async function waitForChrome(port){for(let attempt=0;attempt<50;attempt++){try{const response=await fetch(`http://127.0.0.1:${port}/json/version`);if(response.ok)return;}catch{}await new Promise(resolveDelay=>setTimeout(resolveDelay,100));}throw new Error('Chrome DevTools endpoint unavailable');}
async function connect(webSocketUrl){const socket=new WebSocket(webSocketUrl);await new Promise((resolveOpen,reject)=>{socket.addEventListener('open',resolveOpen,{once:true});socket.addEventListener('error',reject,{once:true});});let id=0;const pending=new Map();const waiters=new Map();socket.addEventListener('message',event=>{const message=JSON.parse(String(event.data));if(message.id){const entry=pending.get(message.id);if(!entry)return;pending.delete(message.id);message.error?entry.reject(new Error(message.error.message)):entry.resolve(message.result);return;}const queue=waiters.get(message.method);if(queue?.length)queue.shift()(message.params);});return {send(method,params={}){const requestId=++id;socket.send(JSON.stringify({id:requestId,method,params}));return new Promise((resolveSend,reject)=>pending.set(requestId,{resolve:resolveSend,reject}));},wait(method,timeout){return new Promise((resolveEvent,reject)=>{const queue=waiters.get(method)??[];queue.push(resolveEvent);waiters.set(method,queue);setTimeout(()=>reject(new Error(`timeout waiting for ${method}`)),timeout);});},close(){socket.close();}};}

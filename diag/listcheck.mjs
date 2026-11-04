import {writeFileSync,mkdirSync} from 'node:fs';
mkdirSync('out',{recursive:true});
const h={'X-Naver-Client-Id':process.env.NAVER_DATALAB_CLIENT_ID,'X-Naver-Client-Secret':process.env.NAVER_DATALAB_CLIENT_SECRET};
const out={};
for(const [k,u] of Object.entries({blog:'https://openapi.naver.com/v1/search/blog.json?query='+encodeURIComponent('코스피 마감')+'&display=5&sort=sim',news:'https://openapi.naver.com/v1/search/news.json?query='+encodeURIComponent('코스피 마감')+'&display=3'})){
  const r=await fetch(u,{headers:h});const t=await r.text();out[k]={status:r.status,body:t.slice(0,1500)};
}
// can we fetch a naver blog post body from Actions?
try{const j=JSON.parse(out.blog.body);const link=j.items?.[0]?.link;if(link){const m=link.replace('://blog.naver.com','://m.blog.naver.com');const r=await fetch(m,{headers:{'user-agent':'Mozilla/5.0'}});const t=await r.text();out.post={url:m,status:r.status,len:t.length,hasBody:/se-main-container|postViewArea/.test(t),imgs:(t.match(/<img /g)||[]).length}}}catch(e){out.postErr=String(e)}
// blogger blog self
const b=await fetch('https://motusnova.blogspot.com/feeds/posts/summary?alt=json&max-results=3');out.self={status:b.status};
writeFileSync('out/naver.json',JSON.stringify(out,null,2));

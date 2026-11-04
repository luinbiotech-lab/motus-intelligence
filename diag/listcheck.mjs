import {writeFileSync,mkdirSync} from 'node:fs';
mkdirSync('out',{recursive:true});
const h={'X-NCP-APIGW-API-KEY-ID':(process.env.NAVER_DATALAB_CLIENT_ID??'').trim(),'X-NCP-APIGW-API-KEY':(process.env.NAVER_DATALAB_CLIENT_SECRET??'').trim()};
const out={};
const b=await fetch('https://naverapihub.apigw.ntruss.com/search/v1/blog?query='+encodeURIComponent('코스피 마감')+'&display=5&sort=sim',{headers:h});out.blog=b.status;out.blogBody=(await b.text()).slice(0,2500);
try{const link=JSON.parse(out.blogBody).items?.[0]?.link;if(link){const m=link.replace('://blog.naver.com','://m.blog.naver.com');const r=await fetch(m,{headers:{'user-agent':'Mozilla/5.0 (iPhone)'}});const t=await r.text();out.post={url:m,status:r.status,len:t.length,body:/se-main-container/.test(t),imgs:(t.match(/<img /g)||[]).length}}}catch(e){out.err=String(e)}
writeFileSync('out/naver4.json',JSON.stringify(out,null,2));

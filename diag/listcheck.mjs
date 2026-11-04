import {writeFileSync,mkdirSync} from 'node:fs';
mkdirSync('out',{recursive:true});
const h={'X-Naver-Client-Id':(process.env.NAVER_DATALAB_CLIENT_ID??'').trim(),'X-Naver-Client-Secret':(process.env.NAVER_DATALAB_CLIENT_SECRET??'').trim()};
const out={idLen:h['X-Naver-Client-Id'].length};
const d=await fetch('https://openapi.naver.com/v1/datalab/search',{method:'POST',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify({startDate:'2026-10-01',endDate:'2026-11-01',timeUnit:'week',keywordGroups:[{groupName:'코스피',keywords:['코스피']}]})});out.datalab=d.status;
const b=await fetch('https://openapi.naver.com/v1/search/blog.json?query='+encodeURIComponent('코스피 마감')+'&display=5',{headers:h});out.blog=b.status;out.blogBody=(await b.text()).slice(0,1200);
try{const j=JSON.parse(out.blogBody.length<1200?out.blogBody:'{}');}catch{}
writeFileSync('out/naver3.json',JSON.stringify(out,null,2));

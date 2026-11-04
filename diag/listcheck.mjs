import {writeFileSync,mkdirSync} from 'node:fs';
mkdirSync('out',{recursive:true});
const h={'X-Naver-Client-Id':process.env.NAVER_DATALAB_CLIENT_ID??'','X-Naver-Client-Secret':process.env.NAVER_DATALAB_CLIENT_SECRET??'','Content-Type':'application/json'};
const r=await fetch('https://openapi.naver.com/v1/datalab/search',{method:'POST',headers:h,body:JSON.stringify({startDate:'2026-10-01',endDate:'2026-11-01',timeUnit:'week',keywordGroups:[{groupName:'코스피',keywords:['코스피']}]})});
writeFileSync('out/naver2.json',JSON.stringify({idLen:(process.env.NAVER_DATALAB_CLIENT_ID??'').length,datalab:r.status,body:(await r.text()).slice(0,300)},null,2));

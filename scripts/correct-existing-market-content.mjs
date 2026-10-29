import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';

const blogId='3015267553244608361';
const targets={
  korea:{id:'310165270483019628',url:'https://motusnova.blogspot.com/2026/10/1q-sk.html',date:'2026-10-28',title:'국내증시 마감: 코스피 상승과 코스닥·수급 흐름 점검'},
  us:{id:'6139790651642929216',url:'https://motusnova.blogspot.com/2026/10/s-500.html',date:'2026-10-29',title:'S&P 500 상승, 나스닥과 함께 보는 미국증시'},
};
const target=targets[process.env.CORRECTION_TARGET];
const phase=process.argv[2];
const action=process.env.CORRECTION_ACTION;
if(!target||!['preview_content','apply_content'].includes(action)||!['prepare','apply'].includes(phase))throw Error('INVALID_CORRECTION_SCOPE');
if(process.env.BLOGGER_BLOG_ID!==blogId)throw Error('BLOG_ID_MISMATCH');
const hash=value=>createHash('sha256').update(value).digest('hex');
const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',redirect:'error',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:process.env.BLOGGER_CLIENT_ID,client_secret:process.env.BLOGGER_CLIENT_SECRET,refresh_token:process.env.BLOGGER_REFRESH_TOKEN}),signal:AbortSignal.timeout(15000)});
if(!tokenResponse.ok)throw Error('TOKEN_HTTP_'+tokenResponse.status);
const token=(await tokenResponse.json()).access_token;
if(!token)throw Error('TOKEN_MISSING');
const endpoint='https://www.googleapis.com/blogger/v3/blogs/'+blogId+'/posts/'+target.id;
const headers={authorization:'Bearer '+token};
async function getPost(){const r=await fetch(endpoint,{headers,redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('READ_HTTP_'+r.status);return r.json()}
function assertIdentity(post){
 if(String(post.id)!==target.id||post.url!==target.url||post.title!==target.title||!post.published?.startsWith(target.date+'T')||typeof post.content!=='string'||post.content.length<1000)throw Error('POST_IDENTITY_MISMATCH');
 if(post.status!=null&&post.status!=='LIVE')throw Error('POST_NOT_LIVE');
}
const post=await getPost();assertIdentity(post);
mkdirSync('correction-audit',{recursive:true});
if(phase==='prepare'){
 let content;
 if(process.env.CORRECTION_TARGET==='korea'){
   content=readFileSync('docs/operations/corrections/korea-close-20261028.html','utf8');
   for(const required of ['하나증권','이경수','이익 전망','6,012.44','771.28','1,341원','+11.24%'])if(!content.includes(required))throw Error('PROPOSAL_MISSING_'+required);
   if(/1Q SK/.test(content)||['17,037','7,677','9,131'].some(value=>content.includes(value)))throw Error('PROPOSAL_UNEXPECTED_PRODUCT_OR_FLOW');
 }else{
   const sentence='나스닥은 검증된 시장 사실과 검색 관심이 겹친 보조 주제로, 사실관계를 바꾸지 않는 범위에서 제목과 해설의 가시성을 높였다.';
   const pattern=/<p\b[^>]*>나스닥은 검증된 시장 사실과 검색 관심이 겹친 보조 주제로, 사실관계를 바꾸지 않는 범위에서 제목과 해설의 가시성을 높였다\.<\/p>/g;
   if(post.content.split(sentence).length!==2)throw Error('EXPECTED_EDITORIAL_NOTE_NOT_UNIQUE');
   content=post.content.replace(pattern,'');
   if(content===post.content)throw Error('EDITORIAL_NOTE_NOT_REMOVED');
 }
 writeFileSync('correction-audit/before.json',JSON.stringify(post,null,2));
 writeFileSync('correction-audit/proposed.html',content);
 const receipt={target:process.env.CORRECTION_TARGET,id:target.id,url:target.url,beforeHash:hash(post.content),proposedHash:hash(content),published:post.published,action,preparedAt:new Date().toISOString()};
 writeFileSync('correction-audit/preview.json',JSON.stringify(receipt,null,2));
 console.log(JSON.stringify(receipt));
 if(action==='apply_content'&&process.env.EXPECTED_CONTENT_HASH!==receipt.beforeHash)throw Error('EXPECTED_CONTENT_HASH_MISMATCH');
}else{
 if(action!=='apply_content')throw Error('APPLY_NOT_SELECTED');
 const before=JSON.parse(readFileSync('correction-audit/before.json','utf8'));
 const content=readFileSync('correction-audit/proposed.html','utf8');
 if(hash(post.content)!==process.env.EXPECTED_CONTENT_HASH||post.content!==before.content||post.updated!==before.updated||post.etag!==before.etag)throw Error('CONCURRENT_POST_CHANGE');
 const r=await fetch(endpoint,{method:'PATCH',redirect:'error',headers:{...headers,'content-type':'application/json',...(post.etag?{'if-match':post.etag}:{})},body:JSON.stringify({content}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('PATCH_HTTP_'+r.status);
 const after=await getPost();assertIdentity(after);
 if(after.content!==content||after.published!==before.published||JSON.stringify(after.labels??[])!==JSON.stringify(before.labels??[]))throw Error('READBACK_MISMATCH');
 const receipt={target:process.env.CORRECTION_TARGET,id:target.id,url:target.url,state:'EXISTING_CONTENT_CORRECTION_VERIFIED',beforeHash:hash(before.content),afterHash:hash(after.content),originalPublished:after.published,newPublications:0,patchCallCount:1,verifiedAt:new Date().toISOString()};
 writeFileSync('correction-audit/after.json',JSON.stringify(after,null,2));
 writeFileSync('correction-audit/receipt.json',JSON.stringify(receipt,null,2));
 console.log(JSON.stringify(receipt));
}

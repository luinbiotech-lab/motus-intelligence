// One-off factual correction of AI post 5585115675162819801 (verified against the official pages).
import {readFile} from 'node:fs/promises';
import {GoogleBloggerApiAdapter} from '../dist/src/services/blogger.js';
const POST='5585115675162819801',TITLE='엔비디아가 공개한 카자흐스탄 AI 컴퓨팅 인프라 확충, 실제 산업 변화로 이어질까';
const fixes=[
  ['마이크로소프트는 2026년 10월 23일(한국 시간) 공식 뉴스룸에','마이크로소프트는 2026년 10월 22일(한국 시간) 공식 블로그에'],
  [' 원문에서 함께 언급된 국가·기업은 오픈AI이다.',''],
];
const raw=JSON.parse(await readFile('config/publishing.json','utf8')).blogger;
const config={...raw,blogId:process.env.BLOGGER_BLOG_ID.trim(),credentialAvailable:true,publishAsDraft:true};
const google=new GoogleBloggerApiAdapter();
const before=await google.readPost(POST,config);
if(before.status!=='PUBLISHED'||before.title!==TITLE){console.log(`::error::identity mismatch status=${before.status}`);process.exit(1)}
let content=before.content;
for(const [from,to] of fixes){const n=content.split(from).length-1;console.log(`::notice::occurrences ${n} for "${from.slice(0,30)}"`);if(n!==1){console.log('::error::expected exactly one occurrence');process.exit(1)}content=content.replace(from,to)}
const after=await google.patchPostContent(POST,{title:TITLE,content,labels:before.labels},config);
const ok=after.status==='PUBLISHED'&&after.title===TITLE&&fixes.every(([from,to])=>!after.content.includes(from)&&(!to||after.content.includes(to)));
console.log(`::notice::patched status=${after.status} url=${after.url} verified=${ok} lenBefore=${before.content.length} lenAfter=${after.content.length}`);
const pub=await fetch(after.url,{headers:{'user-agent':'MOTUS-Correction-Verification/1.0'}}),html=await pub.text();
console.log(`::notice::public ${pub.status} hasNew=${html.includes('2026년 10월 22일(한국 시간) 공식 블로그에')} hasOldDate=${html.includes('10월 23일(한국 시간) 공식 뉴스룸에')} hasOpenAI=${html.includes('오픈AI이다')}`);
if(!ok)process.exit(1);

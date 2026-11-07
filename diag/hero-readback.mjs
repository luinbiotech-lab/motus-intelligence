// Temporary diagnostic (not for merge): does Blogger store an <img> hero figure byte-for-byte (readback gate)?
import {readFile} from 'node:fs/promises';
import {GoogleBloggerApiAdapter} from '../dist/src/services/blogger.js';
import {renderAIEditorialArticle} from '../dist/src/publishers/editorial-article.js';
const raw=JSON.parse(await readFile('config/publishing.json','utf8')).blogger;
const config={...raw,blogId:process.env.BLOGGER_BLOG_ID,credentialAvailable:true,publishAsDraft:true};
const view=JSON.parse(await readFile('tests/fixtures/ai-narrative/view-2026-11-04.json','utf8'));
const url='https://raw.githubusercontent.com/luinbiotech-lab/motus-intelligence/diag/hero-readback/diag/hero-sample.png';
const fig=`<figure data-section="hero-image" style="margin:0 0 22px"><img src="${url}" alt="AI 인텔리전스 2026년 11월 4일: 테스트 &quot;따옴표&quot;" width="1200" height="630" style="display:block;width:100%;height:auto;border:0"></figure>`;
const html=renderAIEditorialArticle(view).html.replace('</header>','</header>'+fig);
const canon=h=>(h.match(/<article\b[^>]*>[\s\S]*<\/article>/i)?.[0]??h).replaceAll('&amp;','&').replaceAll('&quot;','"').replace(/>\s+</g,'><').replace(/\s+/g,' ').trim();
const g=new GoogleBloggerApiAdapter();let postId=null;
try{
  const post=await g.insertDraftContent({title:'[TEST] 대표 이미지 readback 점검 - 자동 삭제',content:html,labels:[]},config);postId=post.postId??post.id;
  const a=canon(html),b=canon(post.content);
  console.log('DRAFT', post.status, 'equal=', a===b, 'lenExpected=',a.length,'lenStored=',b.length);
  const ia=a.indexOf('<figure'),ib=b.indexOf('<figure');console.log('EXPECTED_FIG',a.slice(ia,ia+420));console.log('STORED_FIG  ',b.slice(ib,ib+420));
  if(a!==b){let i=0;while(i<a.length&&a[i]===b[i])i++;console.log('FIRST_DIFF_AT',i);console.log('E:',a.slice(Math.max(0,i-80),i+160));console.log('S:',b.slice(Math.max(0,i-80),i+160))}
}finally{
  if(postId){const token=await g['resolveAccessToken'](config);const r=await fetch(`https://www.googleapis.com/blogger/v3/blogs/${config.blogId}/posts/${postId}`,{method:'DELETE',headers:{authorization:`Bearer ${token}`}});console.log('DRAFT_DELETED',r.status)}
}

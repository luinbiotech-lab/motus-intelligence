import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BACKFILL_MARKER,backfillContent,backfillOrder,eligibility,legacyLabel,parseFeedWithIds,stripBackfill,type FeedPost} from '../src/operations/backfill-links.js';

const original=readFileSync(new URL('../../tests/fixtures/backfill-old-article.html',import.meta.url),'utf8');
const labels=['국내증시','미국증시','AI 인텔리전스','리포트'];
const all:FeedPost[]=Array.from({length:30},(_,i)=>({postId:String(1000+i),title:`기사 ${i}`,url:`https://motusnova.blogspot.com/2026/1${i<15?1:0}/p-${i}.html`,label:labels[i%4]!,published:`2026-${i<15?'11':'10'}-${String(28-(i%28)).padStart(2,'0')}`}));
const post:FeedPost={postId:'999',title:'코스피 1.24% 하락 5,937…검색 1위 삼성전자 4.8% 하락',url:'https://motusnova.blogspot.com/2026/10/124-5937-1-48.html',label:'국내증시',published:'2026-10-30'};
const image={file:'hero-0123456789ab.png',alt:'국내증시 2026-10-30: 코스피 "하락"'};

test('feed ids and legacy labels are parsed', ()=>{
  const posts=parseFeedWithIds({feed:{entry:[{id:{$t:'tag:blogger.com,1999:blog-1.post-42'},title:{$t:'미국 증시 마감'},published:{$t:'2026-10-06T19:55:00+09:00'},category:[{term:'미국증시 (U.S. Market)'}],link:[{rel:'alternate',href:'https://motusnova.blogspot.com/2026/10/m-ai-531.html'}]},{id:{$t:'x'},title:{$t:'no id'},link:[{rel:'alternate',href:'https://motusnova.blogspot.com/2026/10/a.html'}]}]}});
  assert.deepEqual(posts,[{postId:'42',title:'미국 증시 마감',url:'https://motusnova.blogspot.com/2026/10/m-ai-531.html',label:'미국증시',published:'2026-10-06'}]);
  assert.equal(legacyLabel(['MOTUS Daily']),'');
});

test('oldest first, done posts skipped', ()=>{
  const order=backfillOrder(all,new Set(['1015']));
  assert.ok(!order.some(p=>p.postId==='1015'));
  assert.ok(order[0]!.published<=order.at(-1)!.published);
});

test('eligibility: only single-article pipeline posts that miss links or an image', ()=>{
  assert.deepEqual(eligibility(original),{eligible:true,needsLinks:true,needsImage:true});
  assert.equal(eligibility('<p>manual</p>').eligible,false);
  assert.equal(eligibility(`<article>${BACKFILL_MARKER}x</article>`).eligible,false);
});

test('original body is kept byte for byte; card first, links last; revert strips exactly', ()=>{
  const out=backfillContent(original,{post,all,image});
  assert.ok(out.content.includes(original.trim().slice(original.trim().indexOf('>')+1,-'</article>'.length)),'original inner body intact');
  assert.ok(out.content.indexOf('data-section="hero-image"')<out.content.indexOf('data-section="related-posts"'));
  assert.ok(out.related>=5&&out.related<=6);
  assert.ok(!out.content.includes(post.url),'never links to itself');
  assert.match(out.content,/alt="국내증시 2026-10-30: 코스피 &quot;하락&quot;"/);
  assert.match(out.content,/search\/label\//);
  assert.equal(stripBackfill(out.content),original.trim());
  assert.equal(eligibility(out.content).eligible,false,'idempotent');
});

test('an invalid image file name is never linked', ()=>{
  const out=backfillContent(original,{post,all,image:{file:'../x.png',alt:'x'}});
  assert.ok(!out.content.includes('<img'));
  assert.equal(stripBackfill(out.content),original.trim());
});

test('a post that already links keeps its own block; only the card is added and removed', ()=>{
  const linked=original.trim().replace(/<\/article>$/,'<section data-section="related-posts"><ul><li >x</li></ul></section></article>');
  assert.deepEqual(eligibility(linked),{eligible:true,needsLinks:false,needsImage:true});
  const out=backfillContent(linked,{post,all,image});
  assert.equal(out.related,0);
  assert.equal((out.content.match(/data-section="related-posts"/g)??[]).length,1);
  assert.equal(stripBackfill(out.content),linked);
});

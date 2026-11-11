import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRelatedFeed,pickRelatedPosts,relatedCategoryHubs,RELATED_FEED_URL} from '../src/publishers/related-posts.js';
import {relatedPosts} from '../src/publishers/editorial-article.js';

const labels=['국내증시','미국증시','AI 인텔리전스','리포트'];
const archive=Array.from({length:40},(_,i)=>{const day=String(40-i).padStart(2,'0');const d=`2026-${i<10?'11':'10'}-${String(i<10?11-i:31-(i-10)%28).padStart(2,'0')}`;return {title:`기사 ${i} ${day}`,url:`https://motusnova.blogspot.com/2026/${d.slice(5,7)}/post-${i}.html`,label:labels[i%4]!,published:d}});

test('feed window covers the whole archive', ()=>{assert.match(RELATED_FEED_URL,/max-results=150/)});

test('parseRelatedFeed keeps canonical labels and decodes titles', ()=>{
  const posts=parseRelatedFeed({feed:{entry:[{title:{$t:'S&amp;P 500 상승'},published:{$t:'2026-11-10T08:44:00+09:00'},category:[{term:'미국증시'}],link:[{rel:'alternate',href:'https://motusnova.blogspot.com/2026/11/a.html'}]},{title:{$t:''},link:[]}]}});
  assert.deepEqual(posts,[{title:'S&P 500 상승',url:'https://motusnova.blogspot.com/2026/11/a.html',label:'미국증시',published:'2026-11-10'}]);
});

test('newest, previous edition and two archive posts; never the post itself', ()=>{
  const picked=pickRelatedPosts(archive,'국내증시','2026-11-11');
  assert.ok(picked.length>=5&&picked.length<=6);
  assert.equal(new Set(picked.map(p=>p.url)).size,picked.length);
  assert.ok(!picked.some(p=>p.label==='국내증시'&&p.published>='2026-11-11'));
  const sorted=[...archive].filter(p=>!(p.label==='국내증시'&&p.published>='2026-11-11')).sort((a,b)=>b.published.localeCompare(a.published));
  assert.ok(picked.some(p=>p.url===sorted.find(x=>x.label==='국내증시')!.url),'previous same-category edition linked');
  const old=new Set(sorted.slice(12).map(p=>p.url));
  assert.ok(picked.filter(p=>old.has(p.url)).length>=2,'two archive posts linked');
});

test('archive rotation reaches most older posts within two weeks', ()=>{
  const reached=new Set<string>();
  for(let day=1;day<=14;day++)for(const label of ['국내증시','미국증시','AI 인텔리전스'])for(const p of pickRelatedPosts(archive,label,`2026-11-${String(day).padStart(2,'0')}`))reached.add(p.url);
  const old=[...archive].sort((a,b)=>b.published.localeCompare(a.published)).slice(12);
  assert.ok(old.filter(p=>reached.has(p.url)).length>=old.length*0.6,`reached ${old.filter(p=>reached.has(p.url)).length}/${old.length}`);
  assert.deepEqual(pickRelatedPosts(archive,'미국증시','2026-11-11'),pickRelatedPosts(archive,'미국증시','2026-11-11'));
});

test('rendered block links up to six posts plus category pages, current category first', ()=>{
  const html=relatedPosts(pickRelatedPosts(archive,'미국증시','2026-11-11'),'미국증시');
  const count=(html.match(/<li /g)??[]).length;assert.ok(count>=5&&count<=6,String(count));
  assert.match(html,/data-section="category-hubs"/);
  const hubs=[...html.matchAll(/href="(https:\/\/motusnova\.blogspot\.com\/search\/label\/[^"]+)"/g)].map(m=>decodeURIComponent(m[1]!.split('/label/')[1]!));
  assert.deepEqual(hubs,['미국증시','국내증시','AI 인텔리전스','리포트']);
  assert.deepEqual(relatedCategoryHubs('').map(h=>h.label),['국내증시','미국증시','AI 인텔리전스','리포트']);
  assert.equal(relatedPosts([], '미국증시'),'');
});

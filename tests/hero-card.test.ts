import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import type {AIIntelligenceDailyViewModel} from '../src/intelligence/daily-masters.js';
import {heroCardHtml,heroFileName,heroMoves,prepareHeroImage,validHeroPng,HERO_BASE_URL} from '../src/publishers/hero-card.js';
import {renderAIEditorialArticle} from '../src/publishers/editorial-article.js';
import {mergeBundleIntoOpsData} from '../src/production/ops-data-merge.js';

const input={category:'korea' as const,issueDate:'2026-11-06',storeDate:'2026-11-06',title:'코스피 마감, 5.28% 급락해 5,383.80',moves:[{label:'삼성전기',value:-14.8},{label:'SK하이닉스',value:-9.6},{label:'NAVER',value:7.67}]};
const png=()=>{const bytes=new Uint8Array(9000);bytes.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);return bytes};

test('the card is deterministic, escapes text and shows the largest moves first', () => {
  assert.equal(heroCardHtml(input),heroCardHtml(input));assert.equal(heroFileName(input),heroFileName({...input}));
  assert.notEqual(heroFileName(input),heroFileName({...input,title:input.title+'!'}));
  assert.match(heroCardHtml({...input,title:'<b>x</b> & y'}),/&lt;b&gt;x&lt;\/b&gt; &amp; y/);
  assert.deepEqual(heroMoves([{label:'a',value:1},{label:'b',value:-3},{label:'c',value:2},{label:'d',value:0.5},{label:'e',value:Number.NaN}]).map(m=>m.label),['b','c','a']);
  assert.match(heroCardHtml(input),/국내증시/);assert.match(heroCardHtml(input),/2026년 11월 6일/);assert.match(heroCardHtml(input),/−14\.80%/);
});

test('prepareHeroImage stores the PNG under the operation date and returns the public ops-data URL', async () => {
  const root=await mkdtemp(join(tmpdir(),'hero-'));
  const image=await prepareHeroImage({...input,issueDate:'2026-11-05',storeDate:'2026-11-06'},{root,enabled:true,render:async()=>png()});
  assert.ok(image);assert.equal(image.url,`${HERO_BASE_URL}data/operations/2026-11-06/korea/${heroFileName({...input,issueDate:'2026-11-05'})}`);
  assert.equal((await readFile(join(root,'data/operations/2026-11-06/korea',heroFileName({...input,issueDate:'2026-11-05'})))).length,9000);
  assert.match(image.alt,/^국내증시 2026년 11월 5일: /);
});

test('no image when off, when the renderer is missing or when the bytes are not a PNG; never throws', async () => {
  const root=await mkdtemp(join(tmpdir(),'hero-'));
  assert.equal(await prepareHeroImage(input,{root,enabled:false,render:async()=>png()}),null);
  assert.equal(await prepareHeroImage(input,{root,enabled:true,render:async()=>null}),null);
  assert.equal(await prepareHeroImage(input,{root,enabled:true,render:async()=>new Uint8Array(20)}),null);
  assert.equal(await prepareHeroImage(input,{root,enabled:true,render:async()=>{throw new Error('chromium crashed')}}),null);
  assert.equal(validHeroPng(png()),true);
});

test('the article shows the image first after the masthead, only for MOTUS ops-data hero URLs', () => {
  const view=JSON.parse(readFileSync('tests/fixtures/ai-narrative/view-2026-11-04.json','utf8')) as AIIntelligenceDailyViewModel;
  const url=`${HERO_BASE_URL}data/operations/2026-11-04/ai/hero-0123456789ab.png`;
  const html=renderAIEditorialArticle({...view,heroImage:{url,alt:'AI 인텔리전스 "알트"',width:1200,height:630}}).html;
  const img=html.indexOf('<img'),header=html.indexOf('</header>'),lead=html.indexOf('data-section="editorial-lead"');
  assert.ok(header<img&&img<lead);assert.equal(html.match(/<img/g)?.length,1);assert.match(html,/alt="AI 인텔리전스 &quot;알트&quot;"/);
  assert.doesNotMatch(renderAIEditorialArticle({...view,heroImage:{url:'https://evil.example/x.png',alt:'x',width:1,height:1}}).html,/<img/);
  assert.doesNotMatch(renderAIEditorialArticle(view).html,/<img/);
});

test('ops-data merge copies hero PNGs byte for byte', async () => {
  const bundle=await mkdtemp(join(tmpdir(),'bundle-')),ops=await mkdtemp(join(tmpdir(),'ops-'));
  const bytes=new Uint8Array([0x89,0x50,0x4e,0x47,0xff,0x00,0xfe,0x80,0x81]);
  await mkdir(join(bundle,'operations/2026-11-06/korea'),{recursive:true});await writeFile(join(bundle,'operations/2026-11-06/korea/hero-0123456789ab.png'),bytes);
  const first=await mergeBundleIntoOpsData(bundle,ops);assert.equal(first.written,1);
  assert.deepEqual(new Uint8Array(await readFile(join(ops,'operations/2026-11-06/korea/hero-0123456789ab.png'))),bytes);
  assert.equal((await mergeBundleIntoOpsData(bundle,ops)).unchanged,1);
});

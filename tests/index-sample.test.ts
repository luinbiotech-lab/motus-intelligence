import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {carriedIndexedUrls,inspectionUrlOrder,normalizeInspectionUrl} from '../src/operations/index-sample.js';

const B='https://motusnova.blogspot.com';
const capture=(inspections:Array<{url:string;verdict?:string;error?:string}>,state='PASS')=>({indexStatus:{state,inspections}});

test('MO-13: URLs indexed in an earlier capture are carried, newest PASS first, within 14 days', () => {
  const priors=[
    {date:'2026-11-14',input:capture([{url:B+'/2026/10/a.html',verdict:'PASS'},{url:B+'/2026/10/b.html',verdict:'PASS'},{url:B+'/2026/11/new.html',verdict:'NEUTRAL'}])},
    {date:'2026-11-18',input:capture([{url:B+'/2026/10/a.html?m=1',verdict:'PASS'},{url:B+'/2026/11/err.html',error:'HTTP 500'}])},
    {date:'2026-11-01',input:capture([{url:B+'/2026/10/old.html',verdict:'PASS'}])},
    {date:'2026-11-22',input:capture([{url:B+'/2026/11/future.html',verdict:'PASS'}])},
    {date:'2026-11-20',input:capture([{url:B+'/2026/11/c.html',verdict:'PASS'}],'UNAVAILABLE')},
    {date:'bad',input:null},
  ];
  assert.deepEqual(carriedIndexedUrls('2026-11-22',priors),[
    {url:B+'/2026/10/a.html',lastPassDate:'2026-11-18'},
    {url:B+'/2026/10/b.html',lastPassDate:'2026-11-14'},
  ]);
  assert.equal(carriedIndexedUrls('2026-11-22',priors,{limit:1}).length,1);
  assert.deepEqual(carriedIndexedUrls('2026-11-22',[]),[]);
});

test('MO-13: carried URLs are inspected before the feed window, so the cap drops feed posts first', () => {
  const recent=Array.from({length:60},(_,i)=>`${B}/2026/11/r${i}.html`);
  const order=inspectionUrlOrder({fixed:[B+'/'],articles:[B+'/2026/11/d1.html'],carried:[B+'/2026/10/a.html',B+'/2026/11/d1.html'],recent:['http://motusnova.blogspot.com/2026/10/a.html?m=1',...recent]},60);
  assert.equal(order.length,60);
  assert.deepEqual(order.slice(0,3),[{url:B+'/',source:'fixed'},{url:B+'/2026/11/d1.html',source:'article'},{url:B+'/2026/10/a.html',source:'carried'}]);
  assert.equal(order.filter(item=>item.url.includes('/2026/10/a.html')).length,1);
  assert.equal(order[3]?.source,'recent');
  assert.equal(normalizeInspectionUrl('http://motusnova.blogspot.com/x.html?m=1#c'),B+'/x.html');
});

test('MO-13: the traffic CLI uses the carry-over and records each URL source', () => {
  const cli=readFileSync(join(process.cwd(),'src','traffic-daily-cli.ts'),'utf8');
  assert.match(cli,/carriedIndexedUrls\(date,priors\)/);
  assert.match(cli,/inspectionUrlOrder\(\{fixed,articles:/);
  assert.match(cli,/carriedIndexed:\{count:carried\.length/);
  assert.doesNotMatch(cli,/\[\.\.\.new Set\(\[\.\.\.fixed,\.\.\.ours/);
});

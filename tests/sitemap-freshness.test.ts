import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildDailyStatus,sitemapFreshness,sitemapStatusLine} from '../src/production/run-record.js';

// MO-9 (#97 11/8~11/16): Google did not re-download the sitemap 11/5→11/15 and nothing flagged it.
test('sitemap freshness: older than 48 hours is STALE, the newest download of several sitemaps counts',()=>{
  const sitemaps=[{path:'a',lastDownloaded:'2026-11-05T01:00:00Z'},{path:'b',lastDownloaded:'2026-11-14T18:47:00Z'}];
  assert.deepEqual(sitemapFreshness(sitemaps,'2026-11-16T04:41:00Z'),{state:'FRESH',lastDownloaded:'2026-11-14T18:47:00Z',hours:33.9,maxHours:48,checkedAt:'2026-11-16T04:41:00Z'});
  const stale=sitemapFreshness(sitemaps,'2026-11-17T04:41:00Z');
  assert.equal(stale.state,'STALE');assert.equal(stale.hours,57.9);
  assert.equal(sitemapFreshness([{path:'a',lastDownloaded:'2026-11-15T04:41:00Z'}],'2026-11-17T04:41:00Z').state,'FRESH','exactly 48h is not yet stale');
  assert.equal(sitemapFreshness([{path:'a'}],'2026-11-17T04:41:00Z').state,'UNKNOWN');
  assert.equal(sitemapFreshness({error:'HTTP 403'},'2026-11-17T04:41:00Z').state,'UNKNOWN');
  assert.equal(sitemapFreshness([{lastDownloaded:'2026-11-15T00:00:00Z'}],'').state,'UNKNOWN');
});

test('daily status carries the sitemap warning from the latest traffic capture, or says it was not measured',async()=>{
  const data=await mkdtemp(join(tmpdir(),'motus-sitemap-'));
  try{
    const operations=join(data,'operations'),traffic=join(data,'traffic');await mkdir(operations,{recursive:true});
    assert.match(await sitemapStatusLine(traffic,'2026-11-17'),/측정 안 됨\(최근 3일 traffic-input 없음\)/);
    await mkdir(join(traffic,'2026-11-16'),{recursive:true});
    await writeFile(join(traffic,'2026-11-16','traffic-input.json'),JSON.stringify({collectedAt:'2026-11-16T04:41:00Z',indexStatus:{state:'PASS',sitemaps:[{lastDownloaded:'2026-11-14T18:47:00Z'}]}}));
    assert.match(await sitemapStatusLine(traffic,'2026-11-16'),/^구글 사이트맵: 정상\(마지막 다운로드 11\/15 03:47 KST, 2026-11-16 수집 기준 33\.9시간 전\)$/);
    await mkdir(join(traffic,'2026-11-17'),{recursive:true});
    await writeFile(join(traffic,'2026-11-17','traffic-input.json'),JSON.stringify({collectedAt:'2026-11-17T04:41:00Z',indexStatus:{state:'PASS',sitemaps:[{lastDownloaded:'2026-11-14T18:47:00Z'}]}}));
    const status=await buildDailyStatus(operations,'2026-11-17','2026-11-17T08:00:00Z');
    assert.match(status,/\*\*경고: 구글 사이트맵을 57\.9시간째 다시 내려받지 않았다\*\* \(마지막 11\/15 03:47 KST, 기준 48시간, 2026-11-17 수집 11\/17 13:41 KST 기준\)/);
    // A later date without its own capture uses the newest earlier one; a capture after the date is ignored.
    assert.match(await sitemapStatusLine(traffic,'2026-11-18'),/2026-11-17 수집/);
    assert.match(await sitemapStatusLine(traffic,'2026-11-16'),/정상/);
    // An UNAVAILABLE index status is skipped in favour of an earlier PASS capture.
    await mkdir(join(traffic,'2026-11-18'),{recursive:true});
    await writeFile(join(traffic,'2026-11-18','traffic-input.json'),JSON.stringify({collectedAt:'2026-11-18T04:41:00Z',indexStatus:{state:'UNAVAILABLE'}}));
    assert.match(await sitemapStatusLine(traffic,'2026-11-18'),/2026-11-17 수집/);
  }finally{await rm(data,{recursive:true,force:true})}
});

test('run-record.js stays import-free: the persist tool uploads it without the rest of dist (MO-9 regression guard)',async()=>{
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(new URL('../../src/production/run-record.ts',import.meta.url),'utf8');
  assert.deepEqual((source.match(/^import .* from '([^']+)';/gm)??[]).filter(line=>!/from 'node:/.test(line)),[]);
});

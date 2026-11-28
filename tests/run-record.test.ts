import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,rm,writeFile,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {appendRunRecord,buildDailyStatus,currentRunOutcome,delayMinutes,publishingRunCell,readRunRecords,scheduledKstTime} from '../src/production/run-record.js';
import {appendPublishLedger} from '../src/production/publication-operation.js';
import {mergeJsonl} from '../src/production/ops-data-merge.js';

test('cron entries map to their KST target times',()=>{
 assert.equal(scheduledKstTime('17 21 * * 0-4'),'06:17');assert.equal(scheduledKstTime('45 21 * * 1-5'),'06:45');
 assert.equal(scheduledKstTime('30 3 * * 1-5'),'12:30');assert.equal(scheduledKstTime('40 1 * * 2-6'),'10:40');
 assert.equal(scheduledKstTime(''),null);assert.equal(scheduledKstTime(null),null);assert.equal(scheduledKstTime('*/5 * * * *'),null);
});

test('delay is measured in KST and survives the midnight boundary',()=>{
 assert.equal(delayMinutes('06:45','2026-10-29T00:53:37Z'),188,'10/29 U.S. scheduled run started 09:53 KST');
 assert.equal(delayMinutes('12:30','2026-10-29T03:30:00Z'),0);
 assert.equal(delayMinutes('23:50','2026-10-29T15:05:00Z'),15,'started 00:05 KST the next day');
 assert.equal(delayMinutes(null,'2026-10-29T00:00:00Z'),null);
});

test('daily status shows one row per category with state, reason, link, run count and first delay',async()=>{
 const root=await mkdtemp(join(tmpdir(),'motus-status-')),date='2026-10-30';
 try{
  const us=join(root,date,'us'),ai=join(root,date,'ai'),korea=join(root,date,'korea');for(const dir of [us,ai,korea])await mkdir(dir,{recursive:true});
  await appendPublishLedger(us,{identity:date+'|US_MARKET',operationDate:date,category:'US_MARKET',at:'2026-10-29T22:01:00Z',event:'PUBLISHED',postId:'1',publicPostUrl:'https://motusnova.blogspot.com/2026/10/x.html',fingerprint:'sha256:x',detail:'AUTO_POLICY_APPROVAL'});
  await appendRunRecord(us,{runId:'1',attempt:'1',event:'schedule',schedule:'45 21 * * 1-5',category:'us',operationDate:date,scheduledKst:'06:45',startedAt:'2026-10-29T23:00:00Z',delayMinutes:135,state:'PUBLISHED',reason:'',publicPostUrl:'https://motusnova.blogspot.com/2026/10/x.html'});
  await writeFile(join(korea,'auto-publish.json'),JSON.stringify({state:'HOLD',reasonCode:'KOREA_MORNING_WINDOW_NOT_ELIGIBLE'}));
  const status=await buildDailyStatus(root,date,'2026-10-30T00:00:00Z');
  assert.match(status,/\| 미국증시 \| 발행 \|  \| \[링크\]\(https:\/\/motusnova\.blogspot\.com\/2026\/10\/x\.html\) \| 1 \| 예약 06:45 · 135분 지연 \|/);
  assert.match(status,/\| AI 인텔리전스 \| 미실행 \|/);
  assert.match(status,/\| 국내증시 \| HOLD \| KOREA_MORNING_WINDOW_NOT_ELIGIBLE \|/);
 }finally{await rm(root,{recursive:true,force:true})}
});

test('a run after publication reports its own latest-run outcome, not the earlier PUBLISHED file',async()=>{
 const root=await mkdtemp(join(tmpdir(),'motus-outcome-'));
 try{
  await writeFile(join(root,'auto-publish.json'),JSON.stringify({state:'PUBLISHED',publicPostUrl:'https://motusnova.blogspot.com/a.html'}));
  const before=new Date(Date.now()-1000).toISOString();
  await writeFile(join(root,'auto-publish-latest-run.json'),JSON.stringify({state:'HOLD',gate:{reasons:['duplicate state uncertain']}}));
  assert.deepEqual(await currentRunOutcome(root,before),{state:'HOLD',reason:'duplicate state uncertain',publicPostUrl:null});
  const later=new Date(Date.now()+60000).toISOString();
  assert.equal((await currentRunOutcome(root,later)).state,'PUBLISHED','a stale latest-run file from an earlier run is ignored');
 }finally{await rm(root,{recursive:true,force:true})}
});

test('run records survive the ops-data union merge from two runners',async()=>{
 const a=await mkdtemp(join(tmpdir(),'motus-runs-a-')),b=await mkdtemp(join(tmpdir(),'motus-runs-b-'));
 try{
  const base={attempt:'1',event:'schedule',schedule:'45 21 * * 1-5',category:'us',operationDate:'2026-10-30',scheduledKst:'06:45',delayMinutes:10,state:'HOLD',reason:'x',publicPostUrl:null};
  await appendRunRecord(a,{...base,runId:'1',startedAt:'2026-10-29T21:55:00Z'});await appendRunRecord(b,{...base,runId:'2',startedAt:'2026-10-29T23:45:00Z'});
  const merged=mergeJsonl(await readFile(join(a,'runs.jsonl'),'utf8'),await readFile(join(b,'runs.jsonl'),'utf8'));await writeFile(join(a,'runs.jsonl'),merged);
  assert.deepEqual((await readRunRecords(a)).map(item=>item.runId),['1','2']);
 }finally{await rm(a,{recursive:true,force:true});await rm(b,{recursive:true,force:true})}
});

test('the merge tool rebuilds daily status from the merged tree, so parallel runs see each other',async()=>{
 const {mergeBundleIntoOpsData}=await import('../src/production/ops-data-merge.js');
 const ops=await mkdtemp(join(tmpdir(),'motus-ops-')),bundle=await mkdtemp(join(tmpdir(),'motus-bundle-')),date='2026-10-30';
 try{
  // ops-data already has the U.S. publication from a parallel runner; this bundle only carries Korea.
  const us=join(ops,'operations',date,'us');await mkdir(us,{recursive:true});
  await appendPublishLedger(us,{identity:date+'|US_MARKET',operationDate:date,category:'US_MARKET',at:'2026-10-29T23:28:42Z',event:'PUBLISHED',postId:'u',publicPostUrl:'https://motusnova.blogspot.com/2026/10/3-42.html',fingerprint:'sha256:u',detail:'AUTO_POLICY_APPROVAL'});
  const korea=join(bundle,'operations',date,'korea');await mkdir(korea,{recursive:true});
  await appendPublishLedger(korea,{identity:date+'|KOREA_MARKET',operationDate:date,category:'KOREA_MARKET',at:'2026-10-29T23:28:56Z',event:'PUBLISHED',postId:'k',publicPostUrl:'https://motusnova.blogspot.com/2026/10/124-5937-1-48.html',fingerprint:'sha256:k',detail:'AUTO_POLICY_APPROVAL'});
  await writeFile(join(bundle,'operations',date,'daily-status.md'),'| 미국증시 | HOLD | stale view from the Korea runner |');
  await mergeBundleIntoOpsData(bundle,ops);
  const status=await buildDailyStatus(join(ops,'operations'),date,'2026-10-29T23:30:00Z');
  assert.match(status,/\| 미국증시 \| 발행 \|/);assert.match(status,/\| 국내증시 \| 발행 \|/);
 }finally{await rm(ops,{recursive:true,force:true});await rm(bundle,{recursive:true,force:true})}
});

test('daily status shows the run that published, not the delay of a cron that skipped after a manual publication (MOT-048)',async()=>{
 const root=await mkdtemp(join(tmpdir(),'motus-status-pub-')),date='2026-11-18';
 try{
  const korea=join(root,date,'korea');await mkdir(korea,{recursive:true});
  await appendPublishLedger(korea,{identity:date+'|KOREA_MARKET',operationDate:date,category:'KOREA_MARKET',at:'2026-11-17T08:36:30Z',event:'PUBLISHED',postId:'k',publicPostUrl:'https://motusnova.blogspot.com/2026/11/k.html',fingerprint:'sha256:k',detail:'AUTO_POLICY_APPROVAL'});
  const base={attempt:'1',category:'korea',operationDate:date,publicPostUrl:null};
  // Shape of ops-data data/operations/2026-11-18/korea/runs.jsonl: manual HOLD → manual PUBLISHED → late cron SKIP (474 min).
  await appendRunRecord(korea,{...base,runId:'44044642830',event:'workflow_dispatch',schedule:null,scheduledKst:null,startedAt:'2026-11-17T08:12:10Z',delayMinutes:null,state:'HOLD',reason:'YAHOO_FINANCE_KOSDAQ_ROW_MISSING'});
  await appendRunRecord(korea,{...base,runId:'44048069847',event:'workflow_dispatch',schedule:null,scheduledKst:null,startedAt:'2026-11-17T08:35:48Z',delayMinutes:null,state:'PUBLISHED',reason:''});
  await appendRunRecord(korea,{...base,runId:'44054450110',event:'schedule',schedule:'25 1 * * 1-5',scheduledKst:'10:25',startedAt:'2026-11-17T09:19:14Z',delayMinutes:474,state:'SKIP',reason:'ALREADY_PUBLISHED_IN_PERSISTED_LEDGER'});
  const status=await buildDailyStatus(root,date,'2026-11-18T12:00:00Z');
  assert.match(status,/\| 국내증시 \| 발행 \|  \| \[링크\]\(https:\/\/motusnova\.blogspot\.com\/2026\/11\/k\.html\) \| 3 \| 수동 17:35 시작 \|/);
  assert.doesNotMatch(status,/474분/);
 }finally{await rm(root,{recursive:true,force:true})}
});

test('publishing-run cell: scheduled publisher, unpublished day, and ledger without a matching run record',()=>{
 const run=(over:Record<string,unknown>)=>({runId:'1',attempt:'1',event:'schedule',schedule:'40 1 * * 2-6',category:'us',operationDate:'2026-11-18',scheduledKst:'08:40',startedAt:'2026-11-17T23:50:00Z',delayMinutes:10,state:'HOLD',reason:'',publicPostUrl:null,...over}) as Parameters<typeof publishingRunCell>[0][number];
 assert.equal(publishingRunCell([run({state:'HOLD',scheduledKst:'06:45',delayMinutes:3}),run({state:'PUBLISHED'})],true),'예약 08:40 · 10분 지연');
 assert.equal(publishingRunCell([run({event:'workflow_dispatch',scheduledKst:null,delayMinutes:null}),run({scheduledKst:'10:40',delayMinutes:7})],false),'미발행 · 첫 예약 10:40 7분 지연');
 assert.equal(publishingRunCell([run({state:'SKIP',delayMinutes:323})],true),'발행 실행 기록 없음','a published day never shows a skipped cron delay');
 assert.equal(publishingRunCell([],false),'');
});

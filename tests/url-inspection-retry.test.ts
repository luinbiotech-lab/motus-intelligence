import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectWithRetry,inspectionFailureReason,isRetryableInspectionFailure,summarizeInspections} from '../src/operations/traffic.js';

// MO-21: shapes from real collections — 11/20 'The operation was aborted due to timeout' x3 then SKIPPED_TIME_BUDGET x7,
// 11/22 one 'HTTP 500: ...'.
test('URL inspection: timeout, network error and HTTP 5xx retry once; 4xx and 429 do not', async () => {
  assert.equal(isRetryableInspectionFailure(new Error('The operation was aborted due to timeout')),true);
  assert.equal(isRetryableInspectionFailure({ok:false,status:500}),true);
  assert.equal(isRetryableInspectionFailure({ok:false,status:429}),false);
  assert.equal(isRetryableInspectionFailure({ok:false,status:403}),false);
  assert.equal(isRetryableInspectionFailure({ok:true,status:200}),false);

  let calls=0;
  const flaky=await inspectWithRetry(async()=>(++calls===1?{ok:false,status:500}:{ok:true,status:200}),Date.now()+60000);
  assert.deepEqual([flaky.result.status,flaky.attempts,calls],[200,2,2]);

  calls=0;
  const quota=await inspectWithRetry(async()=>{calls++;return {ok:false,status:429}},Date.now()+60000);
  assert.deepEqual([quota.attempts,calls],[1,1]);

  calls=0;
  const twice=await inspectWithRetry(async()=>{calls++;return new Error('The operation was aborted due to timeout')},Date.now()+60000);
  assert.deepEqual([twice.attempts,calls,twice.result instanceof Error],[2,2,true]);
});

test('URL inspection: no retry once the time budget is used up', async () => {
  let calls=0;
  const late=await inspectWithRetry(async()=>{calls++;return new Error('The operation was aborted due to timeout')},1000,()=>2000);
  assert.deepEqual([late.attempts,calls],[1,1]);
});

test('URL inspection summary counts unmeasured URLs by reason and retry recoveries', () => {
  assert.equal(inspectionFailureReason('The operation was aborted due to timeout'),'TIMEOUT');
  assert.equal(inspectionFailureReason('HTTP 500: {"error":{"code":500}}'),'HTTP_5XX');
  assert.equal(inspectionFailureReason('HTTP 429: quota'),'HTTP_429');
  assert.equal(inspectionFailureReason('HTTP 403: forbidden'),'HTTP_4XX');
  assert.equal(inspectionFailureReason('SKIPPED_TIME_BUDGET'),'SKIPPED_TIME_BUDGET');
  const summary=summarizeInspections([
    {verdict:'PASS',attempts:1},{verdict:'FAIL',attempts:2},{verdict:'NEUTRAL'},
    {error:'The operation was aborted due to timeout',attempts:2},{error:'HTTP 500: x',attempts:2},{error:'SKIPPED_TIME_BUDGET'},
  ]);
  assert.deepEqual(summary,{total:6,measured:3,unmeasured:3,byReason:{TIMEOUT:1,HTTP_5XX:1,SKIPPED_TIME_BUDGET:1},retried:3,recoveredByRetry:1});
  assert.deepEqual(summarizeInspections([]),{total:0,measured:0,unmeasured:0,byReason:{},retried:0,recoveredByRetry:0});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {koreaEveningWindow,koreaPublicationSession} from '../src/operations/internal-live-daily.js';
import {latestCompletedSession} from '../src/operations/market-calendar.js';

test('the evening window opens at 16:40 KST on Korean trading days only (owner 2026-11-07, #97)', () => {
  assert.equal(koreaEveningWindow('2026-11-09T08:10:00Z','2026-11-09'),true);   // Mon 17:10 KST
  assert.equal(koreaEveningWindow('2026-11-09T07:39:00Z','2026-11-09'),false);  // Mon 16:39 KST
  assert.equal(koreaEveningWindow('2026-11-08T08:10:00Z','2026-11-08'),false);  // Sun
  assert.equal(koreaEveningWindow('2026-11-09T21:17:00Z','2026-11-10'),false);  // Tue 06:17 KST (morning)
});

test('evening covers today\'s session; the next morning still targets that same session (and skips it once published)', () => {
  assert.equal(latestCompletedSession('KOREA','2026-11-09T08:10:00Z').date,'2026-11-09');
  assert.equal(koreaPublicationSession('2026-11-10','2026-11-09T21:17:00Z',false).date,'2026-11-09');
  assert.equal(koreaPublicationSession('2026-11-09','2026-11-08T21:17:00Z',false).date,'2026-11-06');
});

test('validation accepts a same-day close only when session, observed and operation dates are the same day', async () => {
  const {validateLiveDailyPayload}=await import('../src/operations/live-daily.js');
  const base=(edition:string,op:string)=>({session:{observedDate:'2026-11-09'},unit:{category:'KOREA_MARKET',observedDate:'2026-11-09',readiness:'READY',readinessReasons:[],sourceCount:1,render:{html:'<article></article>'},viewModel:{edition,sessionDate:'2026-11-09',operationDate:op,sources:[{url:'https://example.com'}],metrics:[],indexMetrics:[],supportingMetrics:[],fxAndSupporting:[],investorFlows:[],sectors:[],movers:[]}}});
  const reasons=(edition:string,op:string)=>{try{return validateLiveDailyPayload('KOREA_MARKET',base(edition,op) as never,'2026-11-09T08:10:00Z').filter(r=>/same-day|morning/.test(r))}catch(error){return ['THREW:'+String(error)]}};
  assert.deepEqual(reasons('SAME_DAY_CLOSE','2026-11-09'),[]);
  assert.ok(reasons('SAME_DAY_CLOSE','2026-11-10').length>0);
});

// MOT-040 (2026-11-09 first live evening run skipped: same `<date>|KOREA_MARKET` identity as that morning's edition).
test('the evening edition takes the next trading day slot; mornings keep the requested date', async () => {
  const {koreaPublicationSlot}=await import('../src/operations/internal-live-daily.js');
  const {nextSessionDate}=await import('../src/operations/market-calendar.js');
  assert.deepEqual(koreaPublicationSlot('2026-11-09T08:10:00Z','2026-11-09'),{evening:true,slotDate:'2026-11-10'});   // Mon 17:10
  assert.deepEqual(koreaPublicationSlot('2026-11-13T08:10:00Z','2026-11-13'),{evening:true,slotDate:'2026-11-16'});   // Fri 17:10 -> Mon (MOT-039)
  assert.deepEqual(koreaPublicationSlot('2026-11-09T21:17:00Z','2026-11-10'),{evening:false,slotDate:'2026-11-10'});  // Tue 06:17
  assert.deepEqual(koreaPublicationSlot('2026-11-09T07:39:00Z','2026-11-09'),{evening:false,slotDate:'2026-11-09'});  // 16:39, before window
  assert.deepEqual(koreaPublicationSlot('2026-11-08T08:10:00Z','2026-11-08'),{evening:false,slotDate:'2026-11-08'});  // Sunday
  assert.equal(nextSessionDate('KOREA','2026-10-02'),'2026-10-06');  // Fri -> Tue (10/5 holiday)
  assert.equal(nextSessionDate('KOREA','2026-12-24'),'2026-12-28');  // Thu -> Mon (12/25 holiday)
  assert.throws(()=>nextSessionDate('KOREA','2026-12-30'),/CALENDAR_YEAR_UNVERIFIED/);  // 2027 not loaded yet (MOT-038)
});

test('the evening slot is the identity the next morning checks, so that morning skips', async () => {
  const {persistedPublicationDecision,publicationIdentity}=await import('../src/production/publication-operation.js');
  const {koreaPublicationSlot}=await import('../src/operations/internal-live-daily.js');
  const slot=koreaPublicationSlot('2026-11-09T08:10:00Z','2026-11-09').slotDate,identity=publicationIdentity(slot,'KOREA_MARKET');
  const morningSameDay=[{publicationIdentity:publicationIdentity('2026-11-09','KOREA_MARKET'),event:'PUBLISHED'}] as never;
  assert.equal(persistedPublicationDecision(morningSameDay,slot,'KOREA_MARKET').state,'CONTINUE');  // evening no longer blocked by the morning
  const evening=[{publicationIdentity:identity,event:'PUBLISHED',postId:'1',publicPostUrl:'u'}] as never;
  assert.equal(persistedPublicationDecision(evening,'2026-11-10','KOREA_MARKET').state,'SKIP');      // next morning skips
});

// 루인 review on #114 (2026-11-11, BLOCKING): morning 08:45, evening 17h, holiday and midnight-boundary regressions
// for the ledger key and the shown publication date.
test('slot regression: morning 08:45, evening 17h, holidays and the midnight boundary', async () => {
  const {koreaPublicationSlot}=await import('../src/operations/internal-live-daily.js');
  // morning retry 08:45 KST keeps its own date
  assert.deepEqual(koreaPublicationSlot('2026-11-10T23:45:00Z','2026-11-11'),{evening:false,slotDate:'2026-11-11'});
  // evening 17:00 / 17:59 KST -> next trading day
  assert.deepEqual(koreaPublicationSlot('2026-11-11T08:00:00Z','2026-11-11'),{evening:true,slotDate:'2026-11-12'});
  assert.deepEqual(koreaPublicationSlot('2026-11-11T08:59:00Z','2026-11-11'),{evening:true,slotDate:'2026-11-12'});
  // 16:40 boundary is inclusive, 16:39 is not
  assert.deepEqual(koreaPublicationSlot('2026-11-11T07:40:00Z','2026-11-11'),{evening:true,slotDate:'2026-11-12'});
  assert.deepEqual(koreaPublicationSlot('2026-11-11T07:39:59Z','2026-11-11'),{evening:false,slotDate:'2026-11-11'});
  // holiday evening (12/25 Fri) is never an evening edition
  assert.deepEqual(koreaPublicationSlot('2026-12-25T08:10:00Z','2026-12-25'),{evening:false,slotDate:'2026-12-25'});
  // evening before a holiday skips it (12/24 Thu -> 12/28 Mon)
  assert.deepEqual(koreaPublicationSlot('2026-12-24T08:10:00Z','2026-12-24'),{evening:true,slotDate:'2026-12-28'});
  // midnight: 23:59 KST is still that day's evening; 00:01 KST the next day for the old date is not an evening run
  assert.deepEqual(koreaPublicationSlot('2026-11-11T14:59:00Z','2026-11-11'),{evening:true,slotDate:'2026-11-12'});
  assert.deepEqual(koreaPublicationSlot('2026-11-11T15:01:00Z','2026-11-11'),{evening:false,slotDate:'2026-11-11'});
});

test('ledger sequence for one trading day publishes each session once', async () => {
  const {persistedPublicationDecision,publicationIdentity}=await import('../src/production/publication-operation.js');
  const {koreaPublicationSlot}=await import('../src/operations/internal-live-daily.js');
  const ledger:Array<{publicationIdentity:string;event:string;postId:string;publicPostUrl:string}>=[];
  const run=(at:string,runDate:string)=>{const {slotDate}=koreaPublicationSlot(at,runDate),decision=persistedPublicationDecision(ledger as never,slotDate,'KOREA_MARKET');if(decision.state==='CONTINUE')ledger.push({publicationIdentity:publicationIdentity(slotDate,'KOREA_MARKET'),event:'PUBLISHED',postId:slotDate,publicPostUrl:slotDate});return decision.state};
  assert.equal(run('2026-11-10T21:17:00Z','2026-11-11'),'CONTINUE'); // 11/11 06:17 morning (session 11/10) — only if no evening yet
  assert.equal(run('2026-11-10T23:45:00Z','2026-11-11'),'SKIP');     // 08:45 retry
  assert.equal(run('2026-11-11T08:10:00Z','2026-11-11'),'CONTINUE'); // 17:10 evening (session 11/11) -> slot 11/12
  assert.equal(run('2026-11-11T08:29:00Z','2026-11-11'),'SKIP');     // GitHub cron rerun the same evening
  assert.equal(run('2026-11-11T21:17:00Z','2026-11-12'),'SKIP');     // 11/12 06:17 morning
  assert.equal(run('2026-11-11T23:40:00Z','2026-11-12'),'SKIP');     // 11/12 08:40 morning
  assert.equal(ledger.length,2);
});

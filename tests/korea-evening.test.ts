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

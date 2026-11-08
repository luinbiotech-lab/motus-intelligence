import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sessionDatePrefix} from '../src/operations/market-deep-collect.js';
import {evaluateEditorialQuality,SESSION_DATE_PREFIX} from '../src/production/editorial-quality.js';
import {koreaEveningWindow} from '../src/operations/internal-live-daily.js';
import {latestCompletedSession} from '../src/operations/market-calendar.js';
import {findPublishedTitle} from '../src/production/publication-operation.js';

// 루인 review 2026-11-08 (#97 item 4): regression cases for the market-close title date exception.
const body='<article><p>'+'코스피와 뉴욕증시 흐름을 정리했다. '.repeat(40)+'</p></article>';
const dateRejected=(title:string)=>evaluateEditorialQuality(title,body).reasons.includes('calendar date exposed in title');

test('year boundary: December 31 and January 2 render as month/day without a year', () => {
  assert.equal(sessionDatePrefix('2026-12-30'),'12월 30일 ');assert.equal(sessionDatePrefix('2027-01-04'),'1월 4일 ');
  assert.equal(dateRejected('12월 30일 코스피 마감, 1.20% 상승 5,100.00…검색 1위 삼성전자 2.0% 상승'),false);
  assert.equal(dateRejected('1월 4일 뉴욕증시 마감, 3대 지수 상승…엔비디아 3% 상승'),false);
  assert.equal(dateRejected('2026년 12월 30일 코스피 마감, 1.20% 상승'),true);
});

test('only one leading session date: a second date, a trailing date or an AI title date stays rejected', () => {
  assert.equal(dateRejected('11월 6일 코스피 마감, 11월 7일 반등 기대'),true);
  assert.equal(dateRejected('코스피 마감, 급락 11월 6일'),true);
  assert.equal(dateRejected('11월 6일 AI 뉴스, 엔비디아 상승'),true);
  assert.equal(dateRejected('11월 6일 코스닥 마감, 급락'),true);
  assert.doesNotMatch('11월 6일 코스피 마감 급락',SESSION_DATE_PREFIX);
});

test('the date is the market session date in that market: US titles carry the New York session, Korea the KRX session', () => {
  // A Saturday-morning (KST) US run covers Friday's New York session; a Monday-morning Korea run covers Friday's KRX session.
  assert.equal(sessionDatePrefix(latestCompletedSession('US','2026-11-06T21:45:00Z').date),'11월 6일 ');
  assert.equal(sessionDatePrefix(latestCompletedSession('KOREA','2026-11-08T21:17:00Z').date),'11월 6일 ');
});

test('holidays: no evening edition on a KRX holiday or weekend; the next session is targeted instead', () => {
  assert.equal(koreaEveningWindow('2026-12-25T08:10:00Z','2026-12-25'),false);   // Christmas (KRX holiday)
  assert.equal(koreaEveningWindow('2026-12-31T08:10:00Z','2026-12-31'),false);   // KRX year-end closing day
  assert.equal(koreaEveningWindow('2026-11-07T08:10:00Z','2026-11-07'),false);   // Saturday
  assert.equal(latestCompletedSession('KOREA','2026-12-25T08:10:00Z').date,'2026-12-24');
});

test('duplicate gate: the same session and headline is caught; another session with the same wording is not', async () => {
  const ops=await mkdtemp(join(tmpdir(),'ops-'));
  const write=async(date:string,title:string)=>{const root=join(ops,date,'korea');await mkdir(root,{recursive:true});
    await writeFile(join(root,'publish-ledger.jsonl'),JSON.stringify({event:'PUBLISHED',category:'KOREA_MARKET',publicPostUrl:`https://motusnova.blogspot.com/${date}.html`})+'\n');
    await writeFile(join(root,'live-unit.json'),JSON.stringify({title}))};
  await write('2026-11-09','11월 9일 코스피 마감, 1.00% 상승 5,100.00…검색 1위 삼성전자 2.0% 상승');
  assert.ok(await findPublishedTitle(ops,'korea','2026-11-10','11월 9일 코스피 마감, 1.00% 상승 5,100.00…검색 1위 삼성전자 2.0% 상승'));
  assert.equal(await findPublishedTitle(ops,'korea','2026-11-10','11월 10일 코스피 마감, 1.00% 상승 5,100.00…검색 1위 삼성전자 2.0% 상승'),null);
});

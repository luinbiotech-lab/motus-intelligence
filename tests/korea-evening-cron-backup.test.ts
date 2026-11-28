import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {koreaEveningWindow,koreaPublicationSlot} from '../src/operations/internal-live-daily.js';
import {scheduledKstTime} from '../src/production/run-record.js';

// MO-8 / MOT-039·049 (2026-11-20): the same-day Korea evening edition had no GitHub schedule of its own. It relied on
// runs dispatched outside the repository and, by accident, on the 10:25 KST retry starting 400+ minutes late.
const BACKUP='40 9 * * 1-5';

test('the Korea evening backup cron is scheduled, mapped to korea, queued with korea and allowed to publish',async()=>{
 const workflow=await readFile('.github/workflows/motus-daily-production.yml','utf8');
 assert.match(workflow,/- cron: '40 9 \* \* 1-5'/);
 assert.equal(scheduledKstTime(BACKUP),'18:40');
 // Category resolution: the backup must never fall through to the default (us).
 assert.match(workflow,/"25 1 \* \* 1-5"\|"40 9 \* \* 1-5"\) CATEGORY=korea ;;/);
 // Concurrency: same queue as the other Korea runs, so it serializes with a 17:10 dispatch instead of racing it.
 assert.match(workflow,/github\.event\.schedule == '40 9 \* \* 1-5'\) && 'korea'/);
 // Live publication gate: an approved schedule only publishes for its own category.
 assert.match(workflow,/"\$SCHEDULE" == "40 9 \* \* 1-5" \) && "\$CATEGORY" == "korea" \)/);
 // Every cron line in the schedule block is mapped to exactly one category in the case statement.
 const crons=[...workflow.matchAll(/- cron: '([^']+)'/g)].map(match=>match[1]??'');
 for(const cron of crons)assert.equal([...workflow.matchAll(new RegExp(`"${cron.replace(/[*]/g,'\\*')}"[|)]`,'g'))].length>=1,true,`cron ${cron} has no category`);
});

test('an on-time or late backup start the same KST day is the evening edition and takes the next trading day slot',()=>{
 // Wednesday 2026-11-18, 18:40 KST on time.
 assert.deepEqual(koreaPublicationSlot('2026-11-18T09:40:00Z','2026-11-18'),{evening:true,slotDate:'2026-11-19'});
 // GitHub often starts schedules hours late (11/18: 434 minutes). Up to 23:55 KST it is still the same evening;
 // a start after midnight is covered by the next test.
 assert.deepEqual(koreaPublicationSlot('2026-11-18T14:55:00Z','2026-11-18'),{evening:true,slotDate:'2026-11-19'});
 // Friday evening fills Monday's slot (MOT-039: the Friday session must not wait for Monday morning).
 assert.deepEqual(koreaPublicationSlot('2026-11-20T09:40:00Z','2026-11-20'),{evening:true,slotDate:'2026-11-23'});
});

test('a backup start after midnight KST is not an evening run (the production run then skips as a retired morning edition)',()=>{
 // 18:40 KST + 434 minutes = 01:54 KST the next day. RUN_DATE in the workflow is `date +%F` in KST, i.e. the next day.
 assert.equal(koreaEveningWindow('2026-11-18T16:54:00Z','2026-11-19'),false);
 assert.deepEqual(koreaPublicationSlot('2026-11-18T16:54:00Z','2026-11-19'),{evening:false,slotDate:'2026-11-19'});
 // Before the 16:40 KST window (cannot happen for an 18:40 cron, guards a future cron edit).
 assert.equal(koreaEveningWindow('2026-11-18T07:00:00Z','2026-11-18'),false);
});

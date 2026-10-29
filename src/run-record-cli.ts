import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {appendRunRecord,buildDailyStatus,currentRunOutcome,delayMinutes,scheduledKstTime} from './production/run-record.js';

// Records this run's timing and outcome, then rebuilds the one-glance daily status. Never fails the job.
const args=process.argv.slice(2),value=(name:string)=>{const index=args.indexOf(name);return index>=0?args[index+1]:undefined},date=value('--date')??'',category=value('--category')??'';
try{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!['ai','us','korea'].includes(category))throw new Error('--date and --category required');
  const operationsRoot=join(process.cwd(),'data','operations'),root=join(operationsRoot,date,category),now=new Date().toISOString(),startedAt=process.env.RUN_STARTED_AT?.trim()||now,schedule=process.env.SCHEDULE_CRON?.trim()||null,scheduledKst=scheduledKstTime(schedule),outcome=await currentRunOutcome(root,startedAt);
  await appendRunRecord(root,{runId:process.env.GITHUB_RUN_ID?.trim()||'LOCAL',attempt:process.env.GITHUB_RUN_ATTEMPT?.trim()||'1',event:process.env.GITHUB_EVENT_NAME?.trim()||'local',schedule,category,operationDate:date,scheduledKst,startedAt,delayMinutes:delayMinutes(scheduledKst,startedAt),...outcome});
  await writeFile(join(operationsRoot,date,'daily-status.md'),await buildDailyStatus(operationsRoot,date,now),'utf8');
  console.log(`run record written for ${date}/${category}: ${outcome.state}`);
}catch(error){console.log('::warning title=Run record not written::'+(error instanceof Error?error.message:String(error)))}

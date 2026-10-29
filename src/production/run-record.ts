import {appendFile,mkdir,readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';

/** One line per production workflow run, persisted through ops-data (jsonl is union-merged). */
export interface RunRecord {
  runId:string;attempt:string;event:string;schedule:string|null;category:string;operationDate:string;
  scheduledKst:string|null;startedAt:string;delayMinutes:number|null;state:string;reason:string;publicPostUrl:string|null;
}

/** UTC cron "M H * * dow" → the KST clock time it targets, e.g. '17 21 * * 0-4' → '06:17'. */
export function scheduledKstTime(cron:string|null|undefined):string|null {
  const match=(cron??'').trim().match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\S+$/);if(!match)return null;
  const minute=Number(match[1]),hour=(Number(match[2])+9)%24;if(minute>59||hour>23)return null;
  return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
}

/** Minutes between the KST target time and the actual start (KST); a start before the target wraps to the previous day's target. */
export function delayMinutes(scheduledKst:string|null,startedAt:string):number|null {
  if(!scheduledKst)return null;const instant=Date.parse(startedAt);if(!Number.isFinite(instant))return null;
  const kst=new Date(instant+9*3600000),started=kst.getUTCHours()*60+kst.getUTCMinutes(),[h,m]=scheduledKst.split(':').map(Number) as [number,number],target=h*60+m;
  return (started-target+1440)%1440;
}

export async function appendRunRecord(categoryRoot:string,record:RunRecord):Promise<void> {
  await mkdir(categoryRoot,{recursive:true});await appendFile(join(categoryRoot,'runs.jsonl'),JSON.stringify(record)+'\n','utf8');
}

export async function readRunRecords(categoryRoot:string):Promise<RunRecord[]> {
  try{return (await readFile(join(categoryRoot,'runs.jsonl'),'utf8')).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line) as RunRecord)}catch{return []}
}

/** The outcome this run produced: a newer latest-run file (written beside an existing PUBLISHED outcome) wins. */
export async function currentRunOutcome(categoryRoot:string,startedAt:string):Promise<{state:string;reason:string;publicPostUrl:string|null}> {
  const read=async(name:string)=>{try{const path=join(categoryRoot,name),info=await stat(path);return {value:JSON.parse(await readFile(path,'utf8')) as Record<string,unknown>,mtime:info.mtimeMs}}catch{return null}};
  const latest=await read('auto-publish-latest-run.json'),main=await read('auto-publish.json'),started=Date.parse(startedAt);
  const pick=latest&&(!Number.isFinite(started)||latest.mtime>=started)?latest.value:main?.value;
  if(!pick)return {state:'NOT_RUN',reason:'no publication outcome file',publicPostUrl:null};
  const gate=pick.gate as {reasons?:unknown}|undefined,reasons=Array.isArray(gate?.reasons)?gate!.reasons as string[]:[];
  const reason=String(pick.reasonCode??pick.reason??pick.error??reasons.join('; ')??'');
  return {state:String(pick.state??'UNKNOWN'),reason:reason.slice(0,300),publicPostUrl:typeof pick.publicPostUrl==='string'?pick.publicPostUrl:null};
}

const CATEGORIES=[['us','미국증시'],['ai','AI 인텔리전스'],['korea','국내증시']] as const;

/** One-glance daily status across categories, built from the (hydrated) operations tree. */
export async function buildDailyStatus(operationsRoot:string,date:string,generatedAt:string):Promise<string> {
  const rows:string[]=[];
  for(const [dir,label] of CATEGORIES){
    const root=join(operationsRoot,date,dir),runs=await readRunRecords(root),ledger=await readLedgerEvents(root),published=ledger.filter(entry=>entry.event==='PUBLISHED').at(-1);
    let state='미실행',reason='',url='';
    if(published){state='발행';url=published.publicPostUrl??''}
    else{const outcome=await outcomeFile(root);if(outcome){state=koreanState(String(outcome.state??''));reason=String(outcome.reasonCode??outcome.reason??outcome.error??(outcome.gate as {reasons?:string[]}|undefined)?.reasons?.join('; ')??'')}}
    const firstDelay=runs.map(run=>run.delayMinutes).find((value):value is number=>typeof value==='number');
    rows.push(`| ${label} | ${state} | ${escapeCell(reason).slice(0,160)} | ${url?`[링크](${url})`:''} | ${runs.length} | ${firstDelay===undefined?'':firstDelay+'분'} |`);
  }
  return [`# MOTUS 일일 상태 ${date}`,'',`갱신: ${generatedAt}`,'','| 카테고리 | 상태 | 사유 | 글 | 실행 수 | 첫 실행 지연 |','| --- | --- | --- | --- | --- | --- |',...rows,'','지연은 예정 시각(KST) 대비 실제 시작까지의 분이다. 수동 실행은 예정 시각이 없어 비워 둔다.',''].join('\n');
}

async function readLedgerEvents(root:string):Promise<Array<{event?:string;publicPostUrl?:string|null}>> {
  try{return (await readFile(join(root,'publish-ledger.jsonl'),'utf8')).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line) as {event?:string;publicPostUrl?:string|null})}catch{return []}
}
async function outcomeFile(root:string):Promise<Record<string,unknown>|null> {
  for(const name of ['auto-publish-latest-run.json','auto-publish.json']){try{return JSON.parse(await readFile(join(root,name),'utf8')) as Record<string,unknown>}catch{}}
  return null;
}
function koreanState(state:string):string {return state==='SKIP'?'SKIP':state==='FAILED'?'실패':state==='PUBLISHED'?'발행':state==='AUTO_PUBLISH_READY'?'발행 가능(시뮬레이션)':state?'HOLD':'미실행'}
function escapeCell(value:string):string {return value.replace(/\|/g,'/').replace(/\s+/g,' ').trim()}

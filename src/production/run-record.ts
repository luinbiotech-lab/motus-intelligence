import {appendFile,mkdir,readFile,readdir,stat} from 'node:fs/promises';
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
  const sitemap=await sitemapStatusLine(join(operationsRoot,'..','traffic'),date);
  return [`# MOTUS 일일 상태 ${date}`,'',`갱신: ${generatedAt}`,'','| 카테고리 | 상태 | 사유 | 글 | 실행 수 | 첫 실행 지연 |','| --- | --- | --- | --- | --- | --- |',...rows,'','지연은 예정 시각(KST) 대비 실제 시작까지의 분이다. 수동 실행은 예정 시각이 없어 비워 둔다.','',sitemap,''].join('\n');
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

/**
 * MO-9: Google sitemap download age from the latest traffic capture on or before the date (data/traffic/<date>/).
 * Older than 48 hours at capture time is a warning; a missing capture or field is written as not measured.
 */
export async function sitemapStatusLine(trafficRoot:string,date:string):Promise<string> {
  let folders:string[]=[];
  try{folders=(await readdir(trafficRoot)).filter(name=>/^\d{4}-\d{2}-\d{2}$/.test(name)&&name<=date).sort().reverse().slice(0,3)}catch{/* none */}
  for(const folder of folders){
    try{
      const input=JSON.parse(await readFile(join(trafficRoot,folder,'traffic-input.json'),'utf8')) as {collectedAt?:string;indexStatus?:{state?:string;sitemaps?:unknown}};
      if(input.indexStatus?.state!=='PASS')continue;
      const f=sitemapFreshness(input.indexStatus.sitemaps,input.collectedAt??'');
      if(f.state==='UNKNOWN')return `구글 사이트맵: 측정 안 됨(${folder} 수집에 마지막 다운로드 시각 없음)`;
      const kst=(iso:string)=>new Date(Date.parse(iso)+9*3600000).toISOString().slice(5,16).replace('T',' ').replace('-','/');
      return f.state==='STALE'
        ?`**경고: 구글 사이트맵을 ${f.hours}시간째 다시 내려받지 않았다** (마지막 ${kst(f.lastDownloaded!)} KST, 기준 ${f.maxHours}시간, ${folder} 수집 ${kst(f.checkedAt)} KST 기준)`
        :`구글 사이트맵: 정상(마지막 다운로드 ${kst(f.lastDownloaded!)} KST, ${folder} 수집 기준 ${f.hours}시간 전)`;
    }catch{/* next */}
  }
  return '구글 사이트맵: 측정 안 됨(최근 3일 traffic-input 없음)';
}

/**
 * Sitemap freshness (MO-9, MOT-035 follow-up): Google's last sitemap download older than maxHours is a warning.
 * Kept here (no imports) because the ops-data persist tool ships run-record.js alone (motus-*-production.yml).
 */
export interface SitemapFreshness {state:'FRESH'|'STALE'|'UNKNOWN';lastDownloaded:string|null;hours:number|null;maxHours:number;checkedAt:string}
export function sitemapFreshness(sitemaps:unknown,checkedAt:string,maxHours=48):SitemapFreshness {
  const checked=Date.parse(checkedAt);
  const times=(Array.isArray(sitemaps)?sitemaps:[]).map(item=>typeof (item as {lastDownloaded?:unknown})?.lastDownloaded==='string'?(item as {lastDownloaded:string}).lastDownloaded:'').filter(value=>Number.isFinite(Date.parse(value))).sort((a,b)=>Date.parse(a)-Date.parse(b));
  const last=times.at(-1)??null;
  if(!last||!Number.isFinite(checked))return {state:'UNKNOWN',lastDownloaded:last,hours:null,maxHours,checkedAt};
  const hours=Math.round((checked-Date.parse(last))/360000)/10;
  return {state:hours>maxHours?'STALE':'FRESH',lastDownloaded:last,hours,maxHours,checkedAt};
}

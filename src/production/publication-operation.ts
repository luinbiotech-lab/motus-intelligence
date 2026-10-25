import {appendFile,mkdir,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import type {DailyCategory} from '../operations/daily-orchestrator.js';

export interface PublishLedgerEntry {
  publicationIdentity:string;identity?:string;attemptId:string;operationDate:string;category:DailyCategory;at:string;gateState:string;
  publishAttempted:boolean;duplicateState:'PENDING'|'RESOLVED'|'CONFLICT';finalState:string;reason:string;commitSha:string;
  event:'LOCK_ACQUIRED'|'LOCK_REJECTED'|'GATE_HOLD'|'PUBLISH_ATTEMPT'|'PUBLISHED'|'FAILED';
  postId:string|null;publicPostUrl:string|null;fingerprint:string;detail:string;
  /** Market session (or AI event) date the published unit covers. Absent on legacy entries. */
  sessionDate?:string;
}
type PublishLedgerInput=Omit<PublishLedgerEntry,'publicationIdentity'|'attemptId'|'gateState'|'publishAttempted'|'duplicateState'|'finalState'|'reason'|'commitSha'>&{identity:string;gateState?:string;publishAttempted?:boolean;duplicateState?:PublishLedgerEntry['duplicateState'];finalState?:string;reason?:string};

export const publicationIdentity=(operationDate:string,category:DailyCategory)=>`${operationDate}|${category}`;
export function persistedPublicationDecision(entries:PublishLedgerEntry[],operationDate:string,category:DailyCategory){const identity=publicationIdentity(operationDate,category),entry=entries.find(item=>(item.publicationIdentity??item.identity)===identity&&item.event==='PUBLISHED');return entry?{state:'SKIP' as const,reasonCode:'ALREADY_PUBLISHED_IN_PERSISTED_LEDGER',identity,postId:entry.postId,publicPostUrl:entry.publicPostUrl}:{state:'CONTINUE' as const,reasonCode:null,identity,postId:null,publicPostUrl:null}}

export async function acquirePublicationLock(root:string,operationDate:string,category:DailyCategory):Promise<()=>Promise<void>> {
  const lockPath=join(root,'.publish-lock');
  try { await mkdir(lockPath); }
  catch(error) { if((error as NodeJS.ErrnoException).code==='EEXIST')throw new Error(`publication lock already held for ${publicationIdentity(operationDate,category)}`);throw error; }
  return async()=>{await rm(lockPath,{recursive:true,force:true})};
}

export async function appendPublishLedger(root:string,entry:PublishLedgerInput):Promise<void> {
  await mkdir(root,{recursive:true});
  const record:PublishLedgerEntry={publicationIdentity:entry.identity,identity:entry.identity,attemptId:process.env.GITHUB_RUN_ID?.trim()||`${entry.operationDate}-${entry.category}-${Date.parse(entry.at)}`,operationDate:entry.operationDate,category:entry.category,at:entry.at,gateState:entry.gateState??(entry.event==='GATE_HOLD'?'HOLD':'PENDING'),publishAttempted:entry.publishAttempted??['PUBLISH_ATTEMPT','PUBLISHED','FAILED'].includes(entry.event),duplicateState:entry.duplicateState??(entry.event==='PUBLISHED'?'RESOLVED':'PENDING'),finalState:entry.finalState??entry.event,reason:entry.reason??entry.detail,commitSha:process.env.GITHUB_SHA?.trim()||'LOCAL',event:entry.event,postId:entry.postId,publicPostUrl:entry.publicPostUrl,fingerprint:entry.fingerprint,detail:entry.detail,...(entry.sessionDate?{sessionDate:entry.sessionDate}:{})};
  await appendFile(join(root,'publish-ledger.jsonl'),JSON.stringify(record)+'\n','utf8');
}

export async function readPublishLedger(root:string):Promise<PublishLedgerEntry[]> {
  try{return (await readFile(join(root,'publish-ledger.jsonl'),'utf8')).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line) as PublishLedgerEntry)}catch{return []}
}

/**
 * Finds an already PUBLISHED operation of the same category that covers the same session date,
 * regardless of the operationDate it ran under. Uses the ledger's sessionDate when recorded. A legacy
 * entry without sessionDate is resolved from the persisted live unit only when that unit is provably the
 * published one (its content fingerprint equals the ledger fingerprint); a unit re-collected by a later
 * rerun is never trusted.
 */
export async function findPublishedSameSession(operationsRoot:string,categoryDir:string,category:DailyCategory,sessionDate:string):Promise<{operationDate:string;postId:string|null;publicPostUrl:string|null}|null> {
  let dates:string[];
  try{dates=(await readdir(operationsRoot)).filter(name=>/^\d{4}-\d{2}-\d{2}$/.test(name)).sort()}catch{return null}
  for(const operationDate of dates){
    const root=join(operationsRoot,operationDate,categoryDir),published=(await readPublishLedger(root)).filter(entry=>entry.event==='PUBLISHED'&&entry.category===category);
    if(!published.length)continue;
    let unit:{observedDate:string;fingerprint:string}|null=null;
    try{const raw=JSON.parse(await readFile(join(root,'live-unit.json'),'utf8')) as {observedDate?:unknown;contentFingerprint?:unknown};if(typeof raw.observedDate==='string'&&typeof raw.contentFingerprint==='string'&&raw.contentFingerprint)unit={observedDate:raw.observedDate,fingerprint:'sha256:'+raw.contentFingerprint}}catch{unit=null}
    for(const entry of published){
      const session=entry.sessionDate??(unit&&unit.fingerprint===entry.fingerprint?unit.observedDate:null);
      if(session===sessionDate)return {operationDate,postId:entry.postId,publicPostUrl:entry.publicPostUrl};
    }
  }
  return null;
}

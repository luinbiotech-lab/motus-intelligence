import {appendFile,mkdir,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import type {DailyCategory} from '../operations/daily-orchestrator.js';

export interface PublishLedgerEntry {
  publicationIdentity:string;identity?:string;attemptId:string;operationDate:string;category:DailyCategory;at:string;gateState:string;
  publishAttempted:boolean;duplicateState:'PENDING'|'RESOLVED'|'CONFLICT';finalState:string;reason:string;commitSha:string;
  event:'LOCK_ACQUIRED'|'LOCK_REJECTED'|'GATE_HOLD'|'PUBLISH_ATTEMPT'|'PUBLISHED'|'FAILED';
  postId:string|null;publicPostUrl:string|null;fingerprint:string;detail:string;
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
  const record:PublishLedgerEntry={publicationIdentity:entry.identity,identity:entry.identity,attemptId:process.env.GITHUB_RUN_ID?.trim()||`${entry.operationDate}-${entry.category}-${Date.parse(entry.at)}`,operationDate:entry.operationDate,category:entry.category,at:entry.at,gateState:entry.gateState??(entry.event==='GATE_HOLD'?'HOLD':'PENDING'),publishAttempted:entry.publishAttempted??['PUBLISH_ATTEMPT','PUBLISHED','FAILED'].includes(entry.event),duplicateState:entry.duplicateState??(entry.event==='PUBLISHED'?'RESOLVED':'PENDING'),finalState:entry.finalState??entry.event,reason:entry.reason??entry.detail,commitSha:process.env.GITHUB_SHA?.trim()||'LOCAL',event:entry.event,postId:entry.postId,publicPostUrl:entry.publicPostUrl,fingerprint:entry.fingerprint,detail:entry.detail};
  await appendFile(join(root,'publish-ledger.jsonl'),JSON.stringify(record)+'\n','utf8');
}

export async function readPublishLedger(root:string):Promise<PublishLedgerEntry[]> {
  try{return (await readFile(join(root,'publish-ledger.jsonl'),'utf8')).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line) as PublishLedgerEntry)}catch{return []}
}

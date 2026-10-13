import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import type {SplitPublicationUnit} from './intelligence/split-daily-production.js';
import {evaluateAutoPublishGate,executeAutoPublish,type AutoPublishResult} from './production/auto-publish.js';
import {revalidateProductionEvidence,type ProductionVerificationArtifact} from './production/verification-artifact.js';
import type {InternalSourceAuditEntry} from './operations/internal-live-daily.js';
import {GoogleBloggerApiAdapter,type BloggerPublishingConfig} from './services/blogger.js';

const args=process.argv.slice(2);const value=(flag:string)=>{const index=args.indexOf(flag);return index>=0?args[index+1]:undefined};
const date=value('--date')??'',name=value('--category')??'';
if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!['ai','us','korea'].includes(name))throw new Error('--date YYYY-MM-DD and --category ai|us|korea required');
const root=join(process.cwd(),'data','operations',date,name),unitPath=join(root,'live-unit.json'),verificationPath=join(root,'verification.json');await mkdir(root,{recursive:true});
if(!existsSync(unitPath)||!existsSync(verificationPath)){await finish({state:'HOLD',reason:'verified live unit or verification artifact missing',publishCallCount:0});}
const unit=JSON.parse(await readFile(unitPath,'utf8')) as SplitPublicationUnit;
const auditPath=join(root,'live-source-audit.json');
if(!existsSync(auditPath))await finish({state:'HOLD',reason:'live source audit missing',publishCallCount:0});
let candidate;
try {
 const verification=JSON.parse(await readFile(verificationPath,'utf8')) as ProductionVerificationArtifact;
 const audit=JSON.parse(await readFile(auditPath,'utf8')) as {schemaVersion:string;sourceMode:string;category:string;entries:InternalSourceAuditEntry[]};
 const check=revalidateProductionEvidence(unit,verification,audit,new Date().toISOString());
 if(!check.valid)await finish({state:'HOLD',reason:check.reasons.join('; '),publishCallCount:0});
 candidate=check.candidate;
}catch{await finish({state:'HOLD',reason:'verification evidence invalid',publishCallCount:0});}
const execute=args.includes('--execute');
if(!execute||process.env.MOTUS_LIVE_PUBLISH_ENABLED!=='true'){const gate=evaluateAutoPublishGate(candidate);await finish({state:gate.state,gate,publishCallCount:0,execution:'SIMULATED',reason:candidate.duplicateUncertainty?'PENDING_REMOTE_LOOKUP':undefined,commerce:{enabled:false}});}
const required=['BLOGGER_BLOG_ID','BLOGGER_CLIENT_ID','BLOGGER_CLIENT_SECRET','BLOGGER_REFRESH_TOKEN'] as const;
const missing=required.filter(key=>!process.env[key]?.trim());if(missing.length)await finish({state:'HOLD',reason:`required Blogger credentials missing: ${missing.join(', ')}`,publishCallCount:0});
const raw=JSON.parse(await readFile(resolve('config/publishing.json'),'utf8')) as {blogger:BloggerPublishingConfig},config={...raw.blogger,blogId:process.env.BLOGGER_BLOG_ID!.trim(),credentialAvailable:true,publishAsDraft:true};
const google=new GoogleBloggerApiAdapter(),adapter={findMatches:(input:{title:string;label:string})=>google.findMatchingPosts(input,config),insertDraft:(input:{title:string;content:string;labels:string[]})=>google.insertDraftContent(input,config),readPost:(id:string)=>google.readPost(id,config),publishDraft:(id:string)=>google.publishDraftPost(id,config),fetchPublic:async(url:string)=>{const response=await fetch(url,{redirect:'follow'});return {status:response.status,body:await response.text()}}};
const result=await executeAutoPublish(candidate,adapter);await writeFile(join(root,'auto-publish.json'),JSON.stringify(result,null,2),'utf8');if(result.state==='PUBLISHED')await persist(result,unit);console.log(JSON.stringify({state:result.state,draftPostId:result.draftPostId,publicPostUrl:result.publicPostUrl,publishCallCount:result.publishCallCount}));

async function finish(value:unknown):Promise<never>{await writeFile(join(root,'auto-publish.json'),JSON.stringify(value,null,2),'utf8');console.log(JSON.stringify(value));process.exit(0);}
async function persist(result:AutoPublishResult,current:SplitPublicationUnit){const searchPath=join(process.cwd(),'data','search',date,'auto-registrations.json'),libraryPath=join(process.cwd(),'data','library','publications','auto-publications.json'),weeklyPath=join(process.cwd(),'data','operations',date,'weekly-monthly-feed-auto.json'),pdfPath=join(process.cwd(),'data','reports','daily',date,name,'candidate.json');await Promise.all([upsert(searchPath,result.searchRegistration,'publicationId'),upsert(libraryPath,{...result.libraryRegistration,publicationId:current.publicationId,publicPostUrl:result.publicPostUrl,publishedAt:result.publishedAt},'idempotencyKey'),upsert(weeklyPath,{...result.weeklyFeed,category:current.category,publicationId:current.publicationId,publicPostUrl:result.publicPostUrl,publishedAt:result.publishedAt},'idempotencyKey'),writeObject(pdfPath,{...result.pdfCandidate,issueDate:current.observedDate,articleFingerprint:current.contentFingerprint,state:'PENDING',visibility:'PRIVATE'})]);}
async function upsert(path:string,item:unknown,key:string){if(!item)return;let values:Array<Record<string,unknown>>=[];try{values=JSON.parse(await readFile(path,'utf8')) as Array<Record<string,unknown>>}catch{}const record=item as Record<string,unknown>,index=values.findIndex(value=>value[key]===record[key]);if(index>=0)values[index]=record;else values.push(record);await writeObject(path,values);}
async function writeObject(path:string,value:unknown){await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,JSON.stringify(value,null,2),'utf8');}

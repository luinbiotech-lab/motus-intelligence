import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { GoogleDriveReadOnlyAdapter,defaultDriveFolderRegistry,duplicateDecision } from './reports/report-review-storage.js';
import type { PdfArtifact } from './reports/pdf-production.js';

const args=process.argv.slice(2);const value=(flag:string)=>{const index=args.indexOf(flag);return index>=0?args[index+1]:undefined;};
if(value('--provider')!=='google-drive'||!args.includes('--check'))throw new Error('USAGE: --provider google-drive --check');
const adapter=new GoogleDriveReadOnlyAdapter();const status=await adapter.status();const root=resolve('data/report-storage');await mkdir(root,{recursive:true});const registry=defaultDriveFolderRegistry();const candidates=await localArtifacts();
const uploadPlan={generatedAt:new Date().toISOString(),provider:'GOOGLE_DRIVE',writeEnabled:false,publicShareEnabled:false,plannedUploads:[],uploadCount:0,permissionChangeCount:0,artifacts:candidates.map(artifact=>({artifactId:artifact.artifactId,uniqueKey:[artifact.reportType,artifact.issueDate,artifact.periodStart,artifact.periodEnd,artifact.contentFingerprint].join(':'),decision:duplicateDecision([],artifact).decision,state:'BLOCKED_WRITE_DISABLED'}))};
await Promise.all([writeFile(resolve(root,'provider-status.json'),JSON.stringify(status,null,2),'utf8'),writeFile(resolve(root,'folder-registry.json'),JSON.stringify({provider:'GOOGLE_DRIVE',entries:registry},null,2),'utf8'),writeFile(resolve(root,'upload-plan.json'),JSON.stringify(uploadPlan,null,2),'utf8')]);console.log(JSON.stringify(status,null,2));

async function localArtifacts():Promise<PdfArtifact[]>{const files=['data/reports/review/daily/ai/artifact.json','data/reports/review/daily/us/artifact.json','data/reports/review/daily/korea/artifact.json','data/reports/review/weekly/artifact.json'];const result:PdfArtifact[]=[];for(const file of files)if(existsSync(file))result.push(JSON.parse(await readFile(file,'utf8')) as PdfArtifact);return result;}

import { copyFile,mkdir,readFile,writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join,relative,resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { buildPeriodicPdfFoundations,canonicalReportFileName,type PdfArtifact,type PdfValidationResult } from './reports/pdf-production.js';
import { createPdfHumanReviewPackage,createReportManifest,duplicateDecision,type PdfHumanReviewPackage,type ReportManifestEntry } from './reports/report-review-storage.js';

const python=resolvePython();const reviewRoot=resolve('data/reports/review');
await run(process.execPath,[resolve('dist/src/report-production-cli.js'),'--type','weekly']);
const weekly=buildPeriodicPdfFoundations().weekly;const weeklyFolder=canonicalReportFileName('WEEKLY_INTELLIGENCE',weekly.issueDate,weekly.periodStart).replace(/^motus-weekly-|\.pdf$/g,'').toUpperCase();
const sources=[
  {source:'data/reports/daily/2026-09-29/ai',target:'daily/ai',title:'AI Daily PDF Review'},
  {source:'data/reports/daily/2026-09-30/us',target:'daily/us',title:'U.S. Market Daily PDF Review'},
  {source:'data/reports/daily/2026-09-30/korea',target:'daily/korea',title:'Korea Market Daily PDF Review'},
  {source:`data/reports/weekly/${weeklyFolder}`,target:'weekly',title:'Weekly Intelligence Preview Review'}
];
const manifest:ReportManifestEntry[]=[];const results=[];
for(const entry of sources){const sourceRoot=resolve(entry.source);const targetRoot=join(reviewRoot,entry.target);await mkdir(targetRoot,{recursive:true});const artifact=JSON.parse(await readFile(join(sourceRoot,'artifact.json'),'utf8')) as PdfArtifact;const validation=JSON.parse(await readFile(join(sourceRoot,'validation.json'),'utf8')) as PdfValidationResult;const existingPath=join(targetRoot,'artifact.json');if(existsSync(existingPath)){const existing=JSON.parse(await readFile(existingPath,'utf8')) as PdfArtifact;const decision=duplicateDecision([existing],artifact);if(decision.decision==='NEW_VERSION_REQUIRED')throw new Error(`IMMUTABLE_ARTIFACT_NEW_VERSION_REQUIRED:${artifact.reportType}:v${decision.nextVersion}`);}
  const pdf=join(targetRoot,'report.pdf');const contact=join(targetRoot,'contact-sheet.png');await copyFile(join(sourceRoot,'report.pdf'),pdf);await run(python,[resolve('scripts/render-report-contact-sheet.py'),'--pdf',pdf,'--output',contact,'--title',entry.title]);const review=createPdfHumanReviewPackage(artifact,validation,relative(process.cwd(),contact).replace(/\\/g,'/'));const reviewPath=join(targetRoot,'review.json');const priorReview=existsSync(reviewPath)?JSON.parse(await readFile(reviewPath,'utf8')) as PdfHumanReviewPackage:null;if(!priorReview||priorReview.reviewState==='PENDING')await writeFile(reviewPath,JSON.stringify(review,null,2),'utf8');const reviewArtifact={...artifact,localPath:relative(process.cwd(),pdf).replace(/\\/g,'/'),reviewPackagePath:relative(process.cwd(),reviewPath).replace(/\\/g,'/'),contactSheetPath:review.contactSheetPath,immutable:true,version:1};await Promise.all([writeFile(existingPath,JSON.stringify(reviewArtifact,null,2),'utf8'),copyFile(join(sourceRoot,'validation.json'),join(targetRoot,'validation.json'))]);manifest.push(createReportManifest(reviewArtifact));results.push({reportType:artifact.reportType,pages:artifact.pageCount,bytes:artifact.fileSizeBytes,validation:validation.status,reviewState:priorReview&&priorReview.reviewState!=='PENDING'?priorReview.reviewState:'PENDING',contactSheet:review.contactSheetPath});}
await writeFile(join(reviewRoot,'report-manifest.json'),JSON.stringify({generatedAt:new Date().toISOString(),artifacts:manifest,publicArtifactCount:0,commerce:{enabled:false},bloggerCalls:{insert:0,patch:0,publish:0,theme:0,menu:0}},null,2),'utf8');
console.log(JSON.stringify({results,monthly:{reviewState:'HOLD',pdfGenerated:false},publicDistribution:false,publicUrlCount:0,uploadCount:0,permissionChangeCount:0,bloggerCalls:{insert:0,patch:0,publish:0,theme:0,menu:0},commerce:{enabled:false}},null,2));

function resolvePython():string {const configured=process.env.MOTUS_PYTHON?.trim();if(configured)return configured;const bundled=join(homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','python','python.exe');return existsSync(bundled)?bundled:'python';}
function run(command:string,args:string[]):Promise<void>{return new Promise((resolvePromise,reject)=>{const child=spawn(command,args,{stdio:'inherit',cwd:process.cwd()});child.on('error',reject);child.on('exit',code=>code===0?resolvePromise():reject(new Error(`${command} failed with exit code ${code}`)));});}

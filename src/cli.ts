import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runPipeline } from './services/pipeline.js';
import type { EvidencePackage, ReportRecord, ReviewActionInput, Rule, Source } from './domain/models.js';
import { applyReviewActions, buildMachineHumanDiff, buildPublishReadyDraft, buildReviewSheet, createReviewAction } from './services/review.js';
import { renderBrokerageReportOnDemand, renderDailyEditorial } from './services/editorial.js';
import { renderA4MasterOnDemand } from './services/a4-visual.js';
async function main() {
  const args=process.argv.slice(2);
  const sample=args[0]==='--sample';
  if(args[0]==='--review') return await writeReviewSheet(args[1]);
  if(args[0]==='--apply-review-actions') return await applyReviewActionFile(args[1],args[2],args[3]);
  if(args[0]==='--editorial') return await writeEditorial(args[1],args[2]);
  if(args[0]==='--brokerage-report') return await writeBrokerageReport(args[1],args[2]);
  if(args[0]==='--a4-master') return await writeA4Master(args[1],args[2],args.includes('--regenerate'));
  if((sample&&args.length!==1)||(!sample&&(args.length!==2||args[0]!=='--input'))) throw new Error('사용법: npm run sample 또는 npm run report -- --input data/manual/day.json');
  const path=sample?'data/fixtures/sample-day.json':args[1]!;
  const read=async(p:string):Promise<unknown>=>JSON.parse((await readFile(resolve(p),'utf8')).replace(/^\uFEFF/,''));
  const [raw,sources,rules]=await Promise.all([read(path),read('config/sources.json'),read('config/us-korea-rules.v1.json')]);
  const result=runPipeline(raw,sources as Source[],rules as Rule[]);
  await Promise.all([mkdir('data/reports',{recursive:true}),mkdir('data/evidence',{recursive:true})]);
  const prefix=result.report.reportId;
  await Promise.all([writeFile(`data/reports/${prefix}.md`,result.markdown),writeFile(`data/reports/${prefix}.json`,JSON.stringify(result.report,null,2)),writeFile(`data/evidence/${prefix}.json`,JSON.stringify(result.evidence,null,2))]);
  console.log(JSON.stringify({status:result.operationalStatus,reportId:prefix,sample:result.report.sample,publishStatus:result.evidence.publishStatus,issues:result.evidence.validationResult.issues,stages:result.stages,files:[`data/reports/${prefix}.md`,`data/reports/${prefix}.json`,`data/evidence/${prefix}.json`]},null,2));
  process.exitCode=result.operationalStatus==='BLOCKED'?3:result.operationalStatus==='FAILED'?2:0;
}
async function writeReviewSheet(evidencePath:string|undefined) {
  if(!evidencePath) throw new Error('사용법: node dist/src/cli.js --review data/evidence/report.json');
  const evidence=JSON.parse(await readFile(resolve(evidencePath),'utf8')) as EvidencePackage;
  const sheet=buildReviewSheet(evidence);
  const dir=`data/reviews/${evidence.reportMetadata.tradingDate}`;
  await mkdir(dir,{recursive:true});
  const jsonPath=`${dir}/${evidence.reportId}-review.json`;
  const mdPath=`${dir}/${evidence.reportId}-review.md`;
  await writeFile(jsonPath,JSON.stringify(sheet,null,2));
  await writeFile(mdPath,reviewSheetMarkdown(sheet));
  console.log(JSON.stringify({status:'PASS',reportId:evidence.reportId,files:[mdPath,jsonPath],approvalStatus:sheet.approvalStatus,blocked:sheet.blocked,reviewItems:sheet.items.length},null,2));
}
async function applyReviewActionFile(evidencePath:string|undefined,reportPath:string|undefined,actionsPath:string|undefined) {
  if(!evidencePath||!reportPath||!actionsPath) throw new Error('사용법: node dist/src/cli.js --apply-review-actions data/evidence/report.json data/reports/report.json actions.json');
  const evidence=JSON.parse(await readFile(resolve(evidencePath),'utf8')) as EvidencePackage;
  const report=JSON.parse(await readFile(resolve(reportPath),'utf8')) as ReportRecord;
  const actionInputs=JSON.parse(await readFile(resolve(actionsPath),'utf8')) as ReviewActionInput[];
  const actions=actionInputs.map(input=>createReviewAction(evidence,input));
  const reviewed=applyReviewActions(evidence,actions);
  const draft=buildPublishReadyDraft(report,reviewed,actions);
  const diff=buildMachineHumanDiff(report,draft,actions);
  const dir=`data/publish-ready/${report.tradingDate}`;
  await mkdir(dir,{recursive:true});
  const files=[`${dir}/${report.reportId}-reviewed-evidence.json`,`${dir}/${report.reportId}-report.md`,`${dir}/${report.reportId}-report.json`,`${dir}/${report.reportId}-diff.json`,`${dir}/${report.reportId}-actions.json`];
  await Promise.all([
    writeFile(files[0]!,JSON.stringify(reviewed,null,2)),
    writeFile(files[1]!,draft.markdown),
    writeFile(files[2]!,JSON.stringify(draft,null,2)),
    writeFile(files[3]!,JSON.stringify(diff,null,2)),
    writeFile(files[4]!,JSON.stringify(actions,null,2))
  ]);
  console.log(JSON.stringify({status:'PASS',reportId:report.reportId,approvalStatus:reviewed.approvalStatus,publishAllowed:draft.publishAllowed,files},null,2));
}
async function writeEditorial(reportPath:string|undefined,evidencePath:string|undefined) {
  if(!reportPath||!evidencePath) throw new Error('사용법: node dist/src/cli.js --editorial data/reports/report.json data/evidence/report.json');
  const report=JSON.parse(await readFile(resolve(reportPath),'utf8')) as ReportRecord;
  const evidence=JSON.parse(await readFile(resolve(evidencePath),'utf8')) as EvidencePackage;
  const editorial=renderDailyEditorial(report,evidence);
  const dir=`data/editorial/${report.tradingDate}`;
  await mkdir(dir,{recursive:true});
  const files=[`${dir}/${report.reportId}-blogger.md`,`${dir}/${report.reportId}-blogger.json`,`${dir}/${report.reportId}-naver.json`,`${dir}/${report.reportId}-opportunities.json`,`${dir}/${report.reportId}-terms.json`];
  await Promise.all([
    writeFile(files[0]!,editorial.bloggerMarkdown),
    writeFile(files[1]!,JSON.stringify({seo:editorial.seo,body:editorial.bloggerMarkdown,terms:editorial.terms},null,2)),
    writeFile(files[2]!,JSON.stringify(editorial.naver,null,2)),
    writeFile(files[3]!,JSON.stringify(editorial.opportunities,null,2)),
    writeFile(files[4]!,JSON.stringify(editorial.terms,null,2))
  ]);
  console.log(JSON.stringify({status:'PASS',tradingDate:report.tradingDate,files,opportunities:editorial.opportunities.map(item=>({contentType:item.contentType,recommended:item.recommended})),naver:editorial.naver},null,2));
}
async function writeBrokerageReport(reportPath:string|undefined,evidencePath:string|undefined) {
  if(!reportPath||!evidencePath) throw new Error('사용법: node dist/src/cli.js --brokerage-report data/reports/report.json data/evidence/report.json');
  const report=JSON.parse(await readFile(resolve(reportPath),'utf8')) as ReportRecord;
  const evidence=JSON.parse(await readFile(resolve(evidencePath),'utf8')) as EvidencePackage;
  const output=await renderBrokerageReportOnDemand(report,evidence,`data/brokerage/${report.tradingDate}`);
  console.log(JSON.stringify({status:'PASS',reportId:output.reportId,cached:output.cached,file:`data/brokerage/${report.tradingDate}/${report.reportId}-${output.rendererVersion}.md`,naver:output.naver},null,2));
}
async function writeA4Master(reportPath:string|undefined,evidencePath:string|undefined,regenerate:boolean) {
  if(!reportPath||!evidencePath) throw new Error('사용법: node dist/src/cli.js --a4-master data/reports/report.json data/evidence/report.json [--regenerate]');
  const report=JSON.parse(await readFile(resolve(reportPath),'utf8')) as ReportRecord;
  const evidence=JSON.parse(await readFile(resolve(evidencePath),'utf8')) as EvidencePackage;
  const output=await renderA4MasterOnDemand(report,evidence,`data/a4-master/${report.tradingDate}`,{audience:'admin',action:'A4_REPORT_RENDER'},{regenerate});
  console.log(JSON.stringify({status:'PASS',reportId:output.reportId,cached:output.cached,html:output.htmlPath,pdf:output.pdfPath,png:output.pngPath,naverPackage:output.naverPackagePath,admin:output.adminPath,onePage:output.layout.onePage,qrTargetUrl:output.layout.qrTargetUrl},null,2));
}
function reviewSheetMarkdown(sheet:ReturnType<typeof buildReviewSheet>) {
  return `# Review Sheet — ${sheet.reportId}

- tradingDate: ${sheet.tradingDate}
- generatedAt: ${sheet.generatedAt}
- approvalStatus: ${sheet.approvalStatus}
- blocked: ${sheet.blocked}
- VERIFIED: ${sheet.counts.VERIFIED}
- PARTIALLY_VERIFIED: ${sheet.counts.PARTIALLY_VERIFIED}
- CONFLICT: ${sheet.counts.CONFLICT}
- UNVERIFIED: ${sheet.counts.UNVERIFIED}
- REVIEW_REQUIRED: ${sheet.counts.REVIEW_REQUIRED_QUEUE}

## Priority Items

${sheet.items.filter(item=>item.verificationStatus!=='VERIFIED'||item.priority>=50).map(item=>`### ${item.claimId}

- status: ${item.verificationStatus}
- confidenceScore: ${item.confidenceScore}
- claimType: ${item.claimType}
- informationType: ${item.informationType}
- sourceTier: ${item.sourceTier}
- evidenceIds: ${item.evidenceIds.join(', ') || 'n/a'}
- recommendedAction: ${item.recommendedAction}
- reason: ${item.reason}

${item.claimText}
`).join('\n') || '- 우선 검수 항목 없음'}

## VERIFIED Summary

- count: ${sheet.verifiedSummary.count}
- sampleClaimIds: ${sheet.verifiedSummary.sampleClaimIds.join(', ') || 'n/a'}
`;
}
main().catch(error=>{console.error(JSON.stringify({status:'BLOCKED',message:String(error)}));process.exitCode=3;});

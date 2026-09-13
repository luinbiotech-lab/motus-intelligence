import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runPipeline } from './services/pipeline.js';
import type { Rule, Source } from './domain/models.js';
async function main() {
  const args=process.argv.slice(2);
  const sample=args[0]==='--sample';
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
main().catch(error=>{console.error(JSON.stringify({status:'BLOCKED',message:String(error)}));process.exitCode=3;});

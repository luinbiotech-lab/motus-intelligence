import {writeFileSync,mkdirSync} from 'node:fs';
const {collectKoreaDeep}=await import(process.cwd()+'/dist/src/operations/market-deep-collect.js');
const {deepSection}=await import(process.cwd()+'/dist/src/publishers/editorial-article.js');
const audit=[];
const deep=await collectKoreaDeep({sessionDate:'2026-10-28',operationDate:'2026-10-29',at:new Date().toISOString(),fetcher:fetch,audit,kospiClose:6012.44,kospiChangePct:6.63});
mkdirSync('../diag/diag/out7',{recursive:true});
writeFileSync('../diag/diag/out7/korea-deep.json',JSON.stringify({title:deep.title,lead:deep.composition.leadAddition,sections:deep.composition.sections,html:deep.composition.sections.map(deepSection).join('\n'),audit},null,1));

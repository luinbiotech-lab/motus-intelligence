import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { dirname,join } from 'node:path';
import type { EditorialMemoryStore,KnowledgeConflict,SourceOperationalProfile } from './retrieval.js';
import type { SampleRetrievalRun } from './retrieval-production.js';

export async function readEditorialMemory(path='data/library/memory/editorial-memory.json'):Promise<EditorialMemoryStore|null>{try{return JSON.parse(await readFile(path,'utf8')) as EditorialMemoryStore;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}}
export async function writeRetrievalPersistence(input:{memory:EditorialMemoryStore;sourceOperational:SourceOperationalProfile[];conflicts:KnowledgeConflict[];run:SampleRetrievalRun;root?:string;libraryRoot?:string}):Promise<string[]> {
  const root=input.root??`data/retrieval/${input.run.generatedAt.slice(0,10)}`;const libraryRoot=input.libraryRoot??'data/library/memory';const files:Record<string,unknown>={
    [join(libraryRoot,'editorial-memory.json')]:input.memory,[join(libraryRoot,'source-operational.json')]:input.sourceOperational,[join(libraryRoot,'conflicts.json')]:input.conflicts,
    [join(root,'timeline','openai.json')]:input.run.openAITimeline,[join(root,'retrospective','nvidia.json')]:input.run.nvidiaRetrospective,[join(root,'retrospective','agentic-ai.json')]:input.run.themeRetrospective,
    [join(root,'retrospective','samsung-securities.json')]:input.run.samsungSecuritiesHistory,[join(root,'precedents','openai-dots.json')]:input.run.openAIPrecedents,
    [join(root,'operator','retrieval-operator.json')]:input.run.operator,[join(root,'operator','evergreen-review.json')]:input.run.evergreenReviews,[join(root,'operator','prior-coverage.json')]:input.run.priorCoverage,
    [join(root,'schema.json')]:{schemaVersion:input.run.operator.schemaVersion,generatedAt:input.run.generatedAt,externalActions:input.run.operator.externalActions,commerce:input.run.operator.commerce}
  };const written:string[]=[];for(const [path,value] of Object.entries(files)){await mkdir(dirname(path),{recursive:true});await writeFile(path,`${JSON.stringify(value,null,2)}\n`,'utf8');written.push(path);}return written;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createFirstSplitDailyProductionRun} from '../src/intelligence/split-daily-production.js';
import type {KoreaMarketDailyViewModel,USMarketDailyViewModel} from '../src/intelligence/daily-masters.js';
import {buildUSEditorialTitleCandidates,parseFredCsv,parseYahooUsChart,parseTreasuryTenYearXml} from '../src/operations/internal-live-daily.js';
import {synthesizeKoreanAIEvent} from '../src/operations/ai-editorial-synthesis.js';
import {validateLiveDailyPayload,type LiveDailyPayload} from '../src/operations/live-daily.js';
import {evaluateEditorialQuality,titleContainsCalendarDate} from '../src/production/editorial-quality.js';
import {buildProductionSummary} from '../src/production/production-summary.js';
import {persistedPublicationDecision,publicationIdentity,type PublishLedgerEntry} from '../src/production/publication-operation.js';

test('calendar dates anywhere in AI U.S. or Korea titles are rejected',()=>{
 for(const title of ['미국증시 마감: 2026-10-14 주요 지수와 금리·달러 흐름','AI 투자 2026.10.15 핵심 변화','국내증시 2026/10/15 수급','2026년 10월 15일 반도체 흐름','10월 15일 시장 점검'])assert.equal(titleContainsCalendarDate(title),true,title);
 for(const title of ['엔비디아 상승, 장기금리 하락 속 미국증시','반도체 수급으로 읽는 국내증시'])assert.equal(titleContainsCalendarDate(title),false,title);
 const html='<article style="max-width:100%;overflow-x:hidden"><p>검증된 시장 사실을 충분한 문장으로 설명하고 배경과 맥락을 함께 제시한다. 독자는 원문을 열지 않아도 핵심 흐름을 이해할 수 있다.</p><p>두 번째 문단에서는 움직임의 의미와 산업 연결을 구체적으로 정리하고 과장된 인과관계를 피한다.</p><p>마지막 문단에서는 다음 거래일에 확인할 변수를 제시하고 검증된 출처만 연결한다.</p></article>';
 assert.ok(evaluateEditorialQuality('미국증시 마감: 2026-10-14 주요 지수와 금리·달러 흐름',html).reasons.includes('calendar date exposed in title'));
});

test('U.S. editorial title candidates use verified displayed metrics and contain no date',()=>{
 const unit=createFirstSplitDailyProductionRun().units.find(item=>item.category==='US_MARKET')!,view=unit.viewModel as USMarketDailyViewModel,candidates=buildUSEditorialTitleCandidates(view.marketHistory,[{label:'U.S. 10Y Treasury Yield (미국 10년물 국채금리)',value:'4.10',change:'-0.02%',direction:'DOWN'}]);
 assert.equal(candidates.length,3);for(const title of candidates){assert.equal(titleContainsCalendarDate(title),false);assert.doesNotMatch(title,/MOTUS Daily|미국증시 마감\s*:/);assert.match(title,/S&P 500|Nasdaq|Dow Jones|미국 주요 지수|장기금리/)}
 const staleRateCandidates=buildUSEditorialTitleCandidates(view.marketHistory,[{label:'U.S. 10Y Treasury Yield (미국 10년물 국채금리, 2026-10-13 기준)',value:'4.10',change:'-0.02%',direction:'DOWN'}]);
 for(const title of staleRateCandidates)assert.doesNotMatch(title,/장기금리/);
 assert.throws(()=>buildUSEditorialTitleCandidates({...view.marketHistory,series:view.marketHistory.series.slice(0,2)},[]),/US_EDITORIAL_TITLE_INPUT_INSUFFICIENT/);
});

test('FRED CSV parser accepts current observation_date format, BOM and quoted values without weakening date validation',()=>{
 const url='https://fred.stlouisfed.org/graph/fredgraph.csv?id=SP500';
 const csv='\uFEFFobservation_date,SP500\n2026-10-19,"7,690.73"\n2026-10-20,"7,712.57"\n2026-10-21,.\n';
 const points=parseFredCsv(csv,'SP500',url);
 assert.equal(points.length,2);assert.equal(points[0]?.date,'2026-10-19');assert.equal(points[0]?.value,7690.73);assert.equal(points[1]?.date,'2026-10-20');assert.equal(points[1]?.value,7712.57);
 assert.equal(parseFredCsv('unexpected,value\n2026-10-20,7712.57','SP500',url).length,0);
 assert.equal(parseFredCsv('observation_date,SP500\n10/20/2026,7712.57','SP500',url).length,0);
});

test('exact US secondary parsers preserve session dates and values',()=>{
 const yahoo=parseYahooUsChart({chart:{result:[{timestamp:[1792454400,1792540800],indicators:{quote:[{close:[7690.73,7712.57]}]}}]}},'^GSPC','https://query1.finance.yahoo.com/example');
 assert.equal(yahoo.length,2);assert.equal(yahoo[0]?.date,'2026-10-20');assert.equal(yahoo[0]?.value,7690.73);
 const xml='<feed><entry><content><m:properties><d:NEW_DATE>2026-10-20T00:00:00</d:NEW_DATE><d:BC_10YEAR>5.24</d:BC_10YEAR></m:properties></content></entry><entry><content><m:properties><d:NEW_DATE>2026-10-21T00:00:00</d:NEW_DATE><d:BC_10YEAR>5.21</d:BC_10YEAR></m:properties></content></entry></feed>';
 const treasury=parseTreasuryTenYearXml(xml,'https://home.treasury.gov/feed');assert.equal(treasury.length,2);assert.equal(treasury[1]?.date,'2026-10-21');assert.equal(treasury[1]?.value,5.21);
});

test('verified NVIDIA Vera Rubin source page synthesizes a Korean AI event',()=>{
 const event=synthesizeKoreanAIEvent({topicId:'ai:vera',publisher:'NVIDIA',title:'Google Cloud and NVIDIA Announce General Availability of NVIDIA Vera Rubin Infrastructure',pageEvidence:'Google Cloud A5X instances, accelerated by NVIDIA Vera Rubin NVL72 systems, support European innovators with next-generation agentic and reinforcement learning infrastructure.',link:'https://blogs.nvidia.com/example',publishedAt:'2026-10-22T00:00:00Z'});
 assert.ok(event);assert.match(event!.topic,/베라 루빈/);assert.match(event!.facts.join(' '),/Google Cloud A5X/);assert.match(event!.facts.join(' '),/에이전트형 AI|강화학습/);
});

test('Korea previous-session morning contract allows only verified-date core metrics when current-session support data is excluded',()=>{
 const base=structuredClone(createFirstSplitDailyProductionRun().units.find(item=>item.category==='KOREA_MARKET')!);const view=base.viewModel as KoreaMarketDailyViewModel;
 base.observedDate='2026-10-21';base.readiness='READY';base.readinessReasons=[];view.operationDate='2026-10-22';view.sessionDate='2026-10-21';view.edition='PREVIOUS_SESSION_MORNING';view.investorFlows=[];view.sectors=[];view.movers=[];
 const payload={schemaVersion:'1.0',session:{state:'COMPLETED',observedDate:'2026-10-21',completedAt:'2026-10-22T00:30:00Z'},unit:base} satisfies LiveDailyPayload;
 const reasons=validateLiveDailyPayload('KOREA_MARKET',payload,'2026-10-22T01:00:00Z');assert.doesNotMatch(reasons.join('; '),/investor flows sectors and movers required/);
 view.sessionDate='2026-10-20';assert.match(validateLiveDailyPayload('KOREA_MARKET',payload,'2026-10-22T01:00:00Z').join('; '),/sessionDate must match observedDate/);
});

test('production summary exposes real reason session and failed source while HOLD stays exit zero',()=>{
 const result=buildProductionSummary({category:'korea',operationDate:'2026-10-16',live:{state:'HOLD',reasonCode:'KOREA_COMPLETED_SESSION_MISMATCH:2026-10-14:2026-10-15',observedDate:null},verification:{verification:'FAILED',duplicateCheck:'PENDING_REMOTE'},search:{freshness:'NO_SEARCH_SIGNAL'},publish:{state:'HOLD',reason:'live unit is not publication-ready',publishCallCount:0},audit:{entries:[{sourceId:'naver:kospi',status:'PASS',observedDate:'2026-10-14'},{sourceId:'krx:close',status:'FAILED',observedDate:'2026-10-14',error:'OFFICIAL_SOURCE_UNAVAILABLE'}]}});
 assert.equal(result.exitCode,0);assert.equal(result.row.sessionDate,'2026-10-14');assert.match(result.row.reasonCodes!,/KOREA_COMPLETED_SESSION_MISMATCH/);assert.equal(result.row.failedSource,'krx:close');assert.match(result.markdown,/operationDate.*sessionDate.*reasonCodes/);assert.match(result.annotation,/::warning/);
});

test('postflight failure is non-zero and warns that the remote post may exist',()=>{const result=buildProductionSummary({category:'us',operationDate:'2026-10-20',live:{state:'LIVE_READY',observedDate:'2026-10-19'},verification:{verification:'VERIFIED',duplicateCheck:'PASS'},search:{freshness:'NO_SEARCH_SIGNAL'},publish:{state:'FAILED',reasonCode:'PUBLISH_POSTFLIGHT_FAILED',error:'public page validation failed',publishCallCount:1,remoteMayExist:true},audit:{entries:[]}});assert.equal(result.exitCode,1);assert.match(result.annotation,/::error/);assert.match(result.markdown,/remote post may exist/)});

test('persisted canonical publication identity skips before any remote publish call',()=>{let insertCallCount=0,publishCallCount=0;const identity=publicationIdentity('2026-10-20','US_MARKET'),entries=[{publicationIdentity:identity,attemptId:'a',operationDate:'2026-10-20',category:'US_MARKET',at:'2026-10-20T00:00:00Z',gateState:'AUTO_PUBLISH_READY',publishAttempted:true,duplicateState:'RESOLVED',finalState:'PUBLISHED',reason:'published',commitSha:'abc',event:'PUBLISHED',postId:'p',publicPostUrl:'https://motusnova.blogspot.com/p.html',fingerprint:'sha256:x',detail:'published'}] satisfies PublishLedgerEntry[];const decision=persistedPublicationDecision(entries,'2026-10-20','US_MARKET');if(decision.state==='CONTINUE'){insertCallCount++;publishCallCount++}assert.equal(decision.state,'SKIP');assert.equal(decision.reasonCode,'ALREADY_PUBLISHED_IN_PERSISTED_LEDGER');assert.equal(insertCallCount,0);assert.equal(publishCallCount,0)});

test('workflows use fixed runners durable artifact handoff and simulation-only catch-up',async()=>{const production=await readFile('.github/workflows/motus-daily-production.yml','utf8'),catchup=await readFile('.github/workflows/motus-daily-catchup.yml','utf8'),search=await readFile('.github/workflows/motus-search-intelligence-daily.yml','utf8');for(const workflow of [production,catchup,search]){assert.match(workflow,/runs-on: ubuntu-24\.04/);assert.doesNotMatch(workflow,/runs-on: ubuntu-latest/)}assert.match(production,/motus-persistence-/);assert.match(production,/actions\/download-artifact@v4/);assert.match(production,/ref: ops-data/);assert.match(production,/permissions:\s*\n\s*contents: write/);assert.match(production,/exclude='\.publish-lock'/);assert.match(production,/git rebase origin\/ops-data/);assert.ok(production.indexOf('Restore cached production operations state')<production.indexOf('Hydrate canonical operations state from ops-data'),'ops-data must overwrite restored cache in production');assert.ok(catchup.indexOf('Restore cached production operations state')<catchup.indexOf('Hydrate canonical published state from ops-data'),'ops-data must overwrite restored cache in catch-up');assert.match(catchup,/20 22 \* \* 0-4/);assert.match(catchup,/20 4 \* \* 1-5/);assert.match(catchup,/20 10 \* \* 1-5/);assert.match(catchup,/MOTUS_LIVE_PUBLISH_ENABLED:\s*'false'/);assert.doesNotMatch(catchup,/motus:publish[^\n]*--execute/)});

test('published U.S. registration backfill is already idempotently complete',async()=>{const [library,weekly,search,pdf]=await Promise.all([readFile('data/library/publications/auto-publications.json','utf8'),readFile('data/operations/2026-10-15/weekly-monthly-feed-auto.json','utf8'),readFile('data/search/2026-10-15/auto-registrations.json','utf8'),readFile('data/reports/daily/2026-10-15/us/candidate.json','utf8')]);for(const value of [library,weekly,search]){const rows=JSON.parse(value) as Array<{publicationId?:string}>;assert.equal(rows.filter(row=>row.publicationId==='motus-live-2026-10-14:us').length,1)}assert.match(pdf,/PRIVATE|"visibility"\s*:\s*"PRIVATE"/)});

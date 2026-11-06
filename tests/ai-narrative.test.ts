import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {AIIntelligenceDailyViewModel} from '../src/intelligence/daily-masters.js';
import {buildAIFactBundle,generateNarrative,validateNarrative,NARRATIVE_DISCLAIMER,type AINarrative} from '../src/narrative/ai-narrative.js';
import {CLAUDE_CLI_ARGS,classifyFailure,claudeCliProvider,type NarrativeProvider} from '../src/narrative/claude-cli-provider.js';
import {emph,renderAINarrativeArticle} from '../src/publishers/editorial-article.js';
import {evaluateEditorialQuality} from '../src/production/editorial-quality.js';

const view=()=>JSON.parse(readFileSync('tests/fixtures/ai-narrative/view-2026-11-04.json','utf8')) as AIIntelligenceDailyViewModel;
const draft=(hash:string)=>({...JSON.parse(readFileSync('tests/fixtures/ai-narrative/narrative-2026-11-04.json','utf8')),bundleHash:hash}) as AINarrative;
const setup=()=>{const v=view(),bundle=buildAIFactBundle(v);return {v,bundle,narrative:draft(bundle.bundleHash)}};
const errorsOf=(mutate:(n:AINarrative)=>void)=>{const {bundle,narrative}=setup();mutate(narrative);return validateNarrative(bundle,narrative).errors};

test('the fact bundle is deterministic and carries official, price and broker facts with sources', () => {
  const a=buildAIFactBundle(view()),b=buildAIFactBundle(view());
  assert.equal(a.bundleHash,b.bundleHash);assert.equal(a.sessionDate,'2026-11-03');
  assert.equal(a.facts.filter(f=>f.kind==='official').length,2);
  assert.ok(a.facts.some(f=>f.kind==='price'&&f.text.includes('오라클 ORCL')&&f.text.includes('+5.85%')));
  assert.ok(a.facts.filter(f=>f.kind==='broker').every(f=>/^https:\/\//.test(f.sourceUrl??'')));
  assert.ok(a.facts.some(f=>f.text.includes('목표주가 2,300,000원')));
});

test('a real narrative draft for 2026-11-04 passes validation, renders and passes the editorial quality gate', () => {
  const {v,bundle,narrative}=setup();
  assert.deepEqual(validateNarrative(bundle,narrative).errors,[]);
  const html=renderAINarrativeArticle(v,narrative,NARRATIVE_DISCLAIMER).html,quality=evaluateEditorialQuality(v.title,html);
  assert.equal(quality.pass,true,quality.reasons.join(','));
  assert.ok(html.includes(NARRATIVE_DISCLAIMER));assert.ok(html.includes('data-visualization="change-bars"'));assert.ok(html.includes('목표주가 2,300,000원'));
  assert.doesNotMatch(html,/http[^"]*"[^>]*>[^<]*http/);
});

test('validation rejects invented numbers, names, brokers, quotes and stale hashes', () => {
  assert.ok(errorsOf(n=>{n.sections[0]!.paragraphs[0]!.text+=' 엔비디아는 +9.99% 올랐다고 밝혔다.'}).some(e=>e.startsWith('NUMBER:')));
  assert.ok(errorsOf(n=>{n.sections[0]!.paragraphs[0]!.text+=' Anthropic도 비슷한 발표를 했다고 밝혔다.'}).some(e=>e.startsWith('ENTITY:')&&e.endsWith('anthropic')));
  assert.ok(errorsOf(n=>{n.sections[0]!.paragraphs[0]!.text+=' 미래에셋증권도 같은 의견이라고 밝혔다.'}).some(e=>e.includes('미래에셋증권')));
  assert.ok(errorsOf(n=>{n.sections[0]!.paragraphs[0]!.text+=' 유진투자증권은 “반도체는 무조건 오른다”라고 밝혔다.'}).some(e=>e.startsWith('QUOTE_MISMATCH')));
  assert.ok(errorsOf(n=>{n.bundleHash='0000'}).includes('SCHEMA:bundleHash'));
  assert.ok(errorsOf(n=>{n.sections[0]!.paragraphs[0]!.factIds=['F999']}).some(e=>e.includes('unknown')));
});

test('validation rejects advice, unattributed causes, markup and characters Blogger re-encodes', () => {
  assert.ok(errorsOf(n=>{n.sections[0]!.paragraphs[0]!.text+=' 지금이 기회다.'}).some(e=>e.startsWith('BANNED')));
  const cause=errorsOf(n=>{n.sections[2]!.paragraphs[0]!.text='직전 미국 정규장에서 오라클은 +5.85%, AMD는 +3.65% 올랐다. 이 상승은 데이터센터 수요 때문이다. 가장 약한 종목은 팔란티어로 -1.65%였다. 브로드컴은 +3.07% 올랐다.'});
  assert.ok(cause.some(e=>e.startsWith('CAUSE_UNATTRIBUTED')),cause.join(','));
  assert.ok(errorsOf(n=>{n.lead.text+=' 자세한 내용은 https://example.com 참고.'}).some(e=>e.startsWith('FORMAT')||e.startsWith('CHARSET')));
  assert.ok(errorsOf(n=>{n.lead.text+=" 'AI' 반등."}).some(e=>e.startsWith('CHARSET')));
  // Dollar prices are ordinary in broker facts (2026-11-06 shadow run rejected "$91.06" as CHARSET).
  assert.ok(!errorsOf(n=>{n.lead.text+=' 직전 정규장에서 $3.65 수준.'}).some(e=>e.startsWith('CHARSET')));
  // Hanja abbreviations from broker notes (非메모리, 美·中) are ordinary text (2026-11-06 simulation rejected 非).
  assert.ok(!errorsOf(n=>{n.lead.text+=' 非메모리 美中 흐름.'}).some(e=>e.startsWith('CHARSET')));
  assert.ok(errorsOf(n=>{n.sections=n.sections.slice(0,2)}).includes('SCHEMA:sections'));
  assert.ok(errorsOf(n=>{n.sections[1]!.paragraphs[0]!.text=n.lead.text}).includes('DUPLICATE'));
});

test('an official announcement the narrative leaves out is a coverage failure', () => {
  const errors=errorsOf(n=>{n.sections=n.sections.map(s=>({...s,paragraphs:s.paragraphs.map(p=>({...p,factIds:p.factIds.filter(id=>id!=='F2')})).filter(p=>p.factIds.length)})).filter(s=>s.paragraphs.length)});
  assert.ok(errors.includes('COVERAGE:F2'));
});

test('generation retries once with the validation errors, then falls back; provider failures never retry', async () => {
  const {bundle,narrative}=setup();const prompts:string[]=[];
  const replies=[JSON.stringify({...narrative,lead:{...narrative.lead,text:narrative.lead.text+' 엔비디아는 +9.99% 올랐다.'}}),'```json\n'+JSON.stringify(narrative)+'\n```'];
  const fake:NarrativeProvider={async complete(_s,user){prompts.push(user);return {ok:true,text:replies.shift()!,model:'m',durationMs:1}}};
  const ok=await generateNarrative(bundle,fake);
  assert.equal(ok.outcome.status,'VALID');assert.equal(ok.outcome.attempts,2);assert.match(prompts[1]!,/NUMBER:lead:9.99/);
  const bad:NarrativeProvider={async complete(){return {ok:true,text:'{}',model:null,durationMs:1}}};
  const rejected=await generateNarrative(bundle,bad);assert.equal(rejected.outcome.status,'REJECTED');assert.equal(rejected.narrative,null);
  let calls=0;const limited:NarrativeProvider={async complete(){calls++;return {ok:false,reason:'RATE_LIMITED',detail:'limit'}}};
  const failed=await generateNarrative(bundle,limited);assert.equal(failed.outcome.reason,'NARRATIVE_RATE_LIMITED');assert.equal(calls,1);
  const skipped=await generateNarrative(bundle,claudeCliProvider({token:undefined}));assert.equal(skipped.outcome.status,'SKIPPED');
});

test('the CLI runs with no tools, no MCP, no settings and no session files, never in --bare (API-key only) mode', () => {
  const args=CLAUDE_CLI_ARGS('sys');
  assert.deepEqual(args.slice(0,9),['-p','--output-format','json','--tools','','--strict-mcp-config','--setting-sources','','--no-session-persistence']);
  assert.ok(!args.includes('--bare'));
  assert.equal(classifyFailure('Claude AI usage limit reached'),'RATE_LIMITED');assert.equal(classifyFailure('Invalid API key · Please run /login'),'AUTH');
});

test('emph keeps Korean 조/억 amounts whole', () => {
  const html=emph('외국인이 -1조5,244억원을 순매도했고 기관은 3조원, 개인은 2,100억원 순매수였다.');
  assert.match(html,/<b[^>]*>-1조5,244억원<\/b>/);assert.match(html,/<b[^>]*>3조원<\/b>/);assert.match(html,/<b[^>]*>2,100억원<\/b>/);
  assert.doesNotMatch(html,/1조5,<b/);
});

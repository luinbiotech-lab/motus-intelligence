import test from 'node:test';import assert from 'node:assert/strict';
import {aiHeadline,type KoreanAIEvent} from '../src/operations/ai-editorial-synthesis.js';
import {titlePolicyViolations,titleContainsCalendarDate} from '../src/production/editorial-quality.js';

const base:KoreanAIEvent={topicId:'t',publisher:'NVIDIA',company:'엔비디아',topic:'베라 루빈 AI 인프라 상용화',headline:'',facts:['x'],interpretation:'',watch:'',link:'https://example.com',publishedAt:'2026-10-29T00:00:00Z'};
const types=['launch','infrastructure','partnership','adoption','investment','research','security','policy','education'];

test('AI headlines follow the event type and every shape passes the headline policy',()=>{
 const titles=types.map(eventType=>aiHeadline({...base,eventType} as KoreanAIEvent));
 assert.equal(new Set(titles).size,types.length,'each event type reads differently');
 for(const title of titles){assert.deepEqual(titlePolicyViolations(title),[],title);assert.equal(titleContainsCalendarDate(title),false);assert.ok(title.startsWith('엔비디아'))}
 assert.equal(aiHeadline({...base,eventType:'launch'} as KoreanAIEvent),'엔비디아가 공개한 베라 루빈 AI 인프라 상용화, 실제 도입으로 이어질까');
});

test('events without a known type keep the previous headline and correct particles',()=>{
 assert.equal(aiHeadline({...base,company:'메타',topic:'신규 AI 제품·기능'}),'메타가 공개한 신규 AI 제품·기능, 실제 산업 변화로 이어질까');
 assert.equal(aiHeadline({...base,company:'구글',topic:'새 모델',eventType:'unknown'} as KoreanAIEvent),'구글이 공개한 새 모델, 실제 산업 변화로 이어질까');
});

test('product-named official titles without type keywords become events (MOT-033, 2026-11-07)', async () => {
  const {productTitleFallback,synthesizeEvidenceBoundAIEvent}=await import('../src/operations/ai-generic-synthesis.js');
  assert.deepEqual(productTitleFallback({title:'Gemini Omni 1.2 Flash: Fast and cost-effective with longer clips',publisher:'Google AI',link:'https://blog.google/x/'}),{type:'launch',fromTitle:true});
  assert.deepEqual(productTitleFallback({title:'Agentic cheminformatics with Google Antigravity',publisher:'Google DeepMind',link:'https://deepmind.google/blog/x/'}),{type:'research',fromTitle:true});
  assert.equal(productTitleFallback({title:'Measuring how AI agents handle everyday wet-lab science',publisher:'OpenAI',link:'https://openai.com/index/x'}),null);
  const event=synthesizeEvidenceBoundAIEvent({topicId:'t',publisher:'Google AI',sourceId:'s',title:'Gemini Omni 1.2 Flash: Fast and cost-effective with longer clips',link:'https://blog.google/x/',publishedAt:'2026-11-05T17:00:00Z',evidence:'Gemini Omni 1.2 Flash is fast. '.repeat(30),basis:'OFFICIAL_PAGE'});
  assert.ok(event);assert.equal(event.eventType,'launch');assert.match(event.headline,/^구글, Gemini Omni 1\.2 Flash/);
});

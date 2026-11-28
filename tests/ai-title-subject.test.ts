import test from 'node:test';import assert from 'node:assert/strict';
import {synthesizeEvidenceBoundAIEvent,titleSubject} from '../src/operations/ai-generic-synthesis.js';
import {aiHeadline,type KoreanAIEvent} from '../src/operations/ai-editorial-synthesis.js';
import {titlePolicyViolations} from '../src/production/editorial-quality.js';

// MO-24 (2026-11-24): the 11/18·11/19·11/20 AI titles named a product the announcement was not about.
const make=(publisher:string,sourceId:string,title:string,evidence:string)=>synthesizeEvidenceBoundAIEvent({topicId:'t',publisher,sourceId,title,link:'https://example.com/post',publishedAt:'2026-11-19T17:00:00Z',evidence,basis:'OFFICIAL_PAGE'});
const headline=(event:ReturnType<typeof make>)=>aiHeadline(event as unknown as KoreanAIEvent);

test('a feature introduced in a product is named in the topic (11/20 "Gemini 공개" was Tool Retrieval)',()=>{
  const event=make('Google AI','google-ai','Introducing Tool Retrieval in the Gemini API','Tool Retrieval lets developers using the Gemini API pick tools at run time. It is available now.')!;
  assert.equal(event.topic,'Gemini API Tool Retrieval');
  assert.equal(headline(event),'구글이 공개한 Gemini API Tool Retrieval, 실제 도입으로 이어질까');
  assert.deepEqual(titlePolicyViolations(headline(event)),[]);
});

test('an availability post keeps the app word and reads as wider access, not a new feature (11/19)',()=>{
  const event=make('Google AI','google-ai','The Gemini app is now available on lower-memory Android devices.','The Gemini app now runs on Android phones with less memory, so more people can use it.')!;
  assert.equal(event.topic,'Gemini app 이용 확대');
  assert.match(headline(event),/^구글이 공개한 Gemini app 이용 확대/);
});

test('a longer product name in the title is not cut to the catalogued word (11/18 Copilotforce)',()=>{
  assert.equal(titleSubject('Microsoft and Salesforce Announce Copilotforce, Bringing Trusted Customer Context','Copilot')?.name,'Copilotforce');
  const event=make('Microsoft','microsoft-source','Microsoft and Salesforce Announce Copilotforce, Bringing Trusted Customer Context and Action into Microsoft AI Experiences','Microsoft and Salesforce announced Copilotforce. The companies announced it brings Salesforce customer context into Copilot for sales teams.')!;
  assert.ok(!/Copilot 신규 기능/.test(event.topic),event.topic);
  assert.match(event.headline,/Copilotforce/);
});

test("another company's platform is named with its owner (11/20 엔비디아 + Azure)",()=>{
  const event=make('NVIDIA','nvidia','NVIDIA and Microsoft Expand Accelerated Computing From Azure to Windows PCs','NVIDIA and Microsoft expand accelerated computing infrastructure from Azure data centers to Windows PCs.')!;
  assert.match(event.topic,/마이크로소프트 Azure/);
  assert.ok(!/^엔비디아(?:가|의) Azure/.test(headline(event)),headline(event));
});

test('titles that already named the product the old way are unchanged',()=>{
  const event=make('Google AI','google-ai','Gemini Omni 1.2 Flash: Fast and cost-effective with longer clips','Gemini Omni 1.2 Flash is fast. '.repeat(30))!;
  assert.match(event.headline,/^구글, Gemini Omni 1\.2 Flash/);
  assert.equal(titleSubject('Introducing ChatGPT Atlas','ChatGPT')?.name,'ChatGPT');
  assert.equal(titleSubject('Copilotforce arrives','Copilot Studio'),null);
  assert.equal(titleSubject('Walter Isaacson on curiosity and creativity in the AI age.','Isaac'),null,'a longer word is not a product unless the title announces it');
});

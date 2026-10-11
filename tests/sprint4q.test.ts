import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createNextLiveCycle} from '../src/editorial/next-live-cycle.js';
import {createLiveEditorialCycle} from '../src/editorial/live-cycle.js';
import type {KoreaMarketDailyViewModel} from '../src/intelligence/daily-masters.js';
import {BLOGGER_EDITORIAL_CATEGORIES,BLOGGER_EDITORIAL_MASTER,renderKoreaEditorialArticle} from '../src/publishers/editorial-article.js';
import {buildLiveDailyPdfViewModels} from '../src/reports/pdf-production.js';

test('Sprint 4Q makes the editorial article renderer the future publication default',async()=>{
  const config=JSON.parse(await readFile('config/editorial-operations.json','utf8')) as {publicArticleRenderer:string;publicArticleRendererVersion:string;dataReadinessOverridesClock:boolean;commerce:{enabled:boolean}};
  assert.equal(BLOGGER_EDITORIAL_MASTER.defaultForNewPublications,true);
  assert.equal(config.publicArticleRenderer,BLOGGER_EDITORIAL_MASTER.id);
  assert.equal(config.publicArticleRendererVersion,BLOGGER_EDITORIAL_MASTER.version);
  assert.equal(config.dataReadinessOverridesClock,true);
  assert.equal(config.commerce.enabled,false);
  assert.deepEqual(BLOGGER_EDITORIAL_CATEGORIES.AI_INTELLIGENCE,{canonicalLabel:'ai-intelligence',publicLabel:'AI 인텔리전스'});
  assert.deepEqual(BLOGGER_EDITORIAL_CATEGORIES.US_MARKET,{canonicalLabel:'us-market',publicLabel:'미국증시'});
  assert.deepEqual(BLOGGER_EDITORIAL_CATEGORIES.KOREA_MARKET,{canonicalLabel:'korea-market',publicLabel:'국내증시'});
});

test('next live cycle creates review-ready AI, US and verified Korea units without approving them',()=>{
  const cycle=createNextLiveCycle('2026-10-07T09:00:00.000Z');
  assert.equal(cycle.units.length,3);
  for(const unit of cycle.units){
    assert.equal(unit.state,'REVIEW_READY');
    assert.equal(unit.humanReviewState,'APPROVAL_REQUIRED');
    assert.match(unit.canonicalLabel,/^(?:ai-intelligence|us-market|korea-market)$/);
    assert.match(unit.label,/^(?:AI 인텔리전스|미국증시|국내증시)$/);
    assert.match(unit.render.html,/data-layout="editorial-article-4q"/);
    assert.doesNotMatch(unit.render.html,/>왜 중요한가<|>무슨 일이 있었나<|>산업 연결<|>시장 연결<|>핵심 내용</);
    assert.doesNotMatch(unit.render.html,/fixture|sample marker|affiliate|commerce/i);
  }
  assert.equal(cycle.commerce.enabled,false);
});

test('AI editorial article explains three verified official events with clickable sources',()=>{
  const ai=createNextLiveCycle().units.find(unit=>unit.category==='AI_INTELLIGENCE')!;
  assert.equal(ai.itemCount,3);
  assert.equal(ai.sourceCount,3);
  assert.equal((ai.render.html.match(/<a\b[^>]*href="https:\/\/openai\.com\//g)??[]).length,3);
  assert.match(ai.render.html,/Ironclad/);
  assert.match(ai.render.html,/Atlassian/);
  assert.match(ai.render.html,/수학 결과/);
});

test('US editorial article preserves actual five-session series and four responsive SVG charts',()=>{
  const us=createNextLiveCycle().units.find(unit=>unit.category==='US_MARKET')!;
  assert.equal((us.render.html.match(/<svg\b/g)??[]).length,4);
  assert.match(us.render.html,/7,818\.93/);
  assert.match(us.render.html,/27,599\.79/);
  assert.match(us.render.html,/51,521\.28/);
  assert.match(us.render.html,/2,830\.30/);
  assert.match(us.render.html,/최근 5거래일 종가/);
  assert.match(us.render.html,/max-width\s*:\s*100%/i);
  assert.match(us.render.html,/overflow-x\s*:\s*hidden/i);
});

test('Korea 2026-10-07 uses cross-verified market facts and omits unavailable research',()=>{
  const korea=createNextLiveCycle().units.find(unit=>unit.category==='KOREA_MARKET')!;
  assert.equal(korea.state,'REVIEW_READY');
  assert.equal(korea.humanReviewState,'APPROVAL_REQUIRED');
  assert.equal(korea.issueDate,'2026-10-07');
  assert.match(korea.render.html,/6,803\.90/);
  assert.match(korea.render.html,/898\.43/);
  assert.match(korea.render.html,/1,340\.4원/);
  assert.doesNotMatch(korea.render.html,/국내 증권사 리서치/);
  assert.ok(korea.warnings.includes('BROKERAGE_RESEARCH_SECTION_OMITTED'));
});

test('Korea editorial renderer is prose-first with one optional flow visual',()=>{
  const korea=createLiveEditorialCycle().units.find(unit=>unit.category==='KOREA_MARKET')!;
  const rendered=renderKoreaEditorialArticle(korea.viewModel as KoreaMarketDailyViewModel);
  assert.match(rendered.html,/data-layout="editorial-article-4q"/);
  assert.equal((rendered.html.match(/data-visualization="korea-investor-flow"/g)??[]).length,1);
  assert.ok((rendered.html.match(/<p\b/g)??[]).length>=5);
  assert.doesNotMatch(rendered.html,/data-layout="responsive-indicator-cards"|Market Dashboard|dashboard card/i);
});

test('Blogger editorial and PDF report renderers remain separate products',async()=>{
  const source=await readFile('src/publishers/editorial-article.ts','utf8');
  assert.doesNotMatch(source,/pdf-production|PdfDocumentViewModel|buildLiveDailyPdfViewModels/);
  const pdf=buildLiveDailyPdfViewModels();
  assert.equal(pdf.length,2);
  assert.ok(pdf.every(item=>item.sections.length>0&&item.reviewState==='PENDING'&&item.publicUrl===null));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {datesAgree,isAIRelevant,isNewsLike,isOfficialLink,pagePublishedDate,parseAnthropicIndex,parseFeed} from '../src/operations/ai-sources.js';
import {classifyAIEvent,extractFigures,josa,synthesizeEvidenceBoundAIEvent} from '../src/operations/ai-generic-synthesis.js';
import {RepositoryInternalDailyBuilder,selectAIEvents} from '../src/operations/internal-live-daily.js';
import {evaluateEditorialQuality} from '../src/production/editorial-quality.js';
import {buildProductionVerification} from '../src/production/verification-artifact.js';
import type {AIIntelligenceDailyViewModel} from '../src/intelligence/daily-masters.js';

test('feed parser keeps RSS full text and Atom links',()=>{
  const rss=parseFeed('<rss><item><title>A &amp; B</title><link>https://blogs.nvidia.com/blog/a/</link><pubDate>Fri, 23 Oct 2026 02:00:13 +0000</pubDate><description><![CDATA[<p>Short</p>]]></description><content:encoded><![CDATA[<p>Full <b>body</b></p>]]></content:encoded></item></rss>');
  assert.deepEqual(rss,[{title:'A & B',link:'https://blogs.nvidia.com/blog/a/',publishedAt:'Fri, 23 Oct 2026 02:00:13 +0000',summary:'Short',fullText:'Full body'}]);
  const atom=parseFeed('<feed><entry><title>T</title><link href="https://deepmind.google/blog/t/"/><published>2026-10-22T14:30:24Z</published><summary>S</summary></entry></feed>');
  assert.equal(atom[0]?.link,'https://deepmind.google/blog/t/');assert.equal(atom[0]?.publishedAt,'2026-10-22T14:30:24Z');
});

test('only https links on the publisher’s own domains are official',()=>{
  assert.ok(isOfficialLink('https://blogs.nvidia.com/blog/x/',['blogs.nvidia.com']));
  assert.ok(isOfficialLink('https://www.anthropic.com/news/x',['anthropic.com']));
  assert.equal(isOfficialLink('https://blogs.nvidia.com.evil.example/x',['blogs.nvidia.com']),false);
  assert.equal(isOfficialLink('http://openai.com/index/x',['openai.com']),false);
  assert.equal(isOfficialLink('https://medium.com/@openai/x',['openai.com']),false);
});

test('page publication date is read from meta, JSON-LD, time or visible date and compared tolerantly',()=>{
  assert.equal(pagePublishedDate('<meta property="article:published_time" content="2026-10-23T02:00:13+00:00">'),'2026-10-23T02:00:13.000Z');
  assert.equal(pagePublishedDate('<script>{"datePublished":"2026-10-22"}</script>'),'2026-10-22T00:00:00.000Z');
  assert.equal(pagePublishedDate('<time datetime="2026-10-21T10:00:00Z">Oct 21</time>'),'2026-10-21T10:00:00.000Z');
  assert.equal(pagePublishedDate('<p>Published Oct 20, 2026</p>'),'2026-10-20T12:00:00.000Z');
  assert.equal(pagePublishedDate('<p>no date</p>'),null);
  assert.ok(datesAgree('2026-10-23T02:00:00Z','Thu, 22 Oct 2026 22:00:00 -0700'));
  assert.equal(datesAgree('2026-10-23T02:00:00Z','2026-10-20T02:00:00Z'),false);
});

test('Anthropic index yields article links only',()=>{
  assert.deepEqual(parseAnthropicIndex('<a href="/news/announcements">x</a><a href="/news/claude-new-model">y</a><a href="https://www.anthropic.com/news/claude-new-model">z</a><a href="/news/features">f</a>'),['https://www.anthropic.com/news/claude-new-model']);
});

test('AI relevance and news filters reject unrelated and tutorial items',()=>{
  assert.ok(isAIRelevant('Amazon Bedrock AgentCore now available',''));
  assert.equal(isAIRelevant('New Tools for the Admins Who Build Communities on Forum','Admins can now schedule posts and manage members.'),false);
  assert.equal(isNewsLike('Multi-Turn Reinforcement Learning on Amazon SageMaker AI: A hands-on guide'),false);
});

test('figures are only reported with a recognised noun and converted to Korean units',()=>{
  assert.deepEqual(extractFigures('a $5 billion investment, $1.2 trillion market, $300 million fund'),['50억 달러','1.2조 달러','3억 달러']);
  assert.deepEqual(extractFigures('2,000 NVIDIA Blackwell GPUs and 50 megawatts, 3x faster, serving 1.5 million users'),['GPU 2,000개','이용자 150만명','50메가와트','3배 빠른 처리']);
  assert.deepEqual(extractFigures('In 2026 we saw 40% growth and 12 new features'),[]);
  assert.deepEqual(extractFigures('There are 10 tools for developers. After 3 years customers can deploy the model.'),[],'arbitrary words between a number and a noun are never skipped');
  assert.deepEqual(extractFigures('more than 2,000 new GPUs for 30 countries'),['GPU 2,000개','국가 30개국']);
  assert.deepEqual(extractFigures('NVIDIA H100 GPUs and GB200 chips power Gemini 3 users'),[],'digits inside product identifiers are not quantities');
});

test('event type comes from the title first and needs repeated body evidence otherwise',()=>{
  assert.deepEqual(classifyAIEvent('Kazakhstan Expands Compute for Its AI Future',''),{type:'infrastructure',fromTitle:true});
  assert.deepEqual(classifyAIEvent('A note from our CEO','We partner with hospitals. The partnership expands care.'),{type:'partnership',fromTitle:false});
  assert.equal(classifyAIEvent('A note from our CEO','Thanks to everyone.'),null);
});

test('Korean particles follow the final sound',()=>{
  assert.equal(josa('구글','이','가'),'구글이');assert.equal(josa('엔비디아','이','가'),'엔비디아가');assert.equal(josa('아마존웹서비스(AWS)','은','는'),'아마존웹서비스(AWS)는');
});

test('evidence-bound synthesis separates facts from labelled analysis and never copies English sentences',()=>{
  const evidence='Volkswagen Group is putting Microsoft 365 Copilot to work across the company, rolling out the AI assistant to 50,000 employees in Germany.';
  const event=synthesizeEvidenceBoundAIEvent({topicId:'t',publisher:'Microsoft',sourceId:'microsoft-source',title:'Volkswagen Group putting Copilot to work across the company',link:'https://news.microsoft.com/source/x',publishedAt:'2026-10-23T17:58:00Z',evidence,basis:'OFFICIAL_PAGE'})!;
  assert.equal(event.eventType,'adoption');assert.equal(event.topic,'폭스바겐의 AI 도입');
  assert.match(event.facts[0]!,/^마이크로소프트는 2026년 10월 24일\(한국 시간\) 공식 뉴스룸에 「Volkswagen Group putting Copilot to work across the company」/);
  assert.ok(event.facts.some(fact=>fact.includes('직원 5만명')));
  assert.ok(event.facts.every(fact=>!fact.startsWith('MOTUS 분석')&&!fact.includes('rolling out the AI assistant')));
  assert.match(event.interpretation,/^MOTUS 분석: /);
  const thin=synthesizeEvidenceBoundAIEvent({topicId:'o',publisher:'OpenAI',sourceId:'openai',title:'Securing our frontier model training environment',link:'https://openai.com/index/x',publishedAt:'2026-10-23T17:00:00Z',evidence:'We describe new security controls protecting the infrastructure we use to train frontier models, including hardware isolation.',basis:'OFFICIAL_RSS_SUMMARY',fallbackReason:'PAGE_BLOCKED'});
  assert.equal(thin,null,'an item with no product, place, organisation or figure is too thin to state as news');
  const rss=synthesizeEvidenceBoundAIEvent({topicId:'p',publisher:'OpenAI',sourceId:'openai',title:'Introducing ChatGPT Atlas',link:'https://openai.com/index/y',publishedAt:'2026-10-23T17:00:00Z',eviden…7154 tokens truncated…ck -prune -exec rm -rf {} +
            if grep -RIlE -- '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|BLOGGER_(CLIENT_SECRET|REFRESH_TOKEN)=' ops-data/data; then
              echo '::error title=Secret scan failed::persistence bundle contains credential material'
              exit 1
            fi
            git -C ops-data add data
            if git -C ops-data diff --cached --quiet; then echo 'ops-data already up to date'; exit 0; fi
            git -C ops-data commit -q -m "ops: persist ${GITHUB_RUN_ID}/${GITHUB_RUN_ATTEMPT}"
            if git -C ops-data push origin HEAD:ops-data; then exit 0; fi
            echo "::warning title=ops-data push retry::attempt ${attempt} lost a race; re-merging onto the latest ops-data"
            sleep $((attempt * 5))
          done
          echo '::error title=ops-data persistence failed::publication state was not persisted; manual recovery required'
          exit 1

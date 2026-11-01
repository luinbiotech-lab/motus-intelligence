import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { datesAgree, isAIRelevant, isNewsLike, isOfficialLink, pagePublishedDate, parseAnthropicIndex, parseFeed } from '../src/operations/ai-sources.js';
import { classifyAIEvent, extractFigures, josa, synthesizeEvidenceBoundAIEvent } from '../src/operations/ai-generic-synthesis.js';
import { RepositoryInternalDailyBuilder, selectAIEvents } from '../src/operations/internal-live-daily.js';
import { evaluateEditorialQuality } from '../src/production/editorial-quality.js';
import { buildProductionVerification } from '../src/production/verification-artifact.js';
test('feed parser keeps RSS full text and Atom links', () => {
    const rss = parseFeed('<rss><item><title>A &amp; B</title><link>https://blogs.nvidia.com/blog/a/</link><pubDate>Fri, 23 Oct 2026 02:00:13 +0000</pubDate><description><![CDATA[<p>Short</p>]]></description><content:encoded><![CDATA[<p>Full <b>body</b></p>]]></content:encoded></item></rss>');
    assert.deepEqual(rss, [{ title: 'A & B', link: 'https://blogs.nvidia.com/blog/a/', publishedAt: 'Fri, 23 Oct 2026 02:00:13 +0000', summary: 'Short', fullText: 'Full body' }]);
    const atom = parseFeed('<feed><entry><title>T</title><link href="https://deepmind.google/blog/t/"/><published>2026-10-22T14:30:24Z</published><summary>S</summary></entry></feed>');
    assert.equal(atom[0]?.link, 'https://deepmind.google/blog/t/');
    assert.equal(atom[0]?.publishedAt, '2026-10-22T14:30:24Z');
});
test('only https links on the publisher’s own domains are official', () => {
    assert.ok(isOfficialLink('https://blogs.nvidia.com/blog/x/', ['blogs.nvidia.com']));
    assert.ok(isOfficialLink('https://www.anthropic.com/news/x', ['anthropic.com']));
    assert.equal(isOfficialLink('https://blogs.nvidia.com.evil.example/x', ['blogs.nvidia.com']), false);
    assert.equal(isOfficialLink('http://openai.com/index/x', ['openai.com']), false);
    assert.equal(isOfficialLink('https://medium.com/@openai/x', ['openai.com']), false);
});
test('page publication date is read from meta, JSON-LD, time or visible date and compared tolerantly', () => {
    assert.equal(pagePublishedDate('<meta property="article:published_time" content="2026-10-23T02:00:13+00:00">'), '2026-10-23T02:00:13.000Z');
    assert.equal(pagePublishedDate('<script>{"datePublished":"2026-10-22"}</script>'), '2026-10-22T00:00:00.000Z');
    assert.equal(pagePublishedDate('<time datetime="2026-10-21T10:00:00Z">Oct 21</time>'), '2026-10-21T10:00:00.000Z');
    assert.equal(pagePublishedDate('<p>Published Oct 20, 2026</p>'), '2026-10-20T12:00:00.000Z');
    assert.equal(pagePublishedDate('<p>no date</p>'), null);
    assert.ok(datesAgree('2026-10-23T02:00:00Z', 'Thu, 22 Oct 2026 22:00:00 -0700'));
    assert.equal(datesAgree('2026-10-23T02:00:00Z', '2026-10-20T02:00:00Z'), false);
});
test('Anthropic index yields article links only', () => {
    assert.deepEqual(parseAnthropicIndex('<a href="/news/announcements">x</a><a href="/news/claude-new-model">y</a><a href="https://www.anthropic.com/news/claude-new-model">z</a><a href="/news/features">f</a>'), ['https://www.anthropic.com/news/claude-new-model']);
});
test('AI relevance and news filters reject unrelated and tutorial items', () => {
    assert.ok(isAIRelevant('Amazon Bedrock AgentCore now available', ''));
    assert.equal(isAIRelevant('New Tools for the Admins Who Build Communities on Forum', 'Admins can now schedule posts and manage members.'), false);
    assert.equal(isNewsLike('Multi-Turn Reinforcement Learning on Amazon SageMaker AI: A hands-on guide'), false);
});
test('figures are only reported with a recognised noun and converted to Korean units', () => {
    assert.deepEqual(extractFigures('a $5 billion investment, $1.2 trillion market, $300 million fund'), ['50억 달러', '1.2조 달러', '3억 달러']);
    assert.deepEqual(extractFigures('2,000 NVIDIA Blackwell GPUs and 50 megawatts, 3x faster, serving 1.5 million users'), ['GPU 2,000개', '이용자 150만명', '50메가와트', '3배 빠른 처리']);
    assert.deepEqual(extractFigures('In 2026 we saw 40% growth and 12 new features'), []);
    assert.deepEqual(extractFigures('There are 10 tools for developers. After 3 years customers can deploy the model.'), [], 'arbitrary words between a number and a noun are never skipped');
    assert.deepEqual(extractFigures('more than 2,000 new GPUs for 30 countries'), ['GPU 2,000개', '국가 30개국']);
    assert.deepEqual(extractFigures('NVIDIA H100 GPUs and GB200 chips power Gemini 3 users'), [], 'digits inside product identifiers are not quantities');
});
test('event type comes from the title first and needs repeated body evidence otherwise', () => {
    assert.deepEqual(classifyAIEvent('Kazakhstan Expands Compute for Its AI Future', ''), { type: 'infrastructure', fromTitle: true });
    assert.deepEqual(classifyAIEvent('A note from our CEO', 'We partner with hospitals. The partnership expands care.'), { type: 'partnership', fromTitle: false });
    assert.equal(classifyAIEvent('A note from our CEO', 'Thanks to everyone.'), null);
});
test('Korean particles follow the final sound', () => {
    assert.equal(josa('구글', '이', '가'), '구글이');
    assert.equal(josa('엔비디아', '이', '가'), '엔비디아가');
    assert.equal(josa('아마존웹서비스(AWS)', '은', '는'), '아마존웹서비스(AWS)는');
});
test('evidence-bound synthesis separates facts from labelled analysis and never copies English sentences', () => {
    const evidence = 'Volkswagen Group is putting Microsoft 365 Copilot to work across the company, rolling out the AI assistant to 50,000 employees in Germany.';
    const event = synthesizeEvidenceBoundAIEvent({ topicId: 't', publisher: 'Microsoft', sourceId: 'microsoft-source', title: 'Volkswagen Group putting Copilot to work across the company', link: 'https://news.microsoft.com/source/x', publishedAt: '2026-10-23T17:58:00Z', evidence, basis: 'OFFICIAL_PAGE' });
    assert.equal(event.eventType, 'adoption');
    assert.equal(event.topic, '폭스바겐의 AI 도입');
    assert.match(event.facts[0], /^마이크로소프트는 2026년 10월 24일\(한국 시간\) 공식 뉴스룸에 「Volkswagen Group putting Copilot to work across the company」/);
    assert.ok(event.facts.some(fact => fact.includes('직원 5만명')));
    assert.ok(event.facts.every(fact => !fact.startsWith('MOTUS 분석') && !fact.includes('rolling out the AI assistant')));
    assert.match(event.interpretation, /^MOTUS 분석: /);
    const thin = synthesizeEvidenceBoundAIEvent({ topicId: 'o', publisher: 'OpenAI', sourceId: 'openai', title: 'Securing our frontier model training environment', link: 'https://openai.com/index/x', publishedAt: '2026-10-23T17:00:00Z', evidence: 'We describe new security controls protecting the infrastructure we use to train frontier models, including hardware isolation.', basis: 'OFFICIAL_RSS_SUMMARY', fallbackReason: 'PAGE_BLOCKED' });
    assert.equal(thin, null, 'an item with no product, place, organisation or figure is too thin to state as news');
    const rss = synthesizeEvidenceBoundAIEvent({ topicId: 'p', publisher: 'OpenAI', sourceId: 'openai', title: 'Introducing ChatGPT Atlas', link: 'https://openai.com/index/y', publishedAt: '2026-10-23T17:00:00Z', evidence: 'ChatGPT Atlas is now available to more than 1 billion users worldwide, bringing the assistant directly into the browser.', basis: 'OFFICIAL_RSS_SUMMARY', fallbackReason: 'PAGE_BLOCKED' });
    assert.ok(rss.facts.some(fact => fact.includes('자동 수집을 허용하지 않아') && fact.includes('공식 RSS에 게시된 요약')));
    assert.ok(rss.facts.some(fact => fact.includes('이용자 10억명')));
    const bodyOnly = synthesizeEvidenceBoundAIEvent({ topicId: 'q', publisher: 'NVIDIA', sourceId: 'nvidia', title: 'Kazakhstan Expands Compute for Its AI Future', link: 'https://blogs.nvidia.com/blog/k/', publishedAt: '2026-10-23T02:00:00Z', evidence: 'The country plans future systems based on Vera Rubin.', basis: 'OFFICIAL_PAGE' });
    assert.ok(bodyOnly.facts.some(fact => fact.includes('원문에서 언급된 제품·플랫폼은 Vera Rubin')), 'a product only mentioned in the body is not called the centre of the announcement');
    assert.equal(bodyOnly.topic, '카자흐스탄 AI 컴퓨팅 인프라 확충');
});
test('an RSS-summary-only item can support but never lead the AI issue', () => {
    const base = { publisher: 'OpenAI', publishedAt: new Date().toISOString(), eventType: 'launch' };
    assert.deepEqual(selectAIEvents([{ ...base, topicId: 'a', basis: 'OFFICIAL_RSS_SUMMARY' }]), []);
    const picked = selectAIEvents([{ ...base, topicId: 'a', basis: 'OFFICIAL_RSS_SUMMARY' }, { ...base, topicId: 'b', publisher: 'NVIDIA', basis: 'OFFICIAL_PAGE', eventType: 'research' }]);
    assert.deepEqual(picked.map(item => item.topicId), ['b', 'a']);
});
const at = '2026-10-26T03:30:00Z';
const kz = 'Kazakhstan is building national AI infrastructure. The government and partners announced a new AI supercomputer powered by 2,000 NVIDIA Blackwell GPUs that will serve researchers, startups and public agencies across the country. The system, hosted in a sovereign data center in Almaty, will provide 50 megawatts of capacity for training and inference workloads.';
const vw = 'Volkswagen Group is putting Microsoft 365 Copilot to work across the company, rolling out the AI assistant to 50,000 employees in Germany and other markets after a pilot that showed faster document drafting and meeting summaries.';
const item = (t, l, d, s, c = '') => `<item><title>${t}</title><link>${l}</link><pubDate>${d}</pubDate><description><![CDATA[${s}]]></description>${c ? `<content:encoded><![CDATA[${c}]]></content:encoded>` : ''}</item>`;
function fetcherFor(extra = {}) {
    const feeds = {
        'blogs.nvidia.com/feed/': `<rss>${item('Kazakhstan Expands Compute for Its AI Future', 'https://blogs.nvidia.com/blog/kazakhstan-ai-compute-ecosystem/', 'Fri, 23 Oct 2026 02:00:13 +0000', 'Kazakhstan builds national AI compute.', kz)}${item('Old Covered Story About AI Factories', 'https://blogs.nvidia.com/blog/covered/', 'Fri, 23 Oct 2026 01:00:00 +0000', 'Covered.', kz)}${item('Kazakhstan AI compute (republished headline)', 'https://blogs.nvidia.com/blog/kazakhstan-ai-compute-ecosystem/?utm_source=feed', 'Fri, 23 Oct 2026 02:00:13 +0000', 'Same story.', kz)}</rss>`,
        'news.microsoft.com/source/feed/': `<rss>${item('Volkswagen Group putting Copilot to work across the company', 'https://news.microsoft.com/source/features/ai/volkswagen-copilot/', 'Fri, 23 Oct 2026 17:58:00 +0000', vw)}${item('Copilot news mirrored elsewhere', 'https://example.com/copilot-mirror', 'Fri, 23 Oct 2026 18:00:00 +0000', vw)}</rss>`,
        'openai.com/news/rss.xml': `<rss>${item('Securing our frontier model training environment', 'https://openai.com/index/securing', 'Fri, 23 Oct 2026 17:00:00 GMT', 'We describe new security controls protecting the infrastructure we use to train frontier models, including hardware isolation and continuous monitoring.')}</rss>`,
        'deepmind.google/blog/rss.xml': `<rss>${item('Mapping forest types with AI models', 'https://deepmind.google/blog/forest-types/', 'Thu, 22 Oct 2026 14:30:24 +0000', 'A new AI research model maps forest types.')}</rss>`,
        ...extra,
    };
    return (async (input) => {
        const url = String(input);
        for (const [key, value] of Object.entries(feeds))
            if (url.includes(key))
                return new Response(value);
        if (url.includes('openai.com/index'))
            return new Response('Forbidden', { status: 403 });
        if (url.includes('blogs.nvidia.com/blog/kazakhstan'))
            return new Response(`<html><head><meta property="article:published_time" content="2026-10-23T02:00:13+00:00"></head><body><article>${kz.split('. ').map(sentence => `<p>${sentence}.</p>`).join('')}</article></body></html>`);
        if (url.includes('blogs.nvidia.com/blog/covered'))
            return new Response(`<article><p>${kz}</p></article>`);
        if (url.includes('news.microsoft.com/source/features'))
            return new Response(`<html><head><meta property="article:published_time" content="2026-10-23T17:58:00+00:00"></head><body><article><p>${vw}</p></article></body></html>`);
        // DeepMind page claims a different publication date than its feed: rejected.
        if (url.includes('deepmind.google/blog/forest-types'))
            return new Response(`<html><head><meta property="article:published_time" content="2026-09-01T10:00:00Z"></head><body><article><p>${kz}</p></article></body></html>`);
        return new Response('<rss></rss>');
    });
}
test('official-source AI pipeline publishes a verified, evidence-bound Korean article and enforces source rules', async () => {
    const root = await mkdtemp(join(tmpdir(), 'motus-ai-ops-'));
    try {
        const covered = join(root, '2026-10-24', 'ai');
        await mkdir(covered, { recursive: true });
        await writeFile(join(covered, 'publish-ledger.jsonl'), JSON.stringify({ event: 'PUBLISHED', category: 'AI_INTELLIGENCE', fingerprint: 'sha256:published', sourceUrls: ['https://blogs.nvidia.com/blog/covered/'] }) + '\n', 'utf8');
        // A later failed rerun overwrote live-unit.json; the immutable ledger record still excludes the covered link.
        await writeFile(join(covered, 'live-unit.json'), JSON.stringify({ contentFingerprint: 'rerun', viewModel: { sources: [] } }), 'utf8');
        const result = await new RepositoryInternalDailyBuilder(fetcherFor(), {}, undefined, undefined, undefined, root).build('AI_INTELLIGENCE', at);
        assert.equal(result.state, 'LIVE_READY', String(result.reason));
        const unit = result.payload.unit, view = unit.viewModel, links = view.sources.map(source => source.url);
        assert.equal(unit.observedDate, '2026-10-26');
        assert.deepEqual(new Set(links), new Set(['https://blogs.nvidia.com/blog/kazakhstan-ai-compute-ecosystem/', 'https://news.microsoft.com/source/features/ai/volkswagen-copilot/']));
        assert.ok(!links.some(link => link.includes('example.com') || link.includes('covered') || link.includes('forest-types')), 'non-official, already-covered and date-mismatched items are excluded');
        assert.ok(view.issues[0].evidenceRefs[0].includes('kazakhstan'), 'full-text verified item leads');
        assert.equal(view.issues.filter(issue => issue.evidenceRefs[0].includes('kazakhstan')).length, 1, 'the same article URL under another headline is not a second issue');
        assert.ok(result.audit.some(entry => entry.status === 'FAILED' && entry.error === 'AI_PUBLICATION_DATE_MISMATCH'));
        assert.ok(result.audit.some(entry => entry.sourceId.startsWith('ai:rss-evidence:') && entry.url === 'https://openai.com/index/securing' && entry.status === 'PASS'), '403 pages fall back to recorded official RSS evidence');
        assert.ok(!links.includes('https://openai.com/index/securing'), 'but a thin RSS-only item is not published');
        const quality = evaluateEditorialQuality(unit.title, unit.render.html);
        assert.equal(quality.pass, true, quality.reasons.join(';'));
        assert.ok(quality.visibleText.length >= 900 && quality.proseBlockCount >= 4, 'meets the proposed 900-char/4-block depth gate');
        assert.match(quality.visibleText, /MOTUS 분석: /);
        assert.doesNotMatch(quality.visibleText, /rolling out the AI assistant|will provide 50 megawatts/);
        assert.equal(buildProductionVerification(result.payload, 'internal', result.audit, at).verification, 'VERIFIED');
    }
    finally {
        await rm(root, { recursive: true, force: true });
    }
});
test('a page that only exposes a meta description cannot lead', async () => {
    const desc = 'Microsoft expands Azure AI capacity in Germany with 5,000 GPUs available to 300 customers across the region this year.';
    const fetcher = (async (input) => {
        const url = String(input);
        if (url.includes('blogs.microsoft.com/feed/'))
            return new Response(`<rss>${item('Microsoft expands Azure AI capacity in Germany', 'https://blogs.microsoft.com/blog/azure-germany/', 'Sun, 25 Oct 2026 17:00:00 GMT', 'Short.')}</rss>`);
        if (url.includes('blogs.microsoft.com/blog/'))
            return new Response(`<html><head><meta name="description" content="${desc}"></head><body><div id="root"></div></body></html>`);
        return new Response('<rss></rss>');
    });
    const result = await new RepositoryInternalDailyBuilder(fetcher, {}, undefined, undefined, undefined, join(tmpdir(), 'motus-none-' + Date.now())).build('AI_INTELLIGENCE', at);
    assert.equal(result.state, 'SKIP');
});
test('an article URL that redirects off the publisher domain is excluded', async () => {
    const body = `<article><p>${'Kazakhstan expands AI compute with 2,000 NVIDIA Blackwell GPUs in a sovereign data center. '.repeat(4)}</p></article>`;
    const fetcher = (async (input) => {
        const url = String(input);
        if (url.includes('blogs.nvidia.com/feed/'))
            return new Response(`<rss>${item('Kazakhstan Expands Compute for Its AI Future', 'https://blogs.nvidia.com/blog/kz/', 'Sun, 25 Oct 2026 02:00:13 +0000', 'x')}</rss>`);
        if (url.includes('blogs.nvidia.com/blog/kz')) {
            const response = new Response(body);
            Object.defineProperty(response, 'url', { value: 'https://lookalike.example/kz' });
            return response;
        }
        return new Response('<rss></rss>');
    });
    const result = await new RepositoryInternalDailyBuilder(fetcher, {}, undefined, undefined, undefined, join(tmpdir(), 'motus-none-' + Date.now())).build('AI_INTELLIGENCE', at);
    assert.equal(result.state, 'SKIP');
    assert.ok(result.audit.some(entry => entry.error === 'AI_REDIRECT_OFF_OFFICIAL_DOMAIN'));
});
test('a single verified event still meets the 900-character / 4-block depth gate', async () => {
    const fetcher = (async (input) => {
        const url = String(input);
        if (url.includes('blogs.nvidia.com/feed/'))
            return new Response(`<rss>${item('Kazakhstan Expands Compute for Its AI Future', 'https://blogs.nvidia.com/blog/kz/', 'Sun, 25 Oct 2026 02:00:13 +0000', 'x')}</rss>`);
        if (url.includes('blogs.nvidia.com/blog/kz'))
            return new Response(`<article><p>${kz}</p></article>`);
        return new Response('<rss></rss>');
    });
    const result = await new RepositoryInternalDailyBuilder(fetcher, {}, undefined, undefined, undefined, join(tmpdir(), 'motus-none-' + Date.now())).build('AI_INTELLIGENCE', at);
    assert.equal(result.state, 'LIVE_READY');
    const quality = evaluateEditorialQuality(result.payload.unit.title, result.payload.unit.render.html);
    assert.ok(quality.visibleText.length >= 900 && quality.proseBlockCount >= 4, `len=${quality.visibleText.length} blocks=${quality.proseBlockCount}`);
    assert.match(quality.visibleText, /공식 AI 채널 \d+곳에서 최근 4일간 게시된 AI 발표 \d+건을 확인했고, 원문 출처와 발표일이 검증된 1건/);
});
test('RSS content that may be an excerpt cannot lead when the page is blocked', async () => {
    const long = 'Contoso announces Azure AI capacity in Germany with 5,000 GPUs for 300 customers. '.repeat(8);
    const fetcher = (async (input) => {
        const url = String(input);
        if (url.includes('blogs.microsoft.com/feed/'))
            return new Response(`<rss>${item('Microsoft expands Azure AI capacity in Germany', 'https://blogs.microsoft.com/blog/azure-germany/', 'Sun, 25 Oct 2026 17:00:00 GMT', 'Short.', long)}</rss>`);
        if (url.includes('blogs.microsoft.com/blog/'))
            return new Response('Forbidden', { status: 403 });
        return new Response('<rss></rss>');
    });
    const result = await new RepositoryInternalDailyBuilder(fetcher, {}, undefined, undefined, undefined, join(tmpdir(), 'motus-none-' + Date.now())).build('AI_INTELLIGENCE', at);
    assert.equal(result.state, 'SKIP');
    assert.equal(result.reason, 'AI_VERIFIED_EVENTS_INSUFFICIENT');
});
test('only RSS summaries available is a SKIP, not a forced article', async () => {
    const fetcher = (async (input) => {
        const url = String(input);
        if (url.includes('openai.com/news/rss.xml'))
            return new Response(`<rss>${item('Securing our frontier model training environment', 'https://openai.com/index/securing', 'Sun, 25 Oct 2026 17:00:00 GMT', 'We describe new security controls protecting the infrastructure we use to train frontier models, including hardware isolation and continuous monitoring.')}</rss>`);
        if (url.includes('openai.com/index'))
            return new Response('Forbidden', { status: 403 });
        return new Response('<rss></rss>');
    });
    const result = await new RepositoryInternalDailyBuilder(fetcher, {}, undefined, undefined, undefined, join(tmpdir(), 'motus-none-' + Date.now())).build('AI_INTELLIGENCE', at);
    assert.equal(result.state, 'SKIP');
    assert.equal(result.reason, 'AI_VERIFIED_EVENTS_INSUFFICIENT');
});
test('stated date comes from the page timestamp, channel from the article URL, and API names are not partners', async () => {
    const literacy = 'Public libraries have served as trusted centers of community learning across the United States for generations. Today, we are announcing a new initiative with the Public Library Association to expand no-cost AI literacy and skills training for public library workers and their patrons across 50 cities.';
    const fetcher = (async (input) => {
        const url = String(input);
        // The feed stamps the post after a later edit (KST 10/23); the page itself says 2026-10-22T14:00Z (KST 10/22 23:00).
        if (url.includes('news.microsoft.com/source/feed/'))
            return new Response(`<rss>${item('Microsoft and the Public Library Association expand free AI literacy training', 'https://blogs.microsoft.com/on-the-issues/2026/10/22/ai-literacy/', 'Thu, 22 Oct 2026 21:14:56 +0000', 'x')}</rss>`);
        if (url.includes('blogs.microsoft.com/on-the-issues/'))
            return new Response(`<html><head><meta property="article:published_time" content="2026-10-22T14:00:32+00:00"></head><body><article><p>${literacy}</p></article></body></html>`);
        return new Response('<rss></rss>');
    });
    const result = await new RepositoryInternalDailyBuilder(fetcher, {}, undefined, undefined, undefined, join(tmpdir(), 'motus-none-' + Date.now())).build('AI_INTELLIGENCE', at);
    assert.equal(result.state, 'LIVE_READY', String(result.reason));
    const text = evaluateEditorialQuality(result.payload.unit.title, result.payload.unit.render.html).visibleText;
    assert.match(text, /2026년 10월 22일\(한국 시간\) 공식 블로그에/);
    assert.doesNotMatch(text, /10월 23일\(한국 시간\)|공식 뉴스룸에/);
    const page = result.audit.find(entry => entry.sourceId === 'ai:page:1');
    assert.equal(page.dateField, 'page.datePublished');
    assert.equal(page.sourceTimestamp, '2026-10-22T14:00:32.000Z');
    const aws = synthesizeEvidenceBoundAIEvent({ topicId: 'a', publisher: 'Amazon AWS', sourceId: 'aws-whats-new', title: 'Web Search on Amazon Bedrock now supports domain filtering and user location controls', link: 'https://aws.amazon.com/about-aws/whats-new/2026/10/bedrock-web-search/', publishedAt: '2026-10-23T18:00:00Z', evidence: 'Web Search on Amazon Bedrock now gives you more control over the results that ground a model response. Both are configured directly on the web_search tool in your existing OpenAI Responses API request, and work with OpenAI-compatible clients.', basis: 'OFFICIAL_PAGE' });
    assert.doesNotMatch(aws.facts.join(' '), /오픈AI/);
    assert.match(aws.facts[0], /공식 What’s New 공지에/);
});

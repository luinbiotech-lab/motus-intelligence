import { assertAdminRequest } from './admin.js';
import { assertPublicBloggerHtmlSafe } from './blogger.js';
export async function updateExistingBloggerDraft(record, previewHtml, config, context, options) {
    assertAdminRequest({ ...context, action: 'BLOGGER_PUBLISH' });
    if (record.status !== 'DRAFT')
        throw new Error(`draft update requires DRAFT publication, received ${record.status}`);
    if (record.draftPostId !== options.expectedPostId)
        throw new Error('draft post ID mismatch');
    if (record.publicPostUrl !== null)
        throw new Error('draft update requires publicPostUrl=null');
    assertPublicBloggerHtmlSafe(previewHtml);
    const title = readHtmlTitle(previewHtml);
    if (title !== options.expectedTitle)
        throw new Error('preview title does not match expected SEO title');
    const content = extractBloggerArticle(previewHtml);
    const environment = options.environment ?? ((name) => process.env[name]);
    const fetcher = options.fetcher ?? fetch;
    const blogId = requiredConfigValue(config.blogIdEnvironmentVariable, config.blogId, environment, 'Blogger blogId');
    const accessToken = await refreshAccessToken(config, environment, fetcher);
    const before = await getPost(blogId, options.expectedPostId, accessToken, fetcher);
    assertTargetDraft(before, options.expectedPostId);
    const draftsBefore = await listDrafts(blogId, accessToken, fetcher);
    assertSingleTarget(draftsBefore, options.expectedPostId);
    await patchPost(blogId, options.expectedPostId, title, content, accessToken, fetcher);
    const after = await getPost(blogId, options.expectedPostId, accessToken, fetcher);
    const draftsAfter = await listDrafts(blogId, accessToken, fetcher);
    const verification = verifyUpdatedDraft(after, draftsBefore, draftsAfter, options.expectedPostId, title, content, blogId, options.expectedEditorialFocus, options.expectedLayout);
    const at = after.updated ?? options.now ?? new Date().toISOString();
    return {
        record: {
            ...record,
            title,
            seoTitle: title,
            html: previewHtml,
            status: 'DRAFT',
            draftPostId: options.expectedPostId,
            publicPostUrl: null,
            error: null,
            dryRun: false,
            updatedAt: at,
            history: [...record.history, { at, from: 'DRAFT', to: 'DRAFT', reason: 'existing Blogger draft title and content updated after local editorial review' }]
        },
        verification
    };
}
async function refreshAccessToken(config, environment, fetcher) {
    const refreshToken = requiredEnvironment(config.refreshTokenEnvironmentVariable, environment, 'Blogger refresh token');
    const clientId = requiredEnvironment(config.clientIdEnvironmentVariable, environment, 'Blogger client ID');
    const clientSecret = requiredEnvironment(config.clientSecretEnvironmentVariable, environment, 'Blogger client secret');
    const response = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }) });
    if (!response.ok)
        throw new Error(`Blogger OAuth refresh failed (${response.status}): ${await safeApiError(response)}`);
    const token = await response.json();
    if (!token.access_token?.trim())
        throw new Error('Blogger OAuth refresh response missing access token');
    return token.access_token.trim();
}
async function getPost(blogId, postId, accessToken, fetcher) {
    const endpoint = new URL(`https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(blogId)}/posts/${encodeURIComponent(postId)}`);
    endpoint.searchParams.set('view', 'ADMIN');
    endpoint.searchParams.set('fetchBody', 'true');
    const response = await fetcher(endpoint, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!response.ok)
        throw new Error(`Blogger posts.get failed (${response.status}): ${await safeApiError(response)}`);
    return await response.json();
}
async function patchPost(blogId, postId, title, content, accessToken, fetcher) {
    const endpoint = new URL(`https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(blogId)}/posts/${encodeURIComponent(postId)}`);
    const response = await fetcher(endpoint, { method: 'PATCH', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ title, content }) });
    if (!response.ok)
        throw new Error(`Blogger posts.patch failed (${response.status}): ${await safeApiError(response)}`);
}
async function listDrafts(blogId, accessToken, fetcher) {
    const drafts = [];
    let pageToken;
    for (let page = 0; page < 10; page++) {
        const endpoint = new URL(`https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(blogId)}/posts`);
        endpoint.searchParams.set('status', 'draft');
        endpoint.searchParams.set('view', 'ADMIN');
        endpoint.searchParams.set('fetchBodies', 'false');
        endpoint.searchParams.set('maxResults', '50');
        if (pageToken)
            endpoint.searchParams.set('pageToken', pageToken);
        const response = await fetcher(endpoint, { headers: { authorization: `Bearer ${accessToken}` } });
        if (!response.ok)
            throw new Error(`Blogger posts.list failed (${response.status}): ${await safeApiError(response)}`);
        const list = await response.json();
        drafts.push(...(list.items ?? []));
        pageToken = list.nextPageToken;
        if (!pageToken)
            return drafts;
    }
    throw new Error('Blogger draft list exceeded safe pagination limit');
}
function verifyUpdatedDraft(post, before, after, postId, title, expectedContent, blogId, expectedEditorialFocus, expectedLayout) {
    assertTargetDraft(post, postId);
    if (post.title !== title)
        throw new Error('updated Blogger draft title mismatch');
    const content = post.content ?? '';
    const h1Count = count(content, /<h1(?:\s|>)/gi);
    const marketDashboardCount = count(content, /class=["'][^"']*\bmarket-dashboard\b[^"']*["']/gi);
    const primarySourcesCount = count(content, /<h2\b[^>]*>\s*주요 출처\s*<\/h2>/gi);
    const visibleRawUrlCount = count(stripTags(content), /https?:\/\/\S+/gi);
    const unpublishedRelatedLinksCount = count(content, /<[a-z]+\b[^>]*class=["'][^"']*\brelated\b/gi);
    const duplicateDraftCount = after.filter(item => item.id !== postId && item.title === title).length;
    const marketDataUnchanged = normalizeHtml(extractMarketDashboard(content)) === normalizeHtml(extractMarketDashboard(expectedContent));
    const internalTokenCount = count(content, /\b(?:CLAIM-|AUTO_VALIDATED|REVIEW_REQUIRED|BLOCKED|DATA_NOT_CONNECTED|confidenceScore|verificationStatus|publicationVersion|draftPostId)\b/gi);
    const consumerCheckCount = count(content, /<h3>\s*미국 소비 체크\s*<\/h3>/gi);
    const aiMarkers = ['전날 글로벌 시장을 흔든 AI 종목', '10년물 국채금리가 5%', 'CAPEX가 실제 매출과 이익', '한국 반도체'];
    const markerPositions = aiMarkers.map(marker => content.indexOf(marker));
    const aiSemiconductorFocus = expectedEditorialFocus ? markerPositions.every((position, index) => position >= 0 && (index === 0 || position > markerPositions[index - 1])) : null;
    const consumerIndex = content.indexOf('미국 소비 체크');
    const daveConsumerAuxiliary = expectedEditorialFocus ? consumerCheckCount === 1 && content.indexOf("Dave &amp; Buster's", consumerIndex) > consumerIndex : null;
    const sectionOrder = expectedLayout ? [...content.matchAll(/<h2\b[^>]*>([^<]+)<\/h2>/g)].map(match => decodeHtml(match[1])) : null;
    const editorialBlockCount = expectedLayout ? count(content, /class=["'][^"']*\beditorial-block\b[^"']*["']/gi) : null;
    const glossaryCardCount = expectedLayout ? count(content, /class=["'][^"']*\bglossary-card\b[^"']*["']/gi) : null;
    const glossaryReferenceCount = expectedLayout ? count(content, /class=["'][^"']*\bglossary-row\b[^"']*["']/gi) : null;
    const sourceGroupCount = expectedLayout ? count(content, /class=["'][^"']*\bsource-group\b[^"']*["']/gi) : null;
    const koreaHighlightBox = expectedLayout ? /class=["'][^"']*\bblock-korea-market\b[^"']*["']/i.test(content) : null;
    const titleBarCount = expectedLayout ? count(content, /<section\b[^>]*class=["'][^"']*\beditorial-block\b[^"']*["'][^>]*><h2\b/gi) : null;
    const mobileHorizontalOverflowDisabled = expectedLayout ? content.includes('width:100%') && content.includes('max-width:100%') && content.includes('box-sizing:border-box') && !content.includes('overflow-x:auto') : null;
    const inlineStyleAttributeCount = expectedLayout ? count(content, /\sstyle=["'][^"']+["']/gi) : null;
    const titleBarInlineStyleCount = expectedLayout ? count(content, /<h2\b[^>]*style=["'][^"']*background:[^"']*color:[^"']*padding:[^"']*font-size:[^"']*font-weight:[^"']*margin:[^"']*["']/gi) : null;
    const contentBoxInlineStyleCount = expectedLayout ? count(content, /<div\b[^>]*class=["'][^"']*\beditorial-content\b[^"']*["'][^>]*style=["'][^"']*border:[^"']*padding:[^"']*background:[^"']*margin:[^"']*width:100%[^"']*max-width:100%[^"']*box-sizing:border-box[^"']*["']/gi) : null;
    const styleTagCount = expectedLayout ? count(content, /<style\b/gi) : null;
    const glossaryCompactTable = expectedLayout ? /<div\b[^>]*class=["'][^"']*\bglossary-reference\b[^"']*["'][^>]*style=["'][^"']*font-size:14px[^"']*["'][^>]*>\s*<table\b[^>]*style=["'][^"']*width:100%[^"']*table-layout:fixed[^"']*["']/i.test(content) : null;
    const sourceGroupsInlineStyled = expectedLayout ? /<div\b[^>]*class=["'][^"']*\bsource-groups\b[^"']*["'][^>]*style=["'][^"']*border:[^"']*background:[^"']*font-size:14px[^"']*["']/i.test(content) : null;
    const koreaInlineHighlight = expectedLayout ? /<section\b[^>]*class=["'][^"']*\bblock-korea-market\b[^"']*["'][^>]*>[\s\S]*?<div\b[^>]*class=["'][^"']*\beditorial-content\b[^"']*["'][^>]*style=["'][^"']*border:2px solid #8eabc9[^"']*background:#edf4fb[^"']*["']/i.test(content) : null;
    const titleBarContrast = expectedLayout ? count(content, /<h2\b[^>]*style=["'][^"']*background:#(?:03162e|17283d)[^"']*color:#ffffff[^"']*border:1px solid #[^"']*font-size:(?:20px|clamp\(18px,4\.8vw,20px\))[^"']*font-weight:800[^"']*["']/gi) === (expectedLayout === 'FINANCIAL_RESEARCH_V1' ? 9 : 8) : null;
    const marketTableReadability = expectedLayout ? /<table\b[^>]*style=["'][^"']*border:2px solid #183552[^"']*["'][^>]*>[\s\S]*?<th\b[^>]*style=["'][^"']*background:#0b2745[^"']*color:#ffffff[^"']*font-size:14px[^"']*font-weight:800[^"']*["'][^>]*>종가<\/th>[\s\S]*?<td\b[^>]*style=["'][^"']*font-weight:800[^"']*font-variant-numeric:tabular-nums[^"']*["']/i.test(content) : null;
    const glossaryFullSpelling = expectedLayout ? ['Capital Expenditure', 'Federal Open Market Committee', 'basis point', 'Treasury yield'].every(value => content.includes(value)) : null;
    const glossaryBlock = expectedLayout ? (content.match(/<section\b[^>]*data-section=["']glossary["'][^>]*>[\s\S]*?<\/section>/i)?.[0] ?? '') : '';
    const glossaryDictionaryStyle = expectedLayout ? !/(?:입니다|합니다)/.test(stripTags(glossaryBlock)) : null;
    const sourceBlock = expectedLayout ? (content.match(/<section\b[^>]*data-section=["']sources["'][^>]*>[\s\S]*?<\/section>/i)?.[0] ?? '') : '';
    const sourceLinkCount = expectedLayout ? count(sourceBlock, /<a\b[^>]*href=["']https:\/\/[^"']+["'][^>]*style=["'][^"']*color:#0759a6[^"']*text-decoration:underline[^"']*["'][^>]*>/gi) : 0;
    const sourceLinksClickable = expectedLayout ? sourceLinkCount > 0 && visibleRawUrlCount === 0 : null;
    const graphBlock = expectedLayout ? (content.match(/<section\b[^>]*data-section=["']major-index-trend["'][^>]*>[\s\S]*?<\/section>/i)?.[0] ?? '') : '';
    const lineChartCount = expectedLayout ? count(graphBlock, /<svg\b[^>]*class=["']index-line-chart["']/gi) : null;
    const graphSectionRendered = expectedLayout ? Boolean(graphBlock && /data-chart-status=["']rendered["']/.test(graphBlock) && lineChartCount === 4) : null;
    const graphIndexCoverage = expectedLayout ? ['sp500', 'nasdaq', 'dow-jones', 'russell-2000'].every(key => graphBlock.includes(`data-index="${key}"`)) : null;
    const oldBarChartRemoved = expectedLayout ? !/major-index-chart|막대그래프|data-change=|당일 등락률 · 0% 기준/i.test(graphBlock) : null;
    const fiveSessionCoverage = expectedLayout ? count(graphBlock, /data-values=["'][^"']+(?:,[^,"']+){4}["']/gi) === 4 : null;
    const chartTwoByTwoLayout = expectedLayout ? /data-layout=["']responsive-two-by-two["'][^>]*style=["'][^"']*display:grid[^"']*grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,260px\),1fr\)\)[^"']*max-width:100%[^"']*min-width:0[^"']*box-sizing:border-box/i.test(graphBlock) && count(graphBlock, /class=["']index-trend-cell["']/gi) === 4 && count(graphBlock, /<svg\b[^>]*width=["']100%["']/gi) === 4 && count(graphBlock, /class=["']index-trend-card["']/gi) === 4 : null;
    const chartProvenancePresent = expectedLayout ? ['S&amp;P Dow Jones Indices', 'Nasdaq', 'FTSE Russell'].every(label => graphBlock.includes(label)) && chartCaptionMatchesSeries(graphBlock) : null;
    const graphBloggerSafe = expectedLayout ? Boolean(graphBlock && lineChartCount === 4 && count(graphBlock, /<polyline\b/gi) === 4 && !/<script\b|javascript:|<foreignObject\b|<iframe\b|\son\w+\s*=/i.test(graphBlock)) : null;
    const expectedSections = expectedLayout === 'FINANCIAL_RESEARCH_V1' ? ['핵심 요약', '시장 한눈에 보기', '미국 주요 증시 추이', '시장을 움직인 핵심 요인', 'AI·반도체 / 주요 산업', '한국시장 연결 포인트', '오늘 체크리스트', '용어설명', '주요 출처'] : ['Opening Summary', '시장 한눈에 보기', '시장을 움직인 핵심 요인', 'AI·반도체 / 주요 산업', '한국시장 연결 포인트', '오늘 체크리스트', '용어해설', '주요 출처'];
    if (h1Count !== 0)
        throw new Error(`updated Blogger draft contains ${h1Count} H1 elements`);
    if (marketDashboardCount !== 1)
        throw new Error(`updated Blogger draft contains ${marketDashboardCount} market dashboards`);
    if (primarySourcesCount !== 1)
        throw new Error(`updated Blogger draft contains ${primarySourcesCount} primary source sections`);
    if (visibleRawUrlCount !== 0)
        throw new Error(`updated Blogger draft exposes ${visibleRawUrlCount} raw URLs`);
    if (unpublishedRelatedLinksCount !== 0)
        throw new Error(`updated Blogger draft exposes ${unpublishedRelatedLinksCount} unpublished related sections`);
    if (before.length !== after.length)
        throw new Error(`draft count changed during patch (${before.length} -> ${after.length})`);
    if (duplicateDraftCount !== 0)
        throw new Error(`duplicate Blogger drafts found: ${duplicateDraftCount}`);
    if (!marketDataUnchanged)
        throw new Error('updated Blogger draft changed market dashboard values');
    if (internalTokenCount !== 0)
        throw new Error(`updated Blogger draft exposes ${internalTokenCount} internal tokens`);
    if (expectedEditorialFocus && (!aiSemiconductorFocus || !daveConsumerAuxiliary))
        throw new Error('updated Blogger draft editorial focus verification failed');
    if (expectedLayout === 'CATEGORY_BLOCK_V1' && (JSON.stringify(sectionOrder) !== JSON.stringify(expectedSections) || editorialBlockCount !== 8 || glossaryCardCount !== 4 || sourceGroupCount !== 3 || !koreaHighlightBox))
        throw new Error('updated Blogger draft category block verification failed');
    if (expectedLayout === 'FINANCIAL_RESEARCH_V1' && (JSON.stringify(sectionOrder) !== JSON.stringify(expectedSections) || editorialBlockCount !== 9 || titleBarCount !== 9 || glossaryCardCount !== 0 || glossaryReferenceCount !== 4 || sourceGroupCount !== 3 || !koreaHighlightBox || !mobileHorizontalOverflowDisabled || titleBarInlineStyleCount !== 9 || contentBoxInlineStyleCount !== 9 || styleTagCount !== 0 || !glossaryCompactTable || !sourceGroupsInlineStyled || !koreaInlineHighlight || !titleBarContrast || !marketTableReadability || !glossaryFullSpelling || !glossaryDictionaryStyle || !sourceLinksClickable || !graphSectionRendered || !graphIndexCoverage || !graphBloggerSafe || !oldBarChartRemoved || !fiveSessionCoverage || !chartTwoByTwoLayout || !chartProvenancePresent))
        throw new Error('updated Blogger draft financial research inline layout verification failed');
    assertSingleTarget(after, postId);
    return { postId, status: 'DRAFT', title, h1Count, marketDashboardCount, primarySourcesCount, visibleRawUrlCount, unpublishedRelatedLinksCount, duplicateDraftCount, marketDataUnchanged, internalTokenCount, aiSemiconductorFocus, consumerCheckCount, daveConsumerAuxiliary, sectionOrder, editorialBlockCount, glossaryCardCount, glossaryReferenceCount, sourceGroupCount, koreaHighlightBox, titleBarCount, mobileHorizontalOverflowDisabled, inlineStyleAttributeCount, titleBarInlineStyleCount, contentBoxInlineStyleCount, styleTagCount, glossaryCompactTable, sourceGroupsInlineStyled, koreaInlineHighlight, titleBarContrast, marketTableReadability, glossaryFullSpelling, glossaryDictionaryStyle, sourceLinksClickable, graphSectionRendered, graphIndexCoverage, graphBloggerSafe, oldBarChartRemoved, lineChartCount, fiveSessionCoverage, chartTwoByTwoLayout, chartProvenancePresent, adminDraftUrl: `https://www.blogger.com/blog/post/edit/${encodeURIComponent(blogId)}/${encodeURIComponent(postId)}`, draftCountBefore: before.length, draftCountAfter: after.length, updatedAt: post.updated ?? null };
}
function chartCaptionMatchesSeries(html) { const dates = [...html.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map(match => match[0]).sort(); if (!dates.length)
    return false; const first = dates[0], last = dates.at(-1); const [fy, fm, fd] = first.split('-').map(Number); const [ly, lm, ld] = last.split('-').map(Number); return html.includes(`${fy}년 ${fm}월 ${fd}일~${fy === ly ? '' : `${ly}년 `}${lm}월 ${ld}일 정규장 종가`); }
function assertTargetDraft(post, postId) {
    if (post.id !== postId)
        throw new Error('Blogger API returned a different post ID');
    if (post.status?.toUpperCase() !== 'DRAFT')
        throw new Error(`Blogger post is not DRAFT (${post.status ?? 'missing status'})`);
}
function assertSingleTarget(posts, postId) {
    if (posts.filter(post => post.id === postId).length !== 1)
        throw new Error('target Blogger draft is missing or duplicated in draft list');
}
function requiredEnvironment(name, environment, label) {
    if (!name?.trim())
        throw new Error(`missing ${label} environment variable name`);
    const value = environment(name)?.trim();
    if (!value)
        throw new Error(`missing ${label}`);
    return value;
}
function requiredConfigValue(environmentName, fallback, environment, label) {
    const value = (environmentName?.trim() ? environment(environmentName) : undefined)?.trim() || fallback?.trim();
    if (!value)
        throw new Error(`missing ${label}`);
    return value;
}
function readHtmlTitle(html) {
    const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
    if (!title)
        throw new Error('preview HTML is missing title');
    return title;
}
function extractBloggerArticle(html) {
    const article = html.match(/<article\b[^>]*>[\s\S]*<\/article>/i)?.[0];
    if (!article)
        throw new Error('preview HTML is missing Blogger article content');
    return article;
}
function stripTags(html) { return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '); }
function extractMarketDashboard(html) { return html.match(/<div\b[^>]*class=["'][^"']*\bmarket-dashboard\b[^"']*["'][^>]*>[\s\S]*?<\/div>/i)?.[0] ?? ''; }
function normalizeHtml(html) { return html.replace(/\s+/g, ' ').trim(); }
function decodeHtml(value) { return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }
function count(value, pattern) { return [...value.matchAll(pattern)].length; }
async function safeApiError(response) {
    try {
        const parsed = JSON.parse(await response.text());
        return [parsed.error?.status, parsed.error?.message].filter(Boolean).join(' - ').slice(0, 300) || 'request failed';
    }
    catch {
        return 'request failed';
    }
}

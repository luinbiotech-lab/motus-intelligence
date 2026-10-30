import { normalizeNaverDataLab, normalizeSearchConsoleDemand } from './intelligence.js';
export class NaverDataLabProvider {
    request;
    credentials;
    fetcher;
    providerId = 'NAVER_DATALAB';
    constructor(request, credentials, fetcher = fetch) {
        this.request = request;
        this.credentials = credentials;
        this.fetcher = fetcher;
    }
    async collect(topics, collectedAt) {
        if (!this.credentials.clientId.trim() || !this.credentials.clientSecret.trim())
            throw new Error('NAVER_DATALAB_NOT_CONFIGURED');
        const allowed = new Set(topics.flatMap(topic => [topic.label, ...topic.aliases].map(normalize)));
        const keywordGroups = this.request.keywordGroups.filter(group => [group.groupName, ...group.keywords].some(value => allowed.has(normalize(value))));
        if (!keywordGroups.length)
            return [];
        const response = await this.fetcher('https://naverapihub.apigw.ntruss.com/search-trend/v1/search', { method: 'POST', headers: { 'content-type': 'application/json', 'X-NCP-APIGW-API-KEY-ID': this.credentials.clientId.trim(), 'X-NCP-APIGW-API-KEY': this.credentials.clientSecret.trim() }, body: JSON.stringify({ ...this.request, keywordGroups }) });
        if (!response.ok)
            throw new Error(await naverHubHttpError(response));
        return normalizeNaverDataLab({ response: await response.json(), topics, collectedAt });
    }
}
export class GoogleSearchConsoleSignalProvider {
    adapter;
    request;
    providerId = 'GOOGLE_SEARCH_CONSOLE';
    constructor(adapter, request) {
        this.adapter = adapter;
        this.request = request;
    }
    async collect(topics, collectedAt) {
        const dimensions = this.request.dimensions.includes('query') ? this.request.dimensions : [...this.request.dimensions, 'query'];
        const records = await this.adapter.getSearchAnalytics({ ...this.request, dimensions });
        return normalizeSearchConsoleDemand({ records, topics, periodStart: this.request.startDate, periodEnd: this.request.endDate, collectedAt });
    }
}
export async function collectDemandSignals(providers, topics, collectedAt) {
    const states = { NAVER_DATALAB: 'NOT_CONFIGURED', GOOGLE_SEARCH_CONSOLE: 'NOT_CONFIGURED' };
    const mutable = { ...states };
    const signals = [];
    const warnings = [];
    for (const provider of providers)
        try {
            signals.push(...await provider.collect(topics, collectedAt));
            mutable[provider.providerId] = 'AVAILABLE';
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'provider failed';
            mutable[provider.providerId] = message.includes('NOT_CONFIGURED') ? 'NOT_CONFIGURED' : 'FAILED';
            warnings.push(`${provider.providerId}:${message}`);
        }
    return { signals, states: mutable, warnings };
}
function normalize(value) { return value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9가-힣]+/g, ' ').trim(); }
/**
 * API HUB error detail without secrets. errorCode 200 "Authentication Failed" means the gateway rejected the Client ID/Secret pair itself
 * (wrong or mismatched pair, or Developers Center keys); a pair without Search Trend permission is reported separately by the gateway.
 */
export async function naverHubHttpError(response) {
    let code = '';
    try {
        const body = await response.json();
        const raw = body.error?.errorCode ?? body.errorCode;
        code = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '';
    }
    catch { }
    // Gateway error codes are short numerics (200 auth failed, 210 permission denied, 300 not found, 4xx quota...); anything else is dropped.
    const safe = /^\d{3}$/.test(code) ? code : '';
    return `NAVER_DATALAB_HTTP_${response.status}${safe ? ':' + safe : ''}`;
}

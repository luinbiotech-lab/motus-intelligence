import { normalizeGoogleAnalytics, normalizeUrlInspection } from './measurement.js';
export class OAuthGoogleSearchConsoleAdapter {
    config;
    fetcher;
    connectionState = 'CONNECTED';
    token = null;
    constructor(config, fetcher = fetch) {
        this.config = config;
        this.fetcher = fetcher;
    }
    async getSearchAnalytics(r) { if (r.propertyId !== this.config.propertyId)
        throw new Error('SEARCH_CONSOLE_PROPERTY_MISMATCH'); const response = await this.call('https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(r.propertyId) + '/searchAnalytics/query', { method: 'POST', body: JSON.stringify({ startDate: r.startDate, endDate: r.endDate, dimensions: r.dimensions }) }); const data = await response.json(); return normalizeGoogleAnalytics({ propertyId: r.propertyId, dimensions: r.dimensions, rows: (data.rows ?? []).map(x => ({ keys: x.keys ?? [], clicks: x.clicks ?? 0, impressions: x.impressions ?? 0, ctr: x.ctr ?? 0, position: x.position ?? 0 })), collectedAt: new Date().toISOString() }); }
    async inspectUrl(url, propertyId) { const response = await this.call('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', { method: 'POST', body: JSON.stringify({ inspectionUrl: url, siteUrl: propertyId }) }); return normalizeUrlInspection((await response.json()).inspectionResult ?? null, url, new Date().toISOString()); }
    async listSitemaps(propertyId) { const response = await this.call('https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(propertyId) + '/sitemaps'); const data = await response.json(), at = new Date().toISOString(); return (data.sitemap ?? []).filter(x => x.path).map(x => ({ url: x.path, status: 'AVAILABLE', lastCheckedAt: at, httpStatus: null, entryCount: null, lastModified: x.lastSubmitted ?? null, submissionState: 'SUBMITTED', provenance: 'Google Search Console API read-only' })); }
    async getSite(propertyId) { const response = await this.call('https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(propertyId)); const data = await response.json(); return { propertyId, permissionLevel: data.permissionLevel ?? null, state: 'CONNECTED' }; }
    async call(url, init = {}) { const token = await this.accessToken(), response = await this.fetcher(url, { ...init, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(20000) }); if (!response.ok)
        throw new Error('SEARCH_CONSOLE_HTTP_' + response.status); return response; }
    async accessToken() { if (this.token && this.token.expiresAt > Date.now())
        return this.token.value; const response = await this.fetcher('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret, refresh_token: this.config.refreshToken, grant_type: 'refresh_token' }), signal: AbortSignal.timeout(20000) }); if (!response.ok)
        throw new Error('SEARCH_CONSOLE_OAUTH_' + response.status); const data = await response.json(); if (!data.access_token)
        throw new Error('SEARCH_CONSOLE_ACCESS_TOKEN_MISSING'); this.token = { value: data.access_token, expiresAt: Date.now() + Math.max(60, (data.expires_in ?? 3600) - 60) * 1000 }; return data.access_token; }
}
export function searchConsoleFromEnvironment(e = process.env) { const propertyId = e.GOOGLE_SEARCH_CONSOLE_PROPERTY?.trim(), clientId = e.SEARCH_CONSOLE_CLIENT_ID?.trim(), clientSecret = e.SEARCH_CONSOLE_CLIENT_SECRET?.trim(), refreshToken = e.SEARCH_CONSOLE_REFRESH_TOKEN?.trim(); return propertyId && clientId && clientSecret && refreshToken ? new OAuthGoogleSearchConsoleAdapter({ propertyId, clientId, clientSecret, refreshToken }) : null; }

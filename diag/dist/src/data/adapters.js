import { marketChange } from '../utils/calculations.js';
export class UnconnectedAdapter {
    async collect(source) {
        return { sourceId: source.sourceId, status: 'DATA_NOT_CONNECTED', records: [], message: '자동 API 미연결. 출처를 기재한 수동 입력만 지원합니다.' };
    }
}
const treasuryUrl = (date) => `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/all/${date.slice(0, 4)}${date.slice(5, 7)}?type=daily_treasury_yield_curve&field_tdr_date_value_month=${date.slice(0, 4)}${date.slice(5, 7)}`;
const parseDate = (value) => { const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return match ? `${match[3]}-${match[1]}-${match[2]}` : null; };
const splitCsv = (line) => line.split(',').map(value => value.trim().replace(/^"|"$/g, ''));
const provenance = (sourceId, sourceUrl, observedAt, collectedAt) => ({ sourceId, sourceUrl, observedAt, collectedAt });
const round = (value, decimals = 2) => Number(value.toFixed(decimals));
const previousMonth = (period, months = 1) => { const [year, month] = period.split('-').map(Number); const date = new Date(Date.UTC(year, month - 1 - months, 1)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`; };
export class TreasuryYieldAdapter {
    fetcher;
    constructor(fetcher = globalThis.fetch) {
        this.fetcher = fetcher;
    }
    async collect(source, options) {
        if (!options)
            return { sourceId: source.sourceId, status: 'REVIEW_REQUIRED', records: [], message: 'tradingDate/observedAt/collectedAt 옵션 필요' };
        const url = treasuryUrl(options.tradingDate);
        try {
            const response = await this.fetcher(url, { signal: AbortSignal.timeout(options.timeoutMs ?? 10000), headers: { Accept: 'text/csv', 'User-Agent': 'us-market-close-report/0.2' } });
            if (response.status === 429)
                return { sourceId: source.sourceId, status: 'REVIEW_REQUIRED', records: [], message: 'Treasury rate limit' };
            if (!response.ok)
                return { sourceId: source.sourceId, status: 'SOURCE_UNAVAILABLE', records: [], message: `Treasury HTTP ${response.status}` };
            const body = await response.text();
            if (!body.trim())
                return { sourceId: source.sourceId, status: 'NO_DATA', records: [], message: 'Treasury empty response' };
            const lines = body.replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter(Boolean);
            const header = splitCsv(lines[0] ?? '');
            const dateIndex = header.indexOf('Date'), twoIndex = header.indexOf('2 Yr'), tenIndex = header.indexOf('10 Yr');
            if (dateIndex < 0 || twoIndex < 0 || tenIndex < 0)
                return { sourceId: source.sourceId, status: 'REVIEW_REQUIRED', records: [], message: 'Treasury malformed header' };
            const rows = lines.slice(1).map(splitCsv).map(values => ({ values, date: parseDate(values[dateIndex] ?? '') })).filter((row) => row.date !== null).sort((a, b) => a.date.localeCompare(b.date));
            const position = rows.findIndex(row => row.date === options.tradingDate);
            if (position < 0)
                return { sourceId: source.sourceId, status: 'NO_DATA', records: [], message: 'Treasury requested date absent' };
            const current = rows[position], previous = rows[position - 1];
            if (!previous)
                return { sourceId: source.sourceId, status: 'NO_DATA', records: [], message: 'Treasury previous trading day absent' };
            const make = (symbol, index) => {
                const close = Number(current.values[index]), previousClose = Number(previous.values[index]);
                const calculation = marketChange(close, previousClose);
                if (!Number.isFinite(close) || !Number.isFinite(previousClose) || calculation.status !== 'OK')
                    return null;
                return { id: options.recordIds?.[symbol] ?? `TREASURY-${symbol}-${options.tradingDate}`, sample: false, sourceId: source.sourceId, sourceUrl: url, observedAt: options.observedAt, collectedAt: options.collectedAt, unit: 'percent', status: 'OK', missingReasons: { volume: '금리 지표에는 거래량 미적용' }, collectionMode: 'API', verificationUrls: [url], fieldProvenance: { close: provenance(source.sourceId, url, options.observedAt, options.collectedAt), previousClose: provenance(source.sourceId, url, options.observedAt, options.collectedAt), changePct: provenance(source.sourceId, url, options.observedAt, options.collectedAt) }, market: 'US', tradingDate: options.tradingDate, symbol, instrumentType: 'YIELD', close, previousClose, change: calculation.raw.change, changePct: calculation.display.changePct, volume: null, currency: 'USD' };
            };
            const records = [make('US2Y', twoIndex), make('US10Y', tenIndex)].filter((record) => record !== null);
            if (records.length !== 2)
                return { sourceId: source.sourceId, status: 'REVIEW_REQUIRED', records: [], message: 'Treasury invalid numeric response' };
            const age = Date.parse(options.collectedAt) - Date.parse(options.observedAt);
            if (age > source.maxAgeMinutes * 60000)
                return { sourceId: source.sourceId, status: 'DELAYED', records, message: 'Treasury data exceeds source freshness threshold' };
            return { sourceId: source.sourceId, status: 'OK', records, message: 'Treasury 2Y/10Y normalized' };
        }
        catch (error) {
            const name = error instanceof Error ? error.name : '';
            return { sourceId: source.sourceId, status: 'SOURCE_UNAVAILABLE', records: [], message: name === 'TimeoutError' || name === 'AbortError' ? 'Treasury timeout' : `Treasury unavailable: ${String(error)}` };
        }
    }
}
export class BlsCpiAdapter {
    fetcher;
    constructor(fetcher = globalThis.fetch) {
        this.fetcher = fetcher;
    }
    async collect(source, options) {
        if (!options?.period || !options.releaseTime)
            return { sourceId: source.sourceId, status: 'REVIEW_REQUIRED', records: [], message: 'period/releaseTime 옵션 필요' };
        if (Date.parse(options.collectedAt) < Date.parse(options.releaseTime))
            return { sourceId: source.sourceId, status: 'NOT_RELEASED', records: [], message: 'BLS release scheduled but not yet published' };
        const seriesId = options.seriesId ?? 'CUSR0000SA0';
        const startYear = Number(options.period.slice(0, 4)) - 1, endYear = Number(options.period.slice(0, 4));
        const url = `https://api.bls.gov/publicAPI/v2/timeseries/data/${seriesId}?startyear=${startYear}&endyear=${endYear}`;
        try {
            const response = await this.fetcher(url, { signal: AbortSignal.timeout(options.timeoutMs ?? 10000), headers: { Accept: 'application/json', 'User-Agent': 'us-market-close-report/0.2' } });
            if (response.status === 429)
                return { sourceId: source.sourceId, status: 'REVIEW_REQUIRED', records: [], message: 'BLS rate limit' };
            if (!response.ok)
                return { sourceId: source.sourceId, status: 'SOURCE_UNAVAILABLE', records: [], message: `BLS HTTP ${response.status}` };
            const body = await response.text();
            if (!body.trim())
                return { sourceId: source.sourceId, status: 'NO_DATA', records: [], message: 'BLS empty response' };
            let parsed;
            try {
                parsed = JSON.parse(body);
            }
            catch {
                return { sourceId: source.sourceId, status: 'REVIEW_REQUIRED', records: [], message: 'BLS malformed JSON' };
            }
            if (parsed.status && parsed.status !== 'REQUEST_SUCCEEDED')
                return { sourceId: source.sourceId, status: 'NO_DATA', records: [], message: `BLS ${parsed.status}: ${(parsed.message ?? []).join('; ')}` };
            const data = parsed.Results?.series?.[0]?.data;
            if (!Array.isArray(data))
                return { sourceId: source.sourceId, status: 'REVIEW_REQUIRED', records: [], message: 'BLS malformed response' };
            const byPeriod = new Map(data.filter(row => /^M\d{2}$/.test(row.period)).map(row => [`${row.year}-${row.period.slice(1)}`, Number(row.value)]));
            const current = byPeriod.get(options.period), previousIndex = byPeriod.get(previousMonth(options.period)), twoBack = byPeriod.get(previousMonth(options.period, 2));
            if (current === undefined)
                return { sourceId: source.sourceId, status: 'NO_DATA', records: [], message: 'BLS release not available for requested period' };
            if (previousIndex === undefined || twoBack === undefined)
                return { sourceId: source.sourceId, status: 'NO_DATA', records: [], message: 'BLS previous periods unavailable' };
            if (!Number.isFinite(current) || !Number.isFinite(previousIndex) || !Number.isFinite(twoBack) || previousIndex === 0 || twoBack === 0)
                return { sourceId: source.sourceId, status: 'REVIEW_REQUIRED', records: [], message: 'BLS invalid numeric response' };
            const actual = round(((current - previousIndex) / previousIndex) * 100);
            const previous = round(((previousIndex - twoBack) / twoBack) * 100);
            const fp = provenance(source.sourceId, url, options.releaseTime, options.collectedAt);
            const record = { id: options.recordId ?? `BLS-CPI-MOM-${options.period}`, sample: false, sourceId: source.sourceId, sourceUrl: url, observedAt: options.releaseTime, collectedAt: options.collectedAt, unit: options.unit ?? 'percent', status: 'OK', missingReasons: { consensus: 'BLS 공식 API는 시장 컨센서스를 제공하지 않음' }, collectionMode: 'API', verificationUrls: [url], fieldProvenance: { actual: fp, previous: fp, revisedPrevious: fp }, indicatorId: options.indicatorId ?? 'CPI_U_MOM', indicatorName: options.indicatorName ?? '미국 CPI-U 전월 대비', releaseTime: options.releaseTime, period: options.period, actual, consensus: null, previous, revisedPrevious: previous, adjustmentType: options.adjustmentType ?? 'SA' };
            const age = Date.parse(options.collectedAt) - Date.parse(options.releaseTime);
            if (age > source.maxAgeMinutes * 60000)
                return { sourceId: source.sourceId, status: 'DELAYED', records: [record], message: 'BLS data exceeds source freshness threshold' };
            return { sourceId: source.sourceId, status: 'OK', records: [record], message: 'BLS CPI normalized without consensus' };
        }
        catch (error) {
            const name = error instanceof Error ? error.name : '';
            return { sourceId: source.sourceId, status: 'SOURCE_UNAVAILABLE', records: [], message: name === 'TimeoutError' || name === 'AbortError' ? 'BLS timeout' : `BLS unavailable: ${String(error)}` };
        }
    }
}
export class SecEdgarAdapter {
    fetcher;
    minIntervalMs;
    lastRequestAt = 0;
    constructor(fetcher = globalThis.fetch, minIntervalMs = 100) {
        this.fetcher = fetcher;
        this.minIntervalMs = minIntervalMs;
    }
    async collect(source, options) {
        if (!options?.cik)
            return { sourceId: source.sourceId, status: 'REVIEW_REQUIRED', records: [], message: 'cik 옵션 필요' };
        const padded = options.cik.padStart(10, '0');
        const url = `https://data.sec.gov/submissions/CIK${padded}.json`;
        const allowedForms = new Set(['8-K', '10-Q', '10-K']);
        const requestedForms = (options.forms ?? ['8-K', '10-Q', '10-K']).filter(form => allowedForms.has(form));
        if (!requestedForms.length)
            return { sourceId: source.sourceId, status: 'REVIEW_REQUIRED', records: [], message: '지원하지 않는 SEC form' };
        try {
            const response = await this.request(url, options.timeoutMs ?? 10000);
            if (response.status === 429)
                return { sourceId: source.sourceId, status: 'SOURCE_UNAVAILABLE', records: [], message: 'SEC rate limit' };
            if (!response.ok)
                return { sourceId: source.sourceId, status: 'SOURCE_UNAVAILABLE', records: [], message: `SEC HTTP ${response.status}` };
            const body = await response.text();
            if (!body.trim())
                return { sourceId: source.sourceId, status: 'NO_DATA', records: [], message: 'SEC empty response' };
            let parsed;
            try {
                parsed = JSON.parse(body);
            }
            catch {
                return { sourceId: source.sourceId, status: 'REVIEW_REQUIRED', records: [], message: 'SEC malformed JSON' };
            }
            const recent = parsed.filings?.recent;
            if (!recent || !Array.isArray(recent.accessionNumber) || !Array.isArray(recent.form))
                return { sourceId: source.sourceId, status: 'REVIEW_REQUIRED', records: [], message: 'SEC malformed response' };
            const records = [];
            const seen = new Set();
            let duplicate = false;
            for (let index = 0; index < recent.accessionNumber.length; index++) {
                const form = String(recent.form[index] ?? '');
                const accession = String(recent.accessionNumber[index] ?? '');
                if (options.accessionNumber && accession !== options.accessionNumber)
                    continue;
                if (!requestedForms.includes(form))
                    continue;
                if (seen.has(accession)) {
                    duplicate = true;
                    continue;
                }
                seen.add(accession);
                const primaryDocument = String(recent.primaryDocument?.[index] ?? '');
                const filingDate = String(recent.filingDate?.[index] ?? '');
                const reportDate = String(recent.reportDate?.[index] ?? '');
                if (!accession || !primaryDocument || !filingDate)
                    continue;
                const accessionPath = accession.replace(/-/g, '');
                const cikPlain = String(Number(options.cik));
                const filingUrl = `https://www.sec.gov/Archives/edgar/data/${cikPlain}/${accessionPath}/${primaryDocument}`;
                const filedAt = options.acceptedAt ?? `${filingDate}T20:00:00Z`;
                const fp = provenance(source.sourceId, url, filedAt, options.collectedAt);
                records.push({ id: options.recordId ?? `SEC-${accession}`, sample: false, sourceId: source.sourceId, sourceUrl: url, observedAt: filedAt, collectedAt: options.collectedAt, unit: 'text', status: 'OK', missingReasons: options.acceptedAt ? {} : { filedAt: 'SEC submissions endpoint provides filingDate/reportDate, not accepted timestamp' }, collectionMode: 'API', verificationUrls: [url, filingUrl], fieldProvenance: { accessionNumber: fp, formType: fp, filedAt: fp, period: fp, primaryDocument: fp, filingUrl: fp }, companyId: options.companyId ?? options.ticker ?? padded, ticker: options.ticker ?? parsed.tickers?.[0] ?? 'UNKNOWN', formType: form, accessionNumber: accession, filedAt, period: reportDate || 'UNKNOWN', extractedFacts: [`SEC submissions metadata: ${form} ${accession}`, `primaryDocument=${primaryDocument}`], cik: padded, companyName: options.companyName ?? parsed.name ?? 'UNKNOWN', primaryDocument, filingUrl, ...(options.acceptedAt ? { acceptedAt: options.acceptedAt, timestampPrecision: 'ACCEPTED_TIMESTAMP' } : { filedDate: filingDate, timestampPrecision: 'DATE' }) });
                if (options.accessionNumber)
                    break;
            }
            if (duplicate)
                return { sourceId: source.sourceId, status: 'REVIEW_REQUIRED', records: [], message: 'SEC duplicate accession in response' };
            if (!records.length)
                return { sourceId: source.sourceId, status: 'NO_DATA', records: [], message: 'SEC requested filing missing' };
            return { sourceId: source.sourceId, status: 'OK', records, message: 'SEC filing metadata normalized' };
        }
        catch (error) {
            const name = error instanceof Error ? error.name : '';
            return { sourceId: source.sourceId, status: 'SOURCE_UNAVAILABLE', records: [], message: name === 'TimeoutError' || name === 'AbortError' ? 'SEC timeout' : `SEC unavailable: ${String(error)}` };
        }
    }
    async request(url, timeoutMs) {
        const wait = Math.max(0, this.minIntervalMs - (Date.now() - this.lastRequestAt));
        if (wait)
            await new Promise(resolve => setTimeout(resolve, wait));
        this.lastRequestAt = Date.now();
        return this.fetcher(url, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json', 'User-Agent': 'us-market-close-report/0.2 contact: codex@local' } });
    }
}

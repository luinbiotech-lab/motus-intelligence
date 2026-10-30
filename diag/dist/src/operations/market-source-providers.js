export class TwelveDataTimeSeriesProvider {
    environment;
    fetcher;
    providerId = 'twelve-data-v1';
    constructor(environment = process.env, fetcher = fetch) {
        this.environment = environment;
        this.fetcher = fetcher;
    }
    async fetchSeries(request) {
        const safeUrl = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(request.symbol)}&interval=1day`, key = this.environment.TWELVE_DATA_API_KEY?.trim();
        if (!key)
            throw new Error('TWELVE_DATA_API_KEY_MISSING');
        let response;
        try {
            response = await this.fetcher(safeUrl + `&outputsize=${Math.max(request.count, 2)}&apikey=${encodeURIComponent(key)}`, { headers: { accept: 'application/json', 'user-agent': 'MOTUS-Internal-Collector/1.0' }, signal: AbortSignal.timeout(20000) });
        }
        catch {
            throw new Error('TWELVE_DATA_NETWORK_ERROR symbol=' + request.symbol + ' endpoint=/time_series');
        }
        // Never put provider messages or authenticated request URLs into logs.
        const data = await response.json().catch(() => null);
        if (!response.ok || data?.status === 'error') {
            const code = typeof data?.code === 'number' ? data.code : response.status;
            const reason = code === 404 ? 'DATA_NOT_FOUND' : code === 403 ? 'ACCESS_DENIED' : code === 401 ? 'AUTHENTICATION_FAILED' : code === 429 ? 'RATE_LIMITED' : 'PROVIDER_ERROR';
            throw new Error('TWELVE_DATA_' + reason + ' symbol=' + request.symbol + ' endpoint=/time_series http=' + response.status + ' providerCode=' + code);
        }
        if (!data?.values?.length)
            throw new Error('TWELVE_DATA_EMPTY');
        const points = data.values.map(row => ({ date: row.datetime ?? '', value: Number(row.close), sourceId: 'TWELVE:' + request.symbol, sourceUrl: safeUrl })).filter(point => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.value)).sort((a, b) => a.date.localeCompare(b.date));
        if (points.length < Math.min(request.count, 2))
            throw new Error(request.symbol + '_OBSERVATIONS_INSUFFICIENT');
        const latest = points.at(-1).date, age = (Date.parse(request.requestedAt.slice(0, 10) + 'T00:00:00Z') - Date.parse(latest + 'T00:00:00Z')) / 86400000;
        if (age < 0 || age > 4)
            throw new Error('TWELVE_' + request.symbol + '_STALE');
        return { url: safeUrl, points };
    }
}

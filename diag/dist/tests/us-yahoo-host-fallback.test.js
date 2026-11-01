import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RepositoryInternalDailyBuilder } from '../src/operations/internal-live-daily.js';
function chart(lastDate, count = 70) { const end = Date.parse(lastDate + 'T20:00:00Z'), timestamp = [], close = []; for (let i = count - 1; i >= 0; i--) {
    timestamp.push(Math.floor((end - i * 86400000) / 1000));
    close.push(5000 + i);
} return { chart: { result: [{ timestamp, indicators: { quote: [{ close }] } }] } }; }
test('U.S. Yahoo path falls back to the second public host and keeps identical session validation', async () => {
    const calls = [];
    const fetcher = (async (input) => { const url = String(input); calls.push(new URL(url).host); return url.includes('query1.') ? new Response('unavailable', { status: 404 }) : new Response(JSON.stringify(chart('2026-10-29')), { status: 200 }); });
    const builder = new RepositoryInternalDailyBuilder(fetcher, {}, undefined, undefined, undefined, join(tmpdir(), 'motus-none-' + Date.now())), audit = [];
    const result = await builder.yahooUsIndex('^GSPC', 'S&P 500', 'sp500', '2026-10-29T22:00:00Z', audit, '2026-10-29');
    assert.deepEqual(calls, ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']);
    assert.match(result.url, /query2\.finance\.yahoo\.com/);
    assert.deepEqual(audit.map(item => item.status), ['FAILED', 'PASS']);
});
test('the second host never accepts a different session than the one requested', async () => {
    const fetcher = (async (input) => String(input).includes('query1.') ? new Response('x', { status: 404 }) : new Response(JSON.stringify(chart('2026-10-28')), { status: 200 }));
    const builder = new RepositoryInternalDailyBuilder(fetcher, {}, undefined, undefined, undefined, join(tmpdir(), 'motus-none-' + Date.now())), audit = [];
    await assert.rejects(builder.yahooUsIndex('^GSPC', 'S&P 500', 'sp500', '2026-10-29T22:00:00Z', audit, '2026-10-29'), /SESSION_MISMATCH/);
    assert.deepEqual(audit.map(item => item.status), ['FAILED', 'FAILED']);
});

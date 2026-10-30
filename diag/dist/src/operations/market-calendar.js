const NYSE_SOURCE = 'https://www.nyse.com/trade/hours-calendars';
const KRX_SOURCE = 'https://global.krx.co.kr/contents/GLB/06/0602/0602020204/GLB0602020204T1.jsp';
const US_2026_HOLIDAYS = new Set(['2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25']);
const US_2026_EARLY = new Set(['2026-11-27', '2026-12-24']);
const KOREA_2026_HOLIDAYS = new Set(['2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-02', '2026-05-01', '2026-05-05', '2026-05-25', '2026-06-03', '2026-08-17', '2026-09-24', '2026-09-25', '2026-09-28', '2026-10-05', '2026-10-09', '2026-12-25', '2026-12-31']);
export function marketSession(market, date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
        throw new Error('market session date must be YYYY-MM-DD');
    if (!date.startsWith('2026-'))
        throw new Error(`${market}_CALENDAR_YEAR_UNVERIFIED`);
    const weekend = [0, 6].includes(new Date(date + 'T12:00:00Z').getUTCDay());
    if (market === 'US') {
        if (weekend || US_2026_HOLIDAYS.has(date))
            return { market, date, state: 'HOLIDAY', closeLocal: '', sourceUrl: NYSE_SOURCE, reason: weekend ? 'WEEKEND' : 'NYSE_OFFICIAL_HOLIDAY' };
        return { market, date, state: US_2026_EARLY.has(date) ? 'EARLY_CLOSE' : 'REGULAR', closeLocal: US_2026_EARLY.has(date) ? '13:00' : '16:00', sourceUrl: NYSE_SOURCE, reason: US_2026_EARLY.has(date) ? 'NYSE_OFFICIAL_EARLY_CLOSE' : 'NYSE_REGULAR_SESSION' };
    }
    if (weekend || KOREA_2026_HOLIDAYS.has(date))
        return { market, date, state: 'HOLIDAY', closeLocal: '', sourceUrl: KRX_SOURCE, reason: weekend ? 'WEEKEND' : 'KRX_HOLIDAY_RULE' };
    return { market, date, state: 'REGULAR', closeLocal: '15:30', sourceUrl: KRX_SOURCE, reason: 'KRX_REGULAR_SESSION' };
}
export function latestCompletedSession(market, at) {
    const zone = market === 'US' ? 'America/New_York' : 'Asia/Seoul', local = localParts(at, zone);
    let date = local.date;
    for (let count = 0; count < 14; count++) {
        const session = marketSession(market, date);
        if (session.state !== 'HOLIDAY' && (date < local.date || date === local.date && local.time >= session.closeLocal))
            return session;
        date = previous(date);
    }
    throw new Error(`${market}_COMPLETED_SESSION_NOT_FOUND`);
}
export function isCompletedSession(session, at) {
    if (session.state === 'HOLIDAY' || !session.closeLocal)
        return false;
    const zone = session.market === 'US' ? 'America/New_York' : 'Asia/Seoul', local = localParts(at, zone);
    return session.date < local.date || session.date === local.date && local.time >= session.closeLocal;
}
function localParts(value, zone) { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value)), get = (type) => parts.find(part => part.type === type)?.value ?? ''; return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }; }
function previous(date) { const value = new Date(date + 'T12:00:00Z'); value.setUTCDate(value.getUTCDate() - 1); return value.toISOString().slice(0, 10); }

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
const CATEGORY_DIRS = ['ai', 'us', 'korea'];
export async function collectPublications(dataRoot) {
    const operations = join(dataRoot, 'operations'), byUrl = new Map();
    for (const date of (await list(operations)).filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name)).sort()) {
        for (const dir of CATEGORY_DIRS) {
            const root = join(operations, date, dir), session = await sessionDate(root);
            for (const line of (await text(join(root, 'publish-ledger.jsonl'))).split(/\r?\n/).filter(Boolean)) {
                let entry;
                try {
                    entry = JSON.parse(line);
                }
                catch {
                    continue;
                }
                if (entry.event === 'PUBLISHED' && entry.publicPostUrl && !byUrl.has(entry.publicPostUrl))
                    byUrl.set(entry.publicPostUrl, { operationDate: date, category: dir, publicPostUrl: entry.publicPostUrl, source: 'ledger', sessionDate: entry.sessionDate ?? session });
            }
            const outcome = await json(join(root, 'auto-publish.json'));
            if (outcome?.state === 'PUBLISHED' && outcome.publicPostUrl && !byUrl.has(outcome.publicPostUrl))
                byUrl.set(outcome.publicPostUrl, { operationDate: date, category: dir, publicPostUrl: outcome.publicPostUrl, source: 'outcome', sessionDate: session });
        }
    }
    return [...byUrl.values()];
}
export async function checkRecordConsistency(dataRoot, checkedAt = new Date().toISOString()) {
    const publications = await collectPublications(dataRoot), issues = [];
    const library = new Set(urlsOf(await json(join(dataRoot, 'library', 'publications', 'auto-publications.json'))));
    const weekly = new Set(), search = new Set();
    for (const date of await list(join(dataRoot, 'operations')))
        for (const url of urlsOf(await json(join(dataRoot, 'operations', date, 'weekly-monthly-feed-auto.json'))))
            weekly.add(url);
    for (const date of await list(join(dataRoot, 'search')))
        for (const url of urlsOf(await json(join(dataRoot, 'search', date, 'auto-registrations.json'))))
            search.add(url);
    for (const item of publications) {
        const where = `${item.operationDate}/${item.category}`;
        if (!library.has(item.publicPostUrl))
            issues.push({ kind: 'MISSING_LIBRARY', detail: `${where} 발행물이 Library에 없음`, urls: [item.publicPostUrl] });
        if (!weekly.has(item.publicPostUrl))
            issues.push({ kind: 'MISSING_WEEKLY', detail: `${where} 발행물이 Weekly feed에 없음`, urls: [item.publicPostUrl] });
        if (!search.has(item.publicPostUrl))
            issues.push({ kind: 'MISSING_SEARCH', detail: `${where} 발행물이 Search 등록에 없음`, urls: [item.publicPostUrl] });
    }
    for (const [identity, urls] of group(publications, item => `${item.operationDate}/${item.category}`))
        if (urls.length > 1)
            issues.push({ kind: 'IDENTITY_MULTIPLE_URLS', detail: `${identity}에 발행 글이 ${urls.length}개`, urls });
    for (const [session, urls] of group(publications.filter(item => item.sessionDate && item.category !== 'ai'), item => `${item.category} 세션 ${item.sessionDate}`))
        if (urls.length > 1)
            issues.push({ kind: 'SESSION_PUBLISHED_TWICE', detail: `${session}가 ${urls.length}번 발행됨`, urls });
    return { checkedAt, publications: publications.length, issues };
}
export function renderConsistencyReport(report) {
    const lines = [`# MOTUS 기록 정합성 점검`, '', `점검: ${report.checkedAt} · 발행물 ${report.publications}건 · 문제 ${report.issues.length}건`, ''];
    if (!report.issues.length)
        return [...lines, '불일치 없음.', ''].join('\n');
    lines.push('| 종류 | 내용 | 글 |', '| --- | --- | --- |');
    for (const issue of report.issues)
        lines.push(`| ${issue.kind} | ${issue.detail} | ${issue.urls.join('<br>')} |`);
    return [...lines, ''].join('\n');
}
function group(items, key) { const map = new Map(); for (const item of items) {
    const k = key(item);
    map.set(k, [...(map.get(k) ?? []), item.publicPostUrl]);
} return map; }
function urlsOf(value) { if (!Array.isArray(value))
    return []; return value.map(item => item?.publicPostUrl).filter((url) => typeof url === 'string' && url.length > 0); }
async function sessionDate(root) { const unit = await json(join(root, 'live-unit.json')); return typeof unit?.observedDate === 'string' ? unit.observedDate : null; }
async function list(path) { try {
    return await readdir(path);
}
catch {
    return [];
} }
async function text(path) { try {
    return await readFile(path, 'utf8');
}
catch {
    return '';
} }
async function json(path) { try {
    return JSON.parse(await readFile(path, 'utf8'));
}
catch {
    return null;
} }

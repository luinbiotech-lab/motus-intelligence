export function buildProductionSummary(input) {
    const entries = Array.isArray(input.audit.entries) ? input.audit.entries.filter(record) : [], publishAudit = Array.isArray(input.publish.audit) ? input.publish.audit.filter(record) : [];
    const state = text(input.publish.state) || text(input.live.state) || 'FAILED', liveReason = text(input.live.reasonCode), publishReason = text(input.publish.reasonCode) || text(input.publish.reason) || text(input.publish.error), generic = /^live unit is not publication-ready$/i.test(publishReason), reasonCodes = unique([...(array(input.publish.reasonCodes)), ...(generic || !publishReason ? [] : splitReasons(publishReason)), ...splitReasons(liveReason), ...(!liveReason ? array(input.verification.unresolvedConflicts) : [])]);
    const failed = entries.filter(item => text(item.status) === 'FAILED'), failedSource = failed.map(item => text(item.sourceId)).filter(Boolean), staleFields = entries.filter(item => /STALE/i.test(text(item.error))).map(item => text(item.sourceId)).filter(Boolean), sessionDate = inferSessionDate(input.live, input.verification, input.unit, entries), searchStatus = text(input.search.freshness) || text(record(input.search.snapshot) ? record(input.search.snapshot).providerStates : '') || 'UNVERIFIED';
    const attempted = number(input.publish.publishCallCount) > 0 || publishAudit.some(item => ['PUBLISH_ATTEMPT', 'PUBLISHED', 'FAILED'].includes(text(item.event))), duplicateDecision = duplicate(input.publish, input.verification, state), postId = text(input.publish.draftPostId) || text(input.publish.postId), publicUrl = text(input.publish.publicPostUrl), remoteMayExist = input.publish.remoteMayExist === true ? 'YES' : 'NO';
    const row = { category: input.category, operationDate: input.operationDate, sessionDate: sessionDate || 'UNVERIFIED', state, reasonCodes: reasonCodes.join(', ') || 'NONE', failedSource: failedSource.join(', ') || 'NONE', staleFields: staleFields.join(', ') || 'NONE', searchStatus, publishAttempted: attempted ? 'YES' : 'NO', duplicateDecision, postId: postId || 'NONE', publicUrl: publicUrl || 'NONE' };
    const cells = ['category', 'operationDate', 'sessionDate', 'state', 'reasonCodes', 'failedSource', 'staleFields', 'searchStatus', 'publishAttempted', 'duplicateDecision', 'postId', 'publicUrl'], markdown = ['| ' + cells.join(' | ') + ' |', '|' + cells.map(() => '---').join('|') + '|', '| ' + cells.map(key => escape(row[key])).join(' | ') + ' |', ...(remoteMayExist === 'YES' ? ['', `> Warning: remote post may exist; readback is required before any retry.`] : [])].join('\n') + '\n';
    const message = safe(reasonCodes.join('; ') || 'operation recorded'), annotation = state === 'FAILED' ? `::error title=MOTUS ${input.category} FAILED::${message}` : state === 'HOLD' || state === 'SKIP' ? `::warning title=MOTUS ${input.category} ${state}::${message}` : `::notice title=MOTUS ${input.category} ${state}::${message}`;
    return { state, reasonCodes, markdown, annotation, exitCode: state === 'FAILED' ? 1 : 0, row };
}
function inferSessionDate(live, verification, unit, entries) { const direct = text(live.observedDate) || text(unit?.observedDate); if (direct)
    return direct; const dates = entries.filter(item => !text(item.sourceId).includes('usd-krw')).map(item => text(item.observedDate)).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)), counts = new Map(); for (const date of dates)
    counts.set(date, (counts.get(date) ?? 0) + 1); const inferred = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]; return inferred ?? text(verification.observedDate); }
function duplicate(publish, verification, state) { const reason = (text(publish.reasonCode) + ' ' + text(publish.reason) + ' ' + text(publish.error)).toLowerCase(); if (reason.includes('persisted ledger'))
    return 'PERSISTED_LEDGER_MATCH'; if (reason.includes('duplicate'))
    return 'BLOCKED'; if (state === 'PUBLISHED')
    return 'PASS'; return text(verification.duplicateCheck) || 'UNVERIFIED'; }
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function text(value) { return typeof value === 'string' ? value : Array.isArray(value) ? value.map(text).filter(Boolean).join(', ') : value == null ? '' : String(value); }
function number(value) { return typeof value === 'number' ? value : Number(value) || 0; }
function array(value) { return Array.isArray(value) ? value.map(text).filter(Boolean) : []; }
function splitReasons(value) { return value.split(/;\s*/).map(item => item.trim()).filter(Boolean); }
function unique(values) { return [...new Set(values)]; }
function escape(value) { return value.replaceAll('|', '/').replace(/[\r\n]+/g, ' '); }
function safe(value) { return value.replace(/[\r\n%]/g, ' ').slice(0, 500); }

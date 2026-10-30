import { records } from './validation.js';
export function analyze(input, validation, rules, sources) {
    const usable = new Map(records(input).filter(r => !validation.excludedIds.includes(r?.id)).map(r => [r.id, r]));
    const candidates = [];
    const issues = [];
    if (validation.excludedIds.includes('session') || input.session.status === 'HOLIDAY')
        return { candidates, issues };
    const signalCounts = new Map();
    input.signals.forEach(s => signalCounts.set(s.id, (signalCounts.get(s.id) ?? 0) + 1));
    for (const signal of input.signals) {
        if (signalCounts.get(signal.id) > 1) {
            issues.push({ recordId: signal.id, field: 'id', status: 'CONFLICT', message: '중복 신호 ID 전부 제외' });
            continue;
        }
        if (!usable.has(signal.eventId)) {
            issues.push({ recordId: signal.id, field: 'eventId', status: 'REVIEW_REQUIRED', message: '검증된 원인 이벤트 없음' });
            continue;
        }
        const event = input.companyEvents.find(e => e.id === signal.eventId);
        if (event && (event.companyId !== signal.usCompany || event.eventType !== signal.trigger)) {
            issues.push({ recordId: signal.id, field: 'eventId', status: 'CONFLICT', message: '신호와 기업 이벤트 회사/유형 불일치' });
            continue;
        }
        const applicable = rules.filter(r => r.trigger === signal.trigger && r.usIndustry === signal.usIndustry && (!r.usCompany.length || r.usCompany.includes(signal.usCompany)) && r.macroCondition.every(c => signal.macroConditions.includes(c)));
        if (!applicable.length)
            issues.push({ recordId: signal.id, field: 'trigger', status: 'REVIEW_REQUIRED', message: '일치하는 Rule v1 없음' });
        for (const rule of applicable) {
            const ids = [...new Set([signal.eventId, ...signal.evidenceIds])].filter(id => usable.has(id));
            const refs = ids.map(id => usable.get(id));
            const sourceIds = [...new Set(refs.map(r => r.sourceId))];
            const primaryCount = sourceIds.filter(id => sources.find(s => s.sourceId === id)?.official).length;
            const complete = signal.evidenceIds.every(id => usable.has(id));
            const enough = sourceIds.length >= rule.evidenceRequirements.minimumSources && (!rule.evidenceRequirements.primaryRequired || primaryCount > 0) && complete;
            const activeCounters = [...new Set([...signal.counterFactors, ...input.koreaContext.counterFactors])];
            const confidenceScore = Math.max(0, Math.min(100, (primaryCount >= 2 ? 90 : primaryCount === 1 ? 75 : 40) - activeCounters.length * 10 - (complete ? 0 : 30)));
            const evidenceLevel = !enough ? 'UNVERIFIED' : primaryCount >= 2 ? 'A' : primaryCount === 1 ? 'B' : 'C';
            const low = !enough || confidenceScore < 60;
            candidates.push({ id: `${signal.id}:${rule.ruleId}`, usEventId: signal.eventId, ruleId: rule.ruleId, ruleVersion: rule.ruleVersion, transmissionPath: rule.transmissionPath, koreaSector: rule.koreaIndustry, koreaCompanyId: null, koreaTicker: null,
                rationale: `수동 확인 신호 ${signal.trigger} → ${rule.transmissionPath} → ${rule.koreaIndustry}. 인과관계 확정이나 수익률 예측이 아닌 조건부 전달경로입니다.`,
                impactDirection: low ? 'HOLD' : rule.direction, impactStrength: low ? 1 : Math.max(1, Math.min(5, rule.baseStrength + (evidenceLevel === 'A' ? 1 : 0) - Math.min(2, activeCounters.length))), evidenceLevel, confidenceScore,
                counterFactors: [...new Set([...activeCounters, ...rule.counterFactors])], validityHorizon: rule.validityHorizon, status: low ? 'LOW_CONFIDENCE' : 'OK', nature: 'INFERENCE', evidenceIds: ids,
                scoreCalculation: `confidence = clamp((primarySources>=2 ? 90 : primarySources=1 ? 75 : 40) - activeCounters*10 - missingEvidence*30, 0, 100); primarySources=${primaryCount}, activeCounters=${activeCounters.length}, complete=${complete}. strength=clamp(base=${rule.baseStrength} + A bonus - min(2,activeCounters), 1, 5); low confidence forces HOLD/1.` });
        }
    }
    return { candidates, issues };
}

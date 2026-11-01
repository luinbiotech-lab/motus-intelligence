import test from 'node:test';
import assert from 'node:assert/strict';
import { assessProductionGateOutcome } from '../src/production/production-gate-outcome.js';
const publicUrl = 'https://motusnova.blogspot.com/2026/10/1q-sk.html';
test('existing-session Korea skip must be identified as no new Blogger article', () => {
    const result = assessProductionGateOutcome({ state: 'SKIP', reasonCode: 'ALREADY_PUBLISHED_SAME_SESSION', postId: '310165270483019628', sessionDate: '2026-10-28', publicPostUrl: publicUrl });
    assert.equal(result.disposition, 'EXISTING_SESSION_POST');
    assert.equal(result.ok, true);
    assert.match(result.message, /No new post/);
});
test('new publication is distinct from a previous-session duplicate', () => {
    const result = assessProductionGateOutcome({ state: 'PUBLISHED', draftPostId: '310165270483019628', publicPostUrl: publicUrl });
    assert.equal(result.disposition, 'PUBLISHED');
});
test('skip without independently identifiable prior post must not be called success', () => {
    for (const outcome of [
        { state: 'SKIP', reasonCode: 'ALREADY_PUBLISHED_SAME_SESSION', postId: '310165270483019628', sessionDate: '2026-10-28' },
        { state: 'SKIP', reasonCode: 'ALREADY_PUBLISHED_SAME_SESSION', postId: 'not-a-post', sessionDate: '2026-10-28', publicPostUrl: publicUrl },
        { state: 'SKIP', reasonCode: 'ALREADY_PUBLISHED_SAME_SESSION', postId: '310165270483019628', publicPostUrl: publicUrl },
        { state: 'HOLD', reasonCode: 'EDITORIAL_GATE', postId: '310165270483019628', sessionDate: '2026-10-28', publicPostUrl: publicUrl }
    ])
        assert.equal(assessProductionGateOutcome(outcome).disposition, 'FAILED');
});

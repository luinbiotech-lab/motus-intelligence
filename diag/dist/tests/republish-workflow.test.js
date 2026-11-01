import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('republish is an explicit dispatch option that replaces the publish step, never adds a second post', () => {
    const workflow = readFileSync('.github/workflows/motus-daily-production.yml', 'utf8');
    assert.match(workflow, /republish:\n\s+description:[^\n]+\n\s+required: false\n\s+type: boolean\n\s+default: false/);
    assert.match(workflow, /if: env\.MOTUS_LIVE_PUBLISH_ENABLED == 'true' && env\.REPUBLISH != 'true'\n\s+run: npm run motus:publish -- --date "\$RUN_DATE" --category "\$CATEGORY" --execute/);
    assert.match(workflow, /if: env\.MOTUS_LIVE_PUBLISH_ENABLED == 'true' && env\.REPUBLISH == 'true'\n\s+run: npm run motus:republish -- --date "\$RUN_DATE" --category "\$CATEGORY" --execute/);
    const cli = readFileSync('src/motus-republish-cli.ts', 'utf8');
    assert.match(cli, /persistedPublicationDecision\(ledger,date,unit\.category\)/, 'the target is the post the ledger recorded');
    assert.match(cli, /before\.url!==url/, 'remote identity is checked before the patch');
    assert.match(cli, /after\.url!==url/, 'the permalink must not change');
    assert.doesNotMatch(cli, /insertDraft|publishDraft/, 'republish never creates a post');
});

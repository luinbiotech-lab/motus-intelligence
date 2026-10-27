import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('Blogger XML overlay preserves widgets, settings, newline bytes and repeat-build identity', () => {
  const result = spawnSync('python3', ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_blogger_theme.py', '-v'], {encoding:'utf8'});
  assert.equal(result.status, 0, result.error?.message ?? result.stdout + result.stderr);
});

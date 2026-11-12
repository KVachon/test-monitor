'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { decide } = require('../lib/hook');

// These tests run under testwatch themselves, which sets TESTMONITOR_RUN and switches the hook off.
delete process.env.TESTMONITOR_RUN;

const run = command => decide({ tool_name: 'Bash', tool_input: { command } });


test.describe('hook', () => {
test('test commands are sent back through testwatch', () => {
  for (const c of ['npm test', 'npx playwright test --project=chromium', 'pytest -q', './tests/run.sh', 'bash tests/browser.sh', 'node --test test/', 'go test ./...', 'vendor/bin/phpunit']) {
    const out = run(c);
    assert.ok(out, c);
    assert.strictEqual(out.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(out.hookSpecificOutput.permissionDecisionReason, new RegExp(`testwatch -- ${c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`));
  }
});

test('everything else passes untouched', () => {
  for (const c of ['npm install', 'git commit -m "fix pytest"', 'grep -r jest .', 'testwatch -- npm test', 'TESTWATCH_HOOK=off npm test', 'ls tests/', 'npm run build']) {
    assert.strictEqual(run(c), null, c);
  }
  assert.strictEqual(decide({ tool_name: 'Read', tool_input: {} }), null);
});

test('inside a testwatch run the hook stays out of the way', () => {
  process.env.TESTMONITOR_RUN = 'r1';
  try { assert.strictEqual(run('npm test'), null); } finally { delete process.env.TESTMONITOR_RUN; }
});
});

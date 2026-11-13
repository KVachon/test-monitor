'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { decide } = require('../lib/hook');

// These tests run under kurtest themselves, which sets KURTEST_RUN and switches the hook off.
for (const k of ['KURTEST_RUN', 'TESTMONITOR_RUN']) delete process.env[k];

const run = command => decide({ tool_name: 'Bash', tool_input: { command } });


test.describe('hook', () => {
test('test commands are sent back through kurtest', () => {
  for (const c of ['npm test', 'npx playwright test --project=chromium', 'pytest -q', './tests/run.sh', 'bash tests/browser.sh', 'node --test test/', 'go test ./...', 'vendor/bin/phpunit']) {
    const out = run(c);
    assert.ok(out, c);
    assert.strictEqual(out.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(out.hookSpecificOutput.permissionDecisionReason, new RegExp(`kurtest -- ${c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`));
  }
});

test('everything else passes untouched', () => {
  for (const c of ['npm install', 'git commit -m "fix pytest"', 'grep -r jest .', 'kurtest -- npm test', 'testwatch -- npm test', 'KURTEST_HOOK=off npm test', 'TESTWATCH_HOOK=off npm test', 'ls tests/', 'npm run build']) {
    assert.strictEqual(run(c), null, c);
  }
  assert.strictEqual(decide({ tool_name: 'Read', tool_input: {} }), null);
  // Writing a file that mentions a test command doesn't run it.
  assert.strictEqual(run("cat > ci.yml <<'EOF'\nsteps:\n  - run: npm test\nEOF\ngit add ci.yml"), null);
  assert.ok(run("tee a.txt <<EOF\nhello\nEOF\nnpm test"));
});

test('inside a kurtest run the hook stays out of the way, under either name', () => {
  for (const k of ['KURTEST_RUN', 'TESTMONITOR_RUN']) {
    process.env[k] = 'r1';
    try { assert.strictEqual(run('npm test'), null); } finally { delete process.env[k]; }
  }
});
});

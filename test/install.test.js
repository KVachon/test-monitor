'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { install, RULE_HEADING, HOOK } = require('../lib/install');

test.describe('install', () => {
  test('adds the hook, rule, address and token once, keeping what was there', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-home-'));
    try {
      fs.mkdirSync(path.join(home, '.claude'));
      fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({ model: 'x', hooks: { PreToolUse: [{ matcher: 'Edit', hooks: [] }] } }));
      fs.writeFileSync(path.join(home, '.claude', 'CLAUDE.md'), '# My rules\n');
      for (let i = 0; i < 2; i++) install({ home, url: 'https://tests.example', token: 'abc', log: () => {} });
      const s = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'));
      assert.strictEqual(s.model, 'x');
      assert.strictEqual(s.hooks.PreToolUse.length, 2);
      assert.strictEqual(s.hooks.PreToolUse[1].hooks[0].command, HOOK);
      const md = fs.readFileSync(path.join(home, '.claude', 'CLAUDE.md'), 'utf8');
      assert.ok(md.startsWith('# My rules\n'));
      assert.strictEqual(md.split(RULE_HEADING).length, 2);
      assert.strictEqual(JSON.parse(fs.readFileSync(path.join(home, '.kurtest', 'config.json'), 'utf8')).url, 'https://tests.example');
      assert.strictEqual(fs.readFileSync(path.join(home, '.kurtest', 'token'), 'utf8').trim(), 'abc');
    } finally { fs.rmSync(home, { recursive: true, force: true }); }
  });

  test('reads the rule from a checkout with Windows line endings', () => {
    const doc = require('path').join(__dirname, '..', 'docs', 'claude-code.md');
    const orig = fs.readFileSync(doc, 'utf8');
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-home-'));
    try {
      fs.writeFileSync(doc, orig.replace(/\n/g, '\r\n'));
      install({ home, token: '', log: () => {} });
      assert.ok(fs.readFileSync(path.join(home, '.claude', 'CLAUDE.md'), 'utf8').includes(RULE_HEADING));
    } finally { fs.writeFileSync(doc, orig); fs.rmSync(home, { recursive: true, force: true }); }
  });

  test('leaves a setup from before the rename alone, in its old folder', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-home-'));
    try {
      fs.mkdirSync(path.join(home, '.claude'));
      fs.mkdirSync(path.join(home, '.test-monitor'));
      fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'testwatch --claude-hook' }] }] } }));
      fs.writeFileSync(path.join(home, '.claude', 'CLAUDE.md'), '## Tests report to the Test Monitor\n\nold rule\n');
      install({ home, url: 'https://tests.example', token: '', log: () => {} });
      const s = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'));
      assert.strictEqual(s.hooks.PreToolUse.length, 1);
      assert.ok(!fs.readFileSync(path.join(home, '.claude', 'CLAUDE.md'), 'utf8').includes(RULE_HEADING));
      assert.strictEqual(JSON.parse(fs.readFileSync(path.join(home, '.test-monitor', 'config.json'), 'utf8')).url, 'https://tests.example');
      assert.ok(!fs.existsSync(path.join(home, '.kurtest')));
    } finally { fs.rmSync(home, { recursive: true, force: true }); }
  });

  test('works on a machine with no Claude settings yet', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-home-'));
    try {
      install({ home, token: '', log: () => {} });
      assert.ok(fs.existsSync(path.join(home, '.claude', 'settings.json')));
      assert.ok(fs.readFileSync(path.join(home, '.claude', 'CLAUDE.md'), 'utf8').includes(RULE_HEADING));
    } finally { fs.rmSync(home, { recursive: true, force: true }); }
  });
});

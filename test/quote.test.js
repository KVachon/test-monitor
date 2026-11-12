'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const { commandFor } = require('../lib/quote');

const args = ['node', '-e', "console.log('TAP version 13');console.log('ok 1 - a \"quoted\" name')"];

test.describe('quote', () => {
  test('keeps each argument whole in a POSIX shell', () => {
    const { command, shell } = commandFor(args, { platform: 'linux', env: {} });
    assert.strictEqual(shell, true);
    assert.strictEqual(execFileSync('sh', ['-c', command], { encoding: 'utf8' }), 'TAP version 13\nok 1 - a "quoted" name\n');
  });

  test('uses bash with POSIX quoting from Git Bash on Windows', () => {
    const r = commandFor(args, { platform: 'win32', env: { MSYSTEM: 'MINGW64' } });
    assert.strictEqual(r.shell, 'bash');
    assert.strictEqual(r.command, commandFor(args, { platform: 'linux', env: {} }).command);
  });

  test('quotes for cmd.exe elsewhere on Windows', () => {
    const r = commandFor(args, { platform: 'win32', env: {} });
    assert.strictEqual(r.shell, true);
    assert.strictEqual(r.command, `node -e "console.log('TAP version 13');console.log('ok 1 - a \\"quoted\\" name')"`);
    assert.strictEqual(commandFor(['npm', 'test'], { platform: 'win32', env: {} }).command, 'npm test');
  });
});

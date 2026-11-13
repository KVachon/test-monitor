'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { plan } = require('../lib/service');

const opts = { node: '/opt/node 22/bin/node', script: '/opt/kurtest/bin/kurtest.js', args: ['--host', '0.0.0.0'], home: '/home/u', dataDir: '/home/u/.kurtest' };

test.describe('service', () => {
  test('macOS: a launchd agent that keeps `kurtest serve` running', () => {
    const p = plan('darwin', opts);
    assert.strictEqual(p.files[0].path, '/home/u/Library/LaunchAgents/dev.kurtest.plist');
    assert.match(p.files[0].content, /<string>\/opt\/node 22\/bin\/node<\/string>\s*<string>\/opt\/kurtest\/bin\/kurtest.js<\/string>\s*<string>serve<\/string>\s*<string>--host<\/string>/);
    assert.match(p.files[0].content, /<key>KeepAlive<\/key><true\/>/);
    assert.deepStrictEqual(p.start.at(-1).slice(0, 2), ['launchctl', ['load', '-w', p.files[0].path]]);
  });

  test('Linux: a systemd user service, with paths quoted', () => {
    const p = plan('linux', opts);
    assert.strictEqual(p.files[0].path, '/home/u/.config/systemd/user/kurtest.service');
    assert.match(p.files[0].content, /^ExecStart="\/opt\/node 22\/bin\/node" "\/opt\/kurtest\/bin\/kurtest.js" "serve" "--host" "0.0.0.0"$/m);
    assert.deepStrictEqual(p.start.at(-1).slice(0, 2), ['systemctl', ['--user', 'enable', '--now', 'kurtest.service']]);
  });

  test('Windows: a logon task that starts it hidden', () => {
    const p = plan('win32', { ...opts, node: 'C:\\Program Files\\nodejs\\node.exe', script: 'C:\\k\\bin\\kurtest.js', dataDir: 'C:\\Users\\u\\.kurtest' });
    const vbs = p.files[0].content;
    assert.match(vbs, /^CreateObject\("WScript.Shell"\)\.Run "cmd \/c """"C:\\Program Files\\nodejs\\node.exe"" ""C:\\k\\bin\\kurtest.js"" ""serve""/);
    assert.match(vbs, /, 0, False\r\n$/);
    assert.ok(p.start[0][1].includes('ONLOGON'));
  });

  test('other systems get a clear message', () => {
    assert.throws(() => plan('aix', opts), /doesn't know how to set up aix/);
  });
});

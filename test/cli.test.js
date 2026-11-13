'use strict';
// End to end: the kurtest command against a real server, in a throwaway home folder.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { createMonitor } = require('../lib/server');

const BIN = path.join(__dirname, '..', 'bin');
const clean = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(KURTEST|TESTMONITOR)/.test(k)));

function sh(args, { env = {}, cwd } = {}) {
  return new Promise(resolve => {
    const c = spawn(process.execPath, args, { env: { ...clean(), ...env }, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    c.stdout.on('data', d => { out += d; });
    c.stderr.on('data', d => { err += d; });
    c.on('close', code => resolve({ code, out, err }));
  });
}

async function withHome(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-home-'));
  try { await fn(home); } finally { fs.rmSync(home, { recursive: true, force: true }); }
}

test.describe('cli', () => {
  test('kurtest -- <command> reports TAP output, keeps it on screen, and keeps the exit code', async () => {
    await withHome(async home => {
      const dataDir = path.join(home, 'data');
      const server = createMonitor({ dataDir, token: 'sekrit' });
      await new Promise(r => server.listen(0, '127.0.0.1', r));
      const url = `http://127.0.0.1:${server.address().port}`;
      try {
        const script = 'console.log("TAP version 13\\nok 1 - adds\\nnot ok 2 - subtracts\\n1..2"); process.exit(3)';
        for (const name of ['kurtest.js', 'testwatch.js']) {
          const r = await sh([path.join(BIN, name), '--project', 'demo', '--', process.execPath, '-e', script],
            { env: { HOME: home, USERPROFILE: home, KURTEST_URL: url, KURTEST_TOKEN: 'sekrit' } });
          assert.strictEqual(r.code, 3, r.err);
          assert.match(r.out, /ok 1 - adds/);
          assert.match(r.err, /watch it live at http:\/\/127\.0\.0\.1:\d+\//);
        }
        const list = await (await fetch(url + '/api/runs')).json();
        assert.strictEqual(list.runs.length, 2);
        assert.deepStrictEqual(list.runs[0].counts, { pass: 1, fail: 1, skip: 0, flaky: 0 });
        assert.strictEqual(list.runs[0].status, 'fail');
      } finally { server.close(); server.closeAllConnections(); }
    });
  });

  test('kurtest serve listens on this machine only and makes a token; the old test-monitor keeps its old ways', async () => {
    await withHome(async home => {
      const port = 20000 + Math.floor(Math.random() * 20000);
      const c = spawn(process.execPath, [path.join(BIN, 'kurtest.js'), 'serve', '--port', String(port)], { env: { ...clean(), HOME: home, USERPROFILE: home }, stdio: ['ignore', 'pipe', 'pipe'] });
      const closed = new Promise(r => c.on('close', r));
      let out = '';
      c.stdout.on('data', d => { out += d; });
      try {
        for (let i = 0; i < 50 && !out.includes('made a token'); i++) await new Promise(r => setTimeout(r, 100));
        assert.match(out, /listening on 127\.0\.0\.1:/);
        assert.match(out, /only this machine can reach it/);
        const token = fs.readFileSync(path.join(home, '.kurtest', 'token'), 'utf8').trim();
        assert.strictEqual(token.length, 48);
        if (process.platform !== 'win32') assert.strictEqual(fs.statSync(path.join(home, '.kurtest', 'token')).mode & 0o777, 0o600);
        assert.ok(fs.existsSync(path.join(home, '.kurtest', 'server.pid')));
        const t = await sh([path.join(BIN, 'kurtest.js'), 'token'], { env: { HOME: home, USERPROFILE: home } });
        assert.strictEqual(t.out.trim(), token);
        const s = await sh([path.join(BIN, 'kurtest.js'), 'stop'], { env: { HOME: home, USERPROFILE: home } });
        assert.match(s.out, /Stopped/);
        await closed;
      } finally { c.kill(); }

      const old = path.join(home, 'old');
      const o = spawn(process.execPath, [path.join(BIN, 'test-monitor.js'), '--port', String(port + 1), '--data', old], { env: { ...clean(), HOME: home, USERPROFILE: home }, stdio: ['ignore', 'pipe', 'pipe'] });
      let oout = '';
      o.stdout.on('data', d => { oout += d; });
      try {
        for (let i = 0; i < 50 && !oout.includes('can send runs'); i++) await new Promise(r => setTimeout(r, 100));
        assert.match(oout, /listening on 0\.0\.0\.0:/);
        assert.ok(!fs.existsSync(path.join(old, 'token')));
      } finally { o.kill(); }
    });
  });
});

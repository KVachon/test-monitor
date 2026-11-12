'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createMonitor } = require('../lib/server');

async function withServer(opts, fn) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-'));
  const server = createMonitor({ dataDir, ...opts });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base, dataDir); } finally { server.close(); server.closeAllConnections(); fs.rmSync(dataDir, { recursive: true, force: true }); }
}
const post = (base, body, headers = {}) => fetch(base + '/api/events', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

const runEvents = (run, at, fail) => [
  { type: 'run-start', run, project: 'p', command: 'testwatch', host: 'h', at },
  { type: 'suite-start', run, suite: 's', label: 'unit', tests: [{ id: 'a', group: 'G' }, { id: 'b', group: 'G' }], at: at + 1 },
  { type: 'test-end', run, suite: 's', id: 'a', group: 'G', status: 'pass', ms: 40, at: at + 50 },
  { type: 'test-end', run, suite: 's', id: 'b', group: 'G', status: fail ? 'fail' : 'pass', reason: fail ? 'nope' : undefined, at: at + 90 },
  { type: 'run-end', run, status: fail ? 'fail' : 'pass', at: at + 100 },
];

test('stores a run, keeps the sender spacing, and serves it with the previous run', async () => {
  await withServer({}, async base => {
    const at = Date.now() - 1000;
    let res = await post(base, runEvents('r1', at, true));
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await res.json()).accepted, 5);
    res = await post(base, runEvents('r2', at + 200, false));
    const r2 = await (await fetch(base + '/api/runs/r2')).json();
    assert.strictEqual(r2.events.length, 5);
    assert.deepStrictEqual(r2.events.map(e => e.seq), [1, 2, 3, 4, 5]);
    assert.strictEqual(r2.events[4].t - r2.events[0].t, 100);
    assert.strictEqual(r2.meta.status, 'pass');
    assert.strictEqual(r2.previous.id, 'r1');
    assert.strictEqual(r2.previous.durationMs, 100);
    assert.deepStrictEqual(r2.previous.suites[0].tests.map(t => t.id), ['a', 'b']);
    assert.strictEqual(r2.previous.suites[0].tests[0].ms, 40);
    const list = await (await fetch(base + '/api/runs')).json();
    assert.deepStrictEqual(list.runs.map(r => r.id), ['r2', 'r1']);
  });
});

test('reports bad events without dropping good ones', async () => {
  await withServer({}, async base => {
    const res = await post(base, [{ type: 'run-start', run: 'r1' }, { type: 'test-end', run: 'r1', suite: 's', id: 'x', status: 'meh' }]);
    const body = await res.json();
    assert.strictEqual(body.accepted, 1);
    assert.strictEqual(body.errors.length, 1);
  });
});

test('a token is needed to send, and to read from outside the network', async () => {
  await withServer({ token: 'sekrit' }, async base => {
    assert.strictEqual((await post(base, runEvents('r1', Date.now(), false))).status, 401);
    assert.strictEqual((await post(base, runEvents('r1', Date.now(), false), { authorization: 'Bearer sekrit' })).status, 200);
    assert.strictEqual((await fetch(base + '/api/runs')).status, 200);
    assert.strictEqual((await fetch(base + '/api/runs', { headers: { 'cf-connecting-ip': '1.2.3.4' } })).status, 401);
    assert.strictEqual((await fetch(base + '/api/runs?token=sekrit', { headers: { 'cf-connecting-ip': '1.2.3.4' } })).status, 200);
  });
});

test('the stream says hello with the latest run, then sends new events', async () => {
  await withServer({}, async base => {
    await post(base, [{ type: 'run-start', run: 'r1', project: 'p' }]);
    const ctl = new AbortController();
    const res = await fetch(base + '/api/stream', { signal: ctl.signal });
    const reader = res.body.getReader();
    let text = '';
    const until = async s => { while (!text.includes(s)) text += new TextDecoder().decode((await reader.read()).value); };
    await until('"latest":"r1"');
    await post(base, [{ type: 'test-end', run: 'r1', suite: 's', id: 'a', status: 'pass' }]);
    await until('"id":"a"');
    ctl.abort();
  });
});

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


test.describe('server', () => {
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

test('opening the page with the token signs in with a cookie and drops the token from the address', async () => {
  await withServer({ token: 'sekrit' }, async base => {
    const away = { 'cf-connecting-ip': '1.2.3.4' };
    let res = await fetch(base + '/', { headers: away });
    assert.strictEqual(res.status, 401);
    assert.match(await res.text(), /<form/);
    res = await fetch(base + '/?token=wrong', { headers: away, redirect: 'manual' });
    assert.strictEqual(res.status, 401);
    res = await fetch(base + '/?token=sekrit&run=r1', { headers: { ...away, 'x-forwarded-proto': 'https' }, redirect: 'manual' });
    assert.strictEqual(res.status, 302);
    assert.strictEqual(res.headers.get('location'), '/?run=r1');
    const cookie = res.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Secure/);
    const jar = cookie.split(';')[0];
    assert.strictEqual((await fetch(base + '/api/runs', { headers: { ...away, cookie: jar } })).status, 200);
    assert.strictEqual((await fetch(base + '/', { headers: { ...away, cookie: jar } })).status, 200);
    // The cookie is for reading only: sending still needs the token itself.
    assert.strictEqual((await post(base, runEvents('r1', Date.now(), false), { ...away, cookie: jar })).status, 401);
  });
});

test('the fonts load without the token, so the sign-in page can use them', async () => {
  await withServer({ token: 'sekrit' }, async base => {
    const res = await fetch(base + '/fonts/inter-latin-400-normal.woff2', { headers: { 'cf-connecting-ip': '1.2.3.4' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'font/woff2');
    assert.strictEqual((await fetch(base + '/fonts/../server.js')).status, 404);
  });
});

// The local network can see the page only with lanView. Needs a private address on this machine to test.
const lanAddr = Object.values(require('os').networkInterfaces()).flat()
  .find(i => i && i.family === 'IPv4' && !i.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address));
test('the local network sees the page only with lanView', { skip: !lanAddr && 'no private network address here' }, async () => {
  for (const lanView of [false, true]) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-'));
    const server = createMonitor({ dataDir, token: 'sekrit', lanView });
    await new Promise(r => server.listen(0, lanAddr.address, r));
    try {
      const res = await fetch(`http://${lanAddr.address}:${server.address().port}/api/runs`);
      assert.strictEqual(res.status, lanView ? 200 : 401);
    } finally { server.close(); server.closeAllConnections(); fs.rmSync(dataDir, { recursive: true, force: true }); }
  }
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
test('history: one row per feature across the last runs, oldest first', async () => {
  await withServer({}, async base => {
    const at = Date.now() - 5000;
    await post(base, runEvents('h1', at, true));
    await post(base, runEvents('h2', at + 200, false));
    const h = await (await fetch(base + '/api/history?project=p')).json();
    assert.strictEqual(h.project, 'p');
    assert.deepStrictEqual(h.runs.map(r => r.id), ['h1', 'h2']);
    assert.strictEqual(h.features.length, 1);
    const [c1, c2] = h.features[0].cells;
    assert.deepStrictEqual(c1.fail, ['b']);
    assert.strictEqual(c1.n, 2);
    assert.deepStrictEqual(c2.fail, []);
    assert.ok(c2.ms >= 40);
    assert.strictEqual(h.features[0].label, 'unit');
  });
});
test('history: a run of one feature shares rows with the full run', async () => {
  await withServer({}, async base => {
    const at = Date.now() - 5000, ev = (run, t, label, groups) => [
      { type: 'run-start', run, project: 'q', t },
      { type: 'suite-start', run, suite: label, label, t },
      ...groups.map((g, i) => ({ type: 'test-end', run, suite: label, id: g + '-a', group: g, status: 'pass', ms: 5, t: t + i + 1 })),
      { type: 'run-end', run, status: 'pass', t: t + 50 }];
    await post(base, ev('f1', at, './tests/run.sh', ['F1', 'F2', 'F3']));
    await post(base, ev('f2', at + 100, './tests/run.sh F2', ['F2']));
    const h = await (await fetch(base + '/api/history?project=q')).json();
    assert.deepStrictEqual(h.features.map(f => f.group), ['F1', 'F2', 'F3']);
    assert.ok(h.features.every(f => f.label === 'tests/run.sh'));
    assert.strictEqual(h.features[1].cells[1].n, 1);
    assert.strictEqual(h.features[0].cells[1], null);
  });
});
});

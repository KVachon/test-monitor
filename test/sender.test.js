'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { Sender } = require('../lib/sender');

// A monitor that drops the first `down` requests on the floor, then takes everything.
async function flakyMonitor(down) {
  const got = [];
  let n = 0;
  const server = http.createServer((req, res) => {
    if (n++ < down) { req.socket.destroy(); return; }
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { got.push(...JSON.parse(body)); res.end('{}'); });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, got, server };
}

test.describe('sender', () => {
  test('a short outage loses nothing: events are kept and sent in order once the monitor answers', async () => {
    const m = await flakyMonitor(3);
    const logs = [];
    const s = new Sender({ url: m.url, log: l => logs.push(l) });
    try {
      for (let i = 0; i < 5; i++) { s.send({ type: 'test-end', i }); await new Promise(r => setTimeout(r, 300)); }
      s.send({ type: 'run-end' });
      const until = Date.now() + 10000;
      while (m.got.length < 6 && Date.now() < until) await new Promise(r => setTimeout(r, 100));
      assert.deepStrictEqual(m.got.map(e => e.type === 'run-end' ? 'end' : e.i), [0, 1, 2, 3, 4, 'end']);
      assert.strictEqual(logs.length, 1, 'says so once');
    } finally { await s.close(); m.server.close(); m.server.closeAllConnections(); }
  });

  test('closing delivers the run-end even when the last send just failed', async () => {
    const m = await flakyMonitor(1);
    const s = new Sender({ url: m.url, log: () => {} });
    try {
      s.send({ type: 'run-end' });
      await s.flush();
      assert.strictEqual(m.got.length, 0);
      await s.close();
      assert.deepStrictEqual(m.got.map(e => e.type), ['run-end']);
    } finally { m.server.close(); m.server.closeAllConnections(); }
  });
});

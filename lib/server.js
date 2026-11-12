'use strict';
// The always-on monitor: takes events over HTTP, keeps each run on disk, streams runs to the page.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { normalize } = require('./events');

const PAGE = path.join(__dirname, '..', 'page', 'index.html');
const MAX_BODY = 8 * 1024 * 1024;
const KEEP_RUNS = 300;

function createMonitor(opts = {}) {
  const dataDir = opts.dataDir;
  const runsDir = path.join(dataDir, 'runs');
  fs.mkdirSync(runsDir, { recursive: true });
  const indexFile = path.join(dataDir, 'index.json');
  const token = opts.token || '';
  const now = opts.now || Date.now;

  // id -> { meta, events (loaded lazily), seq, offset, lastT }
  const runs = new Map();
  let index = [];
  try { index = JSON.parse(fs.readFileSync(indexFile, 'utf8')); } catch { index = []; }
  for (const meta of index) runs.set(meta.id, { meta, events: null, seq: meta.seq || 0, offset: null, lastT: meta.lastT || 0 });

  const clients = new Set();
  let lastOpen = 0;

  function saveIndex() {
    const list = [...runs.values()].map(r => r.meta).sort((a, b) => b.started - a.started);
    for (const old of list.slice(KEEP_RUNS)) {
      runs.delete(old.id);
      fs.rm(path.join(runsDir, old.id + '.jsonl'), { force: true }, () => {});
    }
    const keep = list.slice(0, KEEP_RUNS).map(m => ({ ...m, seq: runs.get(m.id).seq, lastT: runs.get(m.id).lastT }));
    fs.writeFileSync(indexFile + '.tmp', JSON.stringify(keep));
    fs.renameSync(indexFile + '.tmp', indexFile);
  }

  function eventsOf(run) {
    if (!run.events) {
      try {
        run.events = fs.readFileSync(path.join(runsDir, run.meta.id + '.jsonl'), 'utf8')
          .split('\n').filter(Boolean).map(l => JSON.parse(l));
      } catch { run.events = []; }
    }
    return run.events;
  }

  // The fastest 30 seconds of the run, in tests per minute. The page starts its scale from this next time.
  function peakOf(events) {
    const ends = events.filter(e => e.type === 'test-end').map(e => e.t);
    let peak = 0, j = 0;
    for (let i = 0; i < ends.length; i++) {
      while (ends[j] <= ends[i] - 30000) j++;
      peak = Math.max(peak, (i - j + 1) * 2);
    }
    return peak;
  }

  // The last finished run of the same project and command, boiled down to what the page needs
  // to lay itself out and estimate time left before anything has run.
  function previousOf(run) {
    const m = run.meta;
    const prev = [...runs.values()]
      .filter(r => r !== run && r.meta.ended && r.meta.project === m.project && r.meta.command === m.command && r.meta.started < m.started)
      .sort((a, b) => b.meta.started - a.meta.started)[0];
    if (!prev) return null;
    const suites = [], bySuite = {};
    const suiteOf = (s, label) => bySuite[s] || (bySuite[s] = (suites.push({ suite: s, label: label || s, tests: [], ids: {} }), suites[suites.length - 1]));
    const add = (s, t) => {
      let x = s.ids[t.id];
      if (!x) { x = s.ids[t.id] = { id: t.id }; s.tests.push(x); }
      for (const k of ['group', 'groupName', 'desc', 'ms']) if (t[k] !== undefined) x[k] = t[k];
    };
    const started = {};
    for (const e of eventsOf(prev)) {
      if (e.type === 'suite-start') { const s = suiteOf(e.suite, e.label); if (e.label) s.label = e.label; (e.tests || []).forEach(t => add(s, t)); }
      else if (e.type === 'test-start') started[e.suite + '\0' + e.id] = e.t;
      else if (e.type === 'test-end') {
        const ms = e.ms !== undefined ? e.ms : (started[e.suite + '\0' + e.id] ? e.t - started[e.suite + '\0' + e.id] : undefined);
        add(suiteOf(e.suite), { ...e, ms });
      }
    }
    suites.forEach(s => delete s.ids);
    return { id: prev.meta.id, durationMs: prev.meta.ended - prev.meta.started, peak: prev.meta.peak || 0, suites };
  }

  function broadcast(ev) {
    const msg = `data: ${JSON.stringify(ev)}\n\n`;
    for (const c of clients) c.res.write(msg);
  }

  function openPage() {
    if (!opts.open || !opts.url) return;
    if ([...clients].some(c => c.local)) return; // a tab is already open on this machine: it switches to the new run itself
    if (now() - lastOpen < 15000) return;
    lastOpen = now();
    const url = opts.url;
    const [cmd, args] = process.platform === 'darwin' ? ['open', [url]]
      : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]];
    try { spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch {}
  }

  function ingest(list) {
    const t0 = now();
    const lines = {};
    const accepted = [];
    const errors = [];
    // The newest sender time per run in this batch, so the batch lines up with "now" and keeps its spacing.
    const newest = {};
    for (const e of list) if (e && typeof e.run === 'string' && typeof e.at === 'number') newest[e.run] = Math.max(newest[e.run] || 0, e.at);
    list.forEach((raw, i) => {
      let ev;
      try { ev = normalize(raw); } catch (e) { errors.push(`event ${i}: ${e.message}`); return; }
      let run = runs.get(ev.run);
      if (run && ev.type === 'run-start' && run.meta.startSeen) return; // a resend
      if (!run) {
        run = { meta: { id: ev.run, project: 'unnamed', command: '', host: '', started: 0, ended: 0, status: '', counts: { pass: 0, fail: 0, skip: 0, flaky: 0 } }, events: [], seq: 0, offset: null, lastT: 0 };
        runs.set(ev.run, run);
      }
      eventsOf(run);
      // Line up the sender's clock with ours once per run, so a batch keeps its own spacing.
      if (run.offset === null) run.offset = typeof ev.at === 'number' ? t0 - newest[ev.run] : 0;
      let t = typeof ev.at === 'number' ? ev.at + run.offset : t0;
      t = Math.max(Math.min(t, t0), run.lastT);
      run.lastT = t;
      delete ev.at;
      if (!run.meta.started) {
        run.meta.started = t;
        if (ev.type !== 'run-start') {
          const start = { type: 'run-start', run: ev.run, t, seq: ++run.seq };
          run.events.push(start); (lines[ev.run] = lines[ev.run] || []).push(start); accepted.push(start);
        }
      }
      const stored = { ...ev, t, seq: ++run.seq };
      const m = run.meta;
      if (ev.type === 'run-start') {
        m.startSeen = true;
        for (const k of ['project', 'command', 'host']) if (ev[k]) m[k] = ev[k];
        openPage();
      } else if (ev.type === 'test-end') {
        m.counts[ev.status]++;
      } else if (ev.type === 'run-end') {
        m.ended = t;
        m.status = ev.status || (m.counts.fail ? 'fail' : 'pass');
      }
      run.events.push(stored);
      (lines[ev.run] = lines[ev.run] || []).push(stored);
      accepted.push(stored);
      if (ev.type === 'run-end') m.peak = peakOf(run.events);
    });
    for (const [id, evs] of Object.entries(lines)) {
      fs.appendFileSync(path.join(runsDir, id + '.jsonl'), evs.map(e => JSON.stringify(e)).join('\n') + '\n');
    }
    if (accepted.length) saveIndex();
    accepted.forEach(broadcast);
    return { accepted: accepted.length, errors };
  }

  function latest() {
    const list = [...runs.values()].map(r => r.meta).filter(m => m.started).sort((a, b) => b.started - a.started);
    return (list.find(m => !m.ended) || list[0] || {}).id || null;
  }

  // ---- HTTP ----

  const isLocalAddr = a => /^(::1|127\.|::ffff:127\.)/.test(a || '');
  const isPrivateAddr = a => isLocalAddr(a) || /^(::ffff:)?(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(a || '') || /^f[cd]/i.test(a || '');
  const forwarded = req => !!(req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip'] || req.headers.forwarded);

  function tokenOk(req, url) {
    if (!token) return true;
    const h = req.headers.authorization || '';
    const given = h.startsWith('Bearer ') ? h.slice(7) : (url.searchParams.get('token') || '');
    const a = Buffer.from(given), b = Buffer.from(token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  // Writes always need the token. Reading (the page) is open on this machine and the home network,
  // and needs the token from anywhere else, including through a tunnel.
  const canRead = (req, url) => tokenOk(req, url) || (!forwarded(req) && isPrivateAddr(req.socket.remoteAddress));

  function send(res, code, body, type = 'application/json') {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('body too large'), { code: 413 })); req.destroy(); } else chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  function parseEvents(text) {
    const s = text.trim();
    if (!s) return [];
    try { const v = JSON.parse(s); return Array.isArray(v) ? v : [v]; }
    catch { return s.split('\n').filter(l => l.trim()).map(l => JSON.parse(l)); }
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    try {
      if (req.method === 'POST' && p === '/api/events') {
        if (!tokenOk(req, url)) return send(res, 401, { error: 'token required' });
        let list;
        try { list = parseEvents(await readBody(req)); } catch (e) { return send(res, e.code || 400, { error: e.code ? e.message : 'body must be JSON, a JSON array, or JSON lines' }); }
        const r = ingest(list);
        return send(res, r.errors.length && !r.accepted ? 400 : 200, r);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method not allowed' });
      if (p === '/healthz') return send(res, 200, { ok: true });
      if (!canRead(req, url)) return send(res, 401, { error: 'token required' });
      if (p === '/' || p === '/index.html') return send(res, 200, fs.readFileSync(PAGE), 'text/html; charset=utf-8');
      if (p === '/api/runs') {
        const list = [...runs.values()].map(r => r.meta).filter(m => m.started).sort((a, b) => b.started - a.started).slice(0, 50);
        return send(res, 200, { runs: list.map(({ startSeen, ...m }) => m) });
      }
      const rm = p.match(/^\/api\/runs\/([A-Za-z0-9._:-]{1,120})$/);
      if (rm) {
        const run = runs.get(rm[1]);
        if (!run) return send(res, 404, { error: 'no such run' });
        const { startSeen, ...meta } = run.meta;
        return send(res, 200, { meta, events: eventsOf(run), previous: previousOf(run), serverNow: now() });
      }
      if (p === '/api/stream') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        res.write(`event: hello\ndata: ${JSON.stringify({ serverNow: now(), latest: latest() })}\n\n`);
        const c = { res, local: isLocalAddr(req.socket.remoteAddress) && !forwarded(req) };
        clients.add(c);
        const beat = setInterval(() => res.write(`: beat ${now()}\n\n`), 15000);
        req.on('close', () => { clearInterval(beat); clients.delete(c); });
        return;
      }
      return send(res, 404, { error: 'not found' });
    } catch (e) {
      if (!res.headersSent) send(res, 500, { error: 'server error' });
      if (opts.log) opts.log(e.stack || String(e));
    }
  }

  const server = http.createServer(handle);
  server.ingest = ingest;
  server.clients = clients;
  return server;
}

module.exports = { createMonitor };

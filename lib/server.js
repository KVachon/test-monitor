'use strict';
// The always-on monitor: takes events over HTTP, keeps each run on disk, streams runs to the page.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { normalize } = require('./events');

const PAGE = path.join(__dirname, '..', 'page', 'index.html');
const FONTS = path.join(__dirname, '..', 'page', 'fonts');
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

  // The highest the page's dot went: the same rate (tests per minute over the last 30 seconds, or since the
  // start if shorter) eased the same way (12-second time constant), stepped every 250ms like the page.
  // The page starts its scale from this next time, so the scale doesn't have to jump.
  function peakOf(events) {
    const start = (events[0] || {}).t || 0;
    const ends = events.filter(e => e.type === 'test-end').map(e => e.t - start);
    if (!ends.length) return 0;
    const last = ends[ends.length - 1];
    let peak = 0, live = null, prev = 0, wi = 0, n = 0;
    for (let clock = 250; clock <= last + 250; clock += 250) {
      while (n < ends.length && ends[n] <= clock) n++;
      const win = Math.min(clock, 30000);
      while (wi < n && ends[wi] <= clock - win) wi++;
      const now = (n - wi) / (win / 60000);
      live = live === null ? now : live + (now - live) * (1 - Math.exp(-(clock - prev) / 12000));
      prev = clock;
      peak = Math.max(peak, live);
    }
    return Math.round(peak);
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

  // Per feature (suite + group) totals for one finished run: time, and which tests failed or were flaky.
  // Finished runs never change, so each is worked out once.
  const summaries = new Map();
  function summaryOf(run) {
    let sum = summaries.get(run.meta.id);
    if (sum) return sum;
    const feats = [], by = {}, labels = {}, names = {}, started = {};
    for (const e of eventsOf(run)) {
      if (e.type === 'suite-start') {
        if (e.label) labels[e.suite] = e.label;
        (e.tests || []).forEach(t => { if (t.group && t.groupName) names[e.suite + '\0' + t.group] = t.groupName; });
      }
      if (e.type === 'test-start') started[e.suite + '\0' + e.id] = e.t;
      if (e.type !== 'test-end') continue;
      const key = e.suite + '\0' + (e.group || e.suite);
      let f = by[key];
      if (!f) { f = by[key] = { suite: e.suite, group: e.group || labels[e.suite] || e.suite, n: 0, ms: 0, fail: [], flaky: [], skip: 0 }; feats.push(f); }
      if (e.groupName) f.name = e.groupName;
      const ms = e.ms !== undefined ? e.ms : started[e.suite + '\0' + e.id] ? e.t - started[e.suite + '\0' + e.id] : 0;
      f.n++; f.ms += ms;
      if (e.status === 'fail') f.fail.push(e.id); else if (e.status === 'flaky') f.flaky.push(e.id); else if (e.status === 'skip') f.skip++;
    }
    feats.forEach(f => { f.label = labels[f.suite] || f.suite; if (!f.name && names[f.suite + '\0' + f.group]) f.name = names[f.suite + '\0' + f.group]; });
    sum = feats;
    if (run.meta.ended) summaries.set(run.meta.id, sum);
    return sum;
  }

  // The last finished runs of one project, oldest first, with one row per feature across them.
  function history(project, limit) {
    const done = [...runs.values()].filter(r => r.meta.ended && r.meta.started).sort((a, b) => b.meta.started - a.meta.started);
    if (!project) project = done[0] && done[0].meta.project;
    const list = done.filter(r => r.meta.project === project).slice(0, limit).reverse();
    const rows = [], byKey = {};
    // One command run with arguments (`tests/run.sh F4`) is the same suite as the full run (`tests/run.sh`),
    // so its features share rows rather than starting a second block.
    const norm = l => String(l).replace(/^\.[\\/]/, '');
    const labels = [...new Set(list.flatMap(r => summaryOf(r).map(f => norm(f.label))))];
    const canon = l => { l = norm(l); return labels.filter(m => l === m || l.startsWith(m + ' ')).sort((a, b) => a.length - b.length)[0] || l; };
    const keyOf = f => canon(f.label) + '\0' + f.group;
    // Features in the order the fullest run ran them (newest first among equals); others after.
    const byFull = list.map((r, i) => ({ r, i, n: summaryOf(r).length })).sort((a, b) => b.n - a.n || b.i - a.i);
    byFull.forEach(({ r }) => summaryOf(r).forEach(f => {
      const k = keyOf(f), label = canon(f.label);
      if (!byKey[k]) { byKey[k] = { suite: label, label, group: f.group, name: f.name, cells: list.map(() => null) }; rows.push(byKey[k]); }
      else if (!byKey[k].name && f.name) byKey[k].name = f.name;
    }));
    list.forEach((r, i) => summaryOf(r).forEach(f => {
      const { n, ms, fail, flaky, skip } = f, c = byKey[keyOf(f)].cells;
      // Two suites of one run that fold into one row add up.
      c[i] = c[i] ? { n: c[i].n + n, ms: c[i].ms + ms, fail: [...c[i].fail, ...fail], flaky: [...c[i].flaky, ...flaky], skip: c[i].skip + skip } : { n, ms, fail, flaky, skip };
    }));
    // Keep suites together, in the order they first appear.
    const order = [...new Set(rows.map(r => r.suite))];
    rows.sort((a, b) => order.indexOf(a.suite) - order.indexOf(b.suite));
    return {
      project: project || null,
      runs: list.map(r => ({ id: r.meta.id, started: r.meta.started, durationMs: r.meta.ended - r.meta.started, status: r.meta.status, command: r.meta.command, host: r.meta.host })),
      features: rows,
    };
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

  const COOKIE = 'kurtest_token';
  const cookieOf = req => {
    const m = (req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  };
  const same = (given, want) => {
    const a = Buffer.from(given || ''), b = Buffer.from(want);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  // The token as a bearer header or ?token=; for reading, also the sign-in cookie.
  function tokenOk(req, url, { cookie = false } = {}) {
    if (!token) return true;
    const h = req.headers.authorization || '';
    if (same(h.startsWith('Bearer ') ? h.slice(7) : url.searchParams.get('token'), token)) return true;
    return cookie && same(cookieOf(req), token);
  }
  // Writes always need the token. Reading (the page) is open on this machine, on the local network only
  // with lanView, and needs the token (or the sign-in cookie) from anywhere else, including through a tunnel.
  const canRead = (req, url) => tokenOk(req, url, { cookie: true }) ||
    (!forwarded(req) && (isLocalAddr(req.socket.remoteAddress) || (opts.lanView && isPrivateAddr(req.socket.remoteAddress))));

  // Opening the page once with ?token= swaps the token for a cookie and drops it from the address,
  // so it doesn't stay in the browser's history.
  function signIn(req, res, url) {
    const secure = req.headers['x-forwarded-proto'] === 'https' || /"scheme":"https"/.test(req.headers['cf-visitor'] || '');
    url.searchParams.delete('token');
    const q = url.searchParams.toString();
    res.writeHead(302, {
      'set-cookie': `${COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`,
      location: url.pathname + (q ? '?' + q : ''),
      'cache-control': 'no-store',
    });
    res.end();
  }

  const SIGN_IN = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KurTest: sign in</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0d;color:#e8e8ea;font:15px/1.5 system-ui,sans-serif}
form{width:min(360px,calc(100vw - 32px));display:grid;gap:10px}h1{font-size:18px;margin:0 0 4px}p{margin:0;color:#9a9aa2;font-size:13px}
input,button{font:inherit;padding:10px 12px;border-radius:8px;border:1px solid #2a2a30;background:#141418;color:inherit}
button{background:#e8e8ea;color:#0b0b0d;border:0;font-weight:600;cursor:pointer}</style>
<form method="get" action="/"><h1>KurTest</h1><p>This monitor needs its token. On the machine running KurTest, <code>kurtest token</code> prints it.</p>
<input name="token" type="password" autocomplete="current-password" placeholder="Token" required autofocus><button>Sign in</button></form>`;

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
      const fm = p.match(/^\/fonts\/([\w.-]+\.woff2)$/);
      if (fm) {
        let font;
        try { font = fs.readFileSync(path.join(FONTS, fm[1])); } catch { return send(res, 404, { error: 'not found' }); }
        res.writeHead(200, { 'content-type': 'font/woff2', 'cache-control': 'public, max-age=31536000, immutable' });
        return res.end(font);
      }
      const isPage = p === '/' || p === '/index.html';
      if (isPage && token && url.searchParams.has('token') && tokenOk(req, url)) return signIn(req, res, url);
      if (!canRead(req, url)) return isPage ? send(res, 401, SIGN_IN, 'text/html; charset=utf-8') : send(res, 401, { error: 'token required' });
      if (isPage) return send(res, 200, fs.readFileSync(PAGE), 'text/html; charset=utf-8');
      if (p === '/api/runs') {
        // Newest first. ?project= narrows it; ?limit= (default 50, up to every kept run).
        const project = url.searchParams.get('project');
        const limit = Math.min(Math.max(1, Number(url.searchParams.get('limit')) || 50), KEEP_RUNS);
        const all = [...runs.values()].map(r => r.meta).filter(m => m.started).sort((a, b) => b.started - a.started);
        const projects = [...new Set(all.map(m => m.project))];
        const list = all.filter(m => !project || m.project === project);
        return send(res, 200, {
          runs: list.slice(0, limit).map(({ startSeen, ...m }) => ({ ...m, durationMs: m.ended ? m.ended - m.started : null })),
          total: list.length,
          projects,
        });
      }
      if (p === '/api/history') {
        // ?project= (default: the project of the newest run), ?limit= runs (default 20, up to 60).
        const limit = Math.min(Math.max(1, Number(url.searchParams.get('limit')) || 20), 60);
        return send(res, 200, history(url.searchParams.get('project'), limit));
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

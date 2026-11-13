'use strict';
// `kurtest serve`: starts the monitor.
//
//   kurtest serve [--port 7357] [--host 127.0.0.1] [--lan-view] [--data DIR] [--open]
//
// By default it listens on this machine only. --host 0.0.0.0 shares it on the network: senders then
// need the token, and so does the page, unless --lan-view lets the home network see it without one.
// A token is made on first start and kept in <data>/token (or set KURTEST_TOKEN).
//
// Environment: KURTEST_PORT, KURTEST_HOST, KURTEST_LAN_VIEW=1, KURTEST_DATA, KURTEST_OPEN=1, KURTEST_TOKEN
// (the old TESTMONITOR_* names work too).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createMonitor } = require('./server');
const names = require('./names');

const isLoopback = h => /^(127\.|::1$|localhost$)/.test(h);

function parse(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') o.help = true;
    else if (a === '--open') o.open = true;
    else if (a === '--lan-view') o.lanView = true;
    else if (/^--(port|host|bind|data)$/.test(a)) o[a === '--bind' ? 'host' : a.slice(2)] = argv[++i];
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

const HELP = 'kurtest serve [--port 7357] [--host 127.0.0.1] [--lan-view] [--data DIR] [--open]';

// legacy: the old `test-monitor` command, which listened on every address and showed the page to the
// home network without a token, and never made a token by itself.
function serve(argv, { legacy = false, log = console.log, err = console.error } = {}) {
  let o;
  try { o = parse(argv); } catch (e) { err('kurtest serve: ' + e.message); err(HELP); process.exit(2); }
  if (o.help) { log(HELP); process.exit(0); }

  const port = Number(o.port || names.env('PORT') || names.DEFAULT_PORT);
  const host = String(o.host || names.env('HOST', 'BIND') || (legacy ? '0.0.0.0' : '127.0.0.1'));
  const lanView = legacy || !!o.lanView || names.env('LAN_VIEW') === '1';
  const dataDir = path.resolve(String(o.data || names.env('DATA') || names.homeDir()));
  const open = !!o.open || names.env('OPEN') === '1';
  fs.mkdirSync(dataDir, { recursive: true });

  let token = names.env('TOKEN') || names.readToken(dataDir);
  let madeToken = false;
  if (!token && !legacy) {
    token = crypto.randomBytes(24).toString('hex');
    fs.writeFileSync(path.join(dataDir, 'token'), token + '\n', { mode: 0o600 });
    madeToken = true;
  }

  const url = `http://localhost:${port}/`;
  const server = createMonitor({ dataDir, token, open, url, lanView, log: m => err(m) });
  const pidFile = path.join(dataDir, 'server.pid');
  server.on('error', e => {
    if (e.code === 'EADDRINUSE') err(`kurtest serve: port ${port} is already in use. Is KurTest already running? (kurtest stop stops it)`);
    else err('kurtest serve: ' + e.message);
    process.exit(1);
  });
  server.listen(port, host, () => {
    try { fs.writeFileSync(pidFile, String(process.pid)); } catch {}
    const cleanup = () => { try { if (fs.readFileSync(pidFile, 'utf8') === String(process.pid)) fs.rmSync(pidFile); } catch {} };
    process.on('exit', cleanup);
    for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0));

    log(`KurTest is running at ${url}`);
    log(`  listening on ${host}:${port}, runs kept in ${dataDir}`);
    if (isLoopback(host)) log('  only this machine can reach it (use --host 0.0.0.0 to share it on your network)');
    else {
      log(`  shared on the network: senders need the token${lanView ? '; the page is open to your local network' : ', and so does the page'}`);
      if (!token) log('  no token set, so anyone who can reach this port can send runs');
    }
    if (madeToken) log(`  made a token in ${path.join(dataDir, 'token')}`);
    if (token && !isLoopback(host)) log('  `kurtest token` prints the token and a sign-in link for other devices');
  });
  return server;
}

module.exports = { serve, HELP };

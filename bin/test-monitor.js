#!/usr/bin/env node
'use strict';
// Runs the monitor. On the Mac mini this is the always-on service.
//
//   test-monitor [--port 7357] [--bind 0.0.0.0] [--data DIR] [--open]
//
// Settings also come from the environment: TESTMONITOR_PORT, TESTMONITOR_BIND, TESTMONITOR_DATA,
// TESTMONITOR_OPEN=1 and TESTMONITOR_TOKEN (or a token file at <data>/token).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createMonitor } = require('../lib/server');

const argv = process.argv.slice(2);
const flag = name => { const i = argv.indexOf(name); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : undefined; };
if (flag('--help') || flag('-h')) {
  console.log('test-monitor [--port 7357] [--bind 0.0.0.0] [--data DIR] [--open]');
  process.exit(0);
}

const port = Number(flag('--port') || process.env.TESTMONITOR_PORT || 7357);
const bind = String(flag('--bind') || process.env.TESTMONITOR_BIND || '0.0.0.0');
const dataDir = path.resolve(String(flag('--data') || process.env.TESTMONITOR_DATA || path.join(os.homedir(), '.test-monitor')));
const open = !!flag('--open') || process.env.TESTMONITOR_OPEN === '1';
let token = process.env.TESTMONITOR_TOKEN || '';
if (!token) { try { token = fs.readFileSync(path.join(dataDir, 'token'), 'utf8').trim(); } catch {} }

const url = `http://localhost:${port}/`;
const server = createMonitor({ dataDir, token, open, url, log: m => console.error(m) });
server.listen(port, bind, () => {
  console.log(`Test Monitor on ${url} (listening on ${bind}:${port}, data in ${dataDir})`);
  console.log(token ? 'Senders need the token.' : 'No token set: anyone who can reach this port can send runs.');
});

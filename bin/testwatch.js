#!/usr/bin/env node
'use strict';
// Runs tests and reports them to the Test Monitor, while the terminal output stays as it was.
//
//   testwatch                      run every suite in .testmonitor.json, as one run
//   testwatch php browser          run those suites from .testmonitor.json
//   testwatch -- npm test          run any command (TAP and @@testmonitor lines are read automatically)
//
//   testwatch --claude-hook        the Claude Code hook (see lib/hook.js)
//   testwatch --install-claude [--url URL]   set this machine up: hook, CLAUDE.md rule, monitor address, token
//
// Options: --project NAME  --label TEXT  --reader auto|tap|pattern|marker  --url URL
// Environment: TESTMONITOR_URL (default http://localhost:7357), TESTMONITOR_TOKEN (or ~/.test-monitor/token).
// The exit code is the test command's.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { createReader, parseMarker, MARKER } = require('../lib/readers');
const { Sender } = require('../lib/sender');

function usage(code) {
  console.log('testwatch [--project NAME] [--label TEXT] [--reader auto|tap|pattern|marker] [--url URL] [suite ...] [-- command ...]');
  process.exit(code);
}

// ---- arguments ----
const argv = process.argv.slice(2);
if (argv[0] === '--claude-hook') { require('../lib/hook').runHook(); return; }
if (argv[0] === '--install-claude') {
  const i = argv.indexOf('--url');
  try { require('../lib/install').install({ url: i > 0 ? argv[i + 1] : undefined }); }
  catch (e) { console.error('testwatch: ' + e.message); process.exit(1); }
  return;
}
const dash = argv.indexOf('--');
const own = dash >= 0 ? argv.slice(0, dash) : argv;
const adhoc = dash >= 0 ? argv.slice(dash + 1) : null;
const opt = {};
const names = [];
for (let i = 0; i < own.length; i++) {
  const a = own[i];
  if (a === '-h' || a === '--help') usage(0);
  else if (/^--(project|label|reader|url)$/.test(a)) opt[a.slice(2)] = own[++i];
  else if (a.startsWith('--')) { console.error(`testwatch: unknown option ${a}`); usage(2); }
  else names.push(a);
}

function findConfig(dir) {
  for (;;) {
    const f = path.join(dir, '.testmonitor.json');
    if (fs.existsSync(f)) return f;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}
const configFile = findConfig(process.cwd());
let config = {};
if (configFile) {
  try { config = JSON.parse(fs.readFileSync(configFile, 'utf8')); }
  catch (e) { console.error(`testwatch: can't read ${configFile}: ${e.message}`); process.exit(2); }
}
const root = configFile ? path.dirname(configFile) : process.cwd();

let suites;
if (adhoc) {
  if (!adhoc.length) usage(2);
  const { command, shell } = require('../lib/quote').commandFor(adhoc);
  suites = [{ name: 'tests', label: opt.label || adhoc.join(' '), command, shell, reader: opt.reader || 'auto', cwd: process.cwd() }];
} else {
  const all = config.suites || [];
  if (!all.length) { console.error('testwatch: no .testmonitor.json with suites here. Use: testwatch -- <test command>'); process.exit(2); }
  suites = names.length ? names.map(n => all.find(s => s.name === n) || (console.error(`testwatch: no suite named ${n}`), process.exit(2))) : all;
  suites = suites.map(s => ({ ...s, label: s.label || s.name, reader: opt.reader || s.reader || 'auto', cwd: s.cwd ? path.resolve(root, s.cwd) : root }));
}

const project = opt.project || config.project || path.basename(root);
// Where runs go: --url, then TESTMONITOR_URL, then the project's .testmonitor.json, then this machine's
// ~/.test-monitor/config.json (written by --install-claude), then the monitor on this machine.
let machine = {};
try { machine = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.test-monitor', 'config.json'), 'utf8')); } catch {}
const url = opt.url || process.env.TESTMONITOR_URL || config.url || machine.url || 'http://localhost:7357';
let token = process.env.TESTMONITOR_TOKEN || '';
if (!token) { try { token = fs.readFileSync(path.join(os.homedir(), '.test-monitor', 'token'), 'utf8').trim(); } catch {} }

// A testwatch inside another testwatch joins the outer run as another suite.
const outerRun = process.env.TESTMONITOR_RUN;
const host = os.hostname().replace(/\.local$/, '');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const run = outerRun || `${host.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stamp}-${crypto.randomBytes(2).toString('hex')}`;
const sender = new Sender({ url, token });
const send = ev => sender.send({ run, ...ev });

const commandLabel = adhoc ? suites[0].command : `testwatch${names.length ? ' ' + names.join(' ') : ''}`;
if (!outerRun) send({ type: 'run-start', project, command: commandLabel, host });

let child = null;
let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stopping = true;
    if (child) { try { child.kill(sig); } catch {} }
  });
}

function runSuite(s) {
  return new Promise(resolve => {
    const suite = s.name;
    let reader;
    try { reader = createReader(s.reader, s); }
    catch (e) { console.error(`testwatch: ${e.message}`); return resolve({ code: 2, failed: 0 }); }
    send({ type: 'suite-start', suite, label: s.label, command: s.command });
    let failed = 0, seen = 0;
    const emit = ev => {
      if (!ev || typeof ev !== 'object') return;
      if (ev.type === 'run-start' || ev.type === 'run-end') return; // the run belongs to testwatch
      const out = { suite, ...ev, run };
      if (out.type === 'test-end') seen++;
      if (out.type === 'test-end' && out.status === 'fail') failed++;
      send(out);
    };

    child = spawn(s.command, {
      cwd: s.cwd,
      shell: s.shell || true, // a suite can name its shell, e.g. "bash" for .sh scripts on Windows
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env, TESTMONITOR: '1', TESTMONITOR_RUN: run, TESTMONITOR_URL: url, TESTMONITOR_SUITE: suite, FORCE_COLOR: process.env.FORCE_COLOR || (process.stdout.isTTY ? '1' : '') },
    });

    // Mirror output as it comes, line by line for parsing, but hide @@testmonitor lines.
    const pipe = (stream, outStream) => {
      let buf = '', written = 0;
      stream.setEncoding('utf8');
      const handle = line => {
        const ev = written === 0 ? parseMarker(line) : null;
        if (ev) return emit(ev);
        outStream.write(line.slice(written));
        reader.line(line).forEach(emit);
      };
      stream.on('data', chunk => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          handle(buf.slice(0, i + 1));
          buf = buf.slice(i + 1);
          written = 0;
        }
        // A partial line (a progress bar, dots) shows straight away unless it might be a marker.
        const head = buf.trimStart();
        if (buf && !(MARKER.startsWith(head.slice(0, MARKER.length)) || head.startsWith(MARKER))) {
          outStream.write(buf.slice(written));
          written = buf.length;
        }
      });
      return new Promise(r => stream.on('end', () => { if (buf) handle(buf); r(); }));
    };
    const done = Promise.all([pipe(child.stdout, process.stdout), pipe(child.stderr, process.stderr)]);
    child.on('error', e => console.error(`testwatch: ${e.message}`));
    child.on('close', async code => {
      await done;
      child = null;
      reader.end().forEach(emit);
      send({ type: 'suite-end', suite });
      if (!seen) process.stderr.write(`testwatch: no tests could be read from "${s.command}", so the monitor only shows that it ran. ` +
        'Give it TAP output, the Playwright reporter or regex rules in .testmonitor.json (see docs/convention.md in the test-monitor repo).\n');
      resolve({ code: code === null ? 1 : code, failed });
    });
  });
}

(async () => {
  let exit = 0, failed = 0;
  for (const s of suites) {
    if (stopping) break;
    const r = await runSuite(s);
    failed += r.failed;
    if (r.code && !exit) exit = r.code;
  }
  if (!outerRun) send({ type: 'run-end', status: stopping ? 'stopped' : (failed || exit ? 'fail' : 'pass') });
  await sender.close();
  process.exit(stopping && !exit ? 130 : exit);
})();

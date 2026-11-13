'use strict';
// `kurtest`: runs tests and reports them to KurTest, while the terminal output stays as it was.
//
//   kurtest                      run every suite in .kurtest.json, as one run
//   kurtest unit e2e             run those suites from .kurtest.json
//   kurtest -- npm test          run any command (TAP and @@kurtest lines are read automatically)
//
// Options: --project NAME  --label TEXT  --reader auto|tap|pattern|marker  --url URL
// Where runs go: --url, KURTEST_URL, the project's .kurtest.json, ~/.kurtest/config.json, then this machine.
// If nothing is set and KurTest isn't running on this machine yet, it starts it in the background.
// The exit code is the test command's.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { createReader, parseMarker, isMarkerStart } = require('./readers');
const { Sender } = require('./sender');
const N = require('./names');

const USAGE = 'kurtest [--project NAME] [--label TEXT] [--reader auto|tap|pattern|marker] [--url URL] [suite ...] [-- command ...]';

async function run(argv, { me = 'kurtest' } = {}) {
  function usage(code) {
    console.log(USAGE.replace(/^kurtest/, me));
    process.exit(code);
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
    else if (a.startsWith('--')) { console.error(`${me}: unknown option ${a}`); usage(2); }
    else names.push(a);
  }

  const configFile = N.findProjectConfig(process.cwd());
  let config = {};
  if (configFile) {
    try { config = JSON.parse(fs.readFileSync(configFile, 'utf8')); }
    catch (e) { console.error(`${me}: can't read ${configFile}: ${e.message}`); process.exit(2); }
  }
  const root = configFile ? path.dirname(configFile) : process.cwd();

  let suites;
  if (adhoc) {
    if (!adhoc.length) usage(2);
    const { command, shell } = require('./quote').commandFor(adhoc);
    suites = [{ name: 'tests', label: opt.label || adhoc.join(' '), command, shell, reader: opt.reader || 'auto', cwd: process.cwd() }];
  } else {
    const all = config.suites || [];
    if (!all.length) { console.error(`${me}: no .kurtest.json with suites here. Use: ${me} -- <test command>`); process.exit(2); }
    suites = names.length ? names.map(n => all.find(s => s.name === n) || (console.error(`${me}: no suite named ${n}`), process.exit(2))) : all;
    suites = suites.map(s => ({ ...s, label: s.label || s.name, reader: opt.reader || s.reader || 'auto', cwd: s.cwd ? path.resolve(root, s.cwd) : root }));
  }

  const project = opt.project || config.project || path.basename(root);
  // Where runs go: --url, then KURTEST_URL, then the project's .kurtest.json, then this machine's
  // ~/.kurtest/config.json (written by `kurtest init claude`), then KurTest on this machine.
  const home = N.homeDir();
  let machine = {};
  try { machine = JSON.parse(fs.readFileSync(path.join(home, 'config.json'), 'utf8')); } catch {}
  const chosen = opt.url || N.env('URL') || config.url || machine.url;
  const url = chosen || `http://localhost:${N.env('PORT') || N.DEFAULT_PORT}`;
  // A kurtest inside another kurtest joins the outer run as another suite.
  const outerRun = N.env('RUN');
  if (!chosen && !outerRun) await require('./autostart').ensureLocal(url, { me });
  const token = N.env('TOKEN') || N.readToken(home);

  const host = os.hostname().replace(/\.local$/, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const run = outerRun || `${host.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stamp}-${crypto.randomBytes(2).toString('hex')}`;
  const sender = new Sender({ url, token, me });
  const send = ev => sender.send({ run, ...ev });

  const commandLabel = adhoc ? suites[0].command : `${me}${names.length ? ' ' + names.join(' ') : ''}`;
  if (!outerRun) {
    send({ type: 'run-start', project, command: commandLabel, host });
    process.stderr.write(`${me}: watch it live at ${url.replace(/\/+$/, '')}/\n`);
  }

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
      catch (e) { console.error(`${me}: ${e.message}`); return resolve({ code: 2, failed: 0 }); }
      send({ type: 'suite-start', suite, label: s.label, command: s.command });
      let failed = 0, seen = 0;
      const emit = ev => {
        if (!ev || typeof ev !== 'object') return;
        if (ev.type === 'run-start' || ev.type === 'run-end') return; // the run belongs to kurtest
        const out = { suite, ...ev, run };
        if (out.type === 'test-end') seen++;
        if (out.type === 'test-end' && out.status === 'fail') failed++;
        send(out);
      };

      child = spawn(s.command, {
        cwd: s.cwd,
        shell: s.shell || true, // a suite can name its shell, e.g. "bash" for .sh scripts on Windows
        stdio: ['inherit', 'pipe', 'pipe'],
        // Both names, so reporters written for either see the run.
        env: { ...process.env, KURTEST: '1', KURTEST_RUN: run, KURTEST_URL: url, KURTEST_SUITE: suite,
          TESTMONITOR: '1', TESTMONITOR_RUN: run, TESTMONITOR_URL: url, TESTMONITOR_SUITE: suite, FORCE_COLOR: process.env.FORCE_COLOR || (process.stdout.isTTY ? '1' : '') },
      });

      // Mirror output as it comes, line by line for parsing, but hide @@kurtest (and @@testmonitor) lines.
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
          if (buf && !isMarkerStart(head)) {
            outStream.write(buf.slice(written));
            written = buf.length;
          }
        });
        return new Promise(r => stream.on('end', () => { if (buf) handle(buf); r(); }));
      };
      const done = Promise.all([pipe(child.stdout, process.stdout), pipe(child.stderr, process.stderr)]);
      child.on('error', e => console.error(`${me}: ${e.message}`));
      child.on('close', async code => {
        await done;
        child = null;
        reader.end().forEach(emit);
        send({ type: 'suite-end', suite });
        if (!seen) process.stderr.write(`${me}: no tests could be read from "${s.command}", so the monitor only shows that it ran. ` +
          'Give it TAP output, the Playwright reporter or regex rules in .kurtest.json (see docs/runners.md in the KurTest repo).\n');
        resolve({ code: code === null ? 1 : code, failed });
      });
    });
  }

  {
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
  }
}

module.exports = { run, USAGE };

'use strict';
// When a run has nowhere else to go and KurTest isn't running on this machine, start it in the background
// (with --open, so the page opens for the run), so `npx kurtest -- npm test` works with nothing set up.
// KURTEST_AUTOSTART=0 turns this off.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const N = require('./names');

const healthy = url => fetch(url.replace(/\/+$/, '') + '/healthz', { signal: AbortSignal.timeout(800) })
  .then(r => r.ok, () => false);

async function ensureLocal(url, { me = 'kurtest', log = m => process.stderr.write(m + '\n') } = {}) {
  if (N.env('AUTOSTART') === '0' || await healthy(url)) return false;
  const home = N.homeDir();
  fs.mkdirSync(home, { recursive: true });
  const out = fs.openSync(path.join(home, 'server.log'), 'a');
  const port = new URL(url).port || String(N.DEFAULT_PORT);
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'bin', 'kurtest.js'), 'serve', '--open', '--port', port],
    { detached: true, stdio: ['ignore', out, out], windowsHide: true });
  child.unref();
  fs.closeSync(out);
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 200));
    if (await healthy(url)) {
      log(`${me}: started KurTest in the background (\`kurtest stop\` stops it, \`kurtest service install\` keeps it running)`);
      return true;
    }
  }
  log(`${me}: couldn't start KurTest; see ${path.join(home, 'server.log')}`);
  return false;
}

module.exports = { ensureLocal, healthy };

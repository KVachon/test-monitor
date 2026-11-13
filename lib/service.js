'use strict';
// `kurtest service install|remove|status`: keeps KurTest running, starting it when you log in.
//   macOS    a launchd agent: ~/Library/LaunchAgents/dev.kurtest.plist
//   Linux    a systemd user service: ~/.config/systemd/user/kurtest.service
//   Windows  a scheduled task "KurTest" at logon, started hidden through wscript
// Options after `install` are passed to `kurtest serve`, e.g. `kurtest service install --host 0.0.0.0`.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const N = require('./names');

const LABEL = 'dev.kurtest';
const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// systemd's ExecStart quoting: double quotes, with \ and " escaped.
const sd = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
// VBScript string: double the quotes.
const vbs = s => String(s).replace(/"/g, '""');

// What installing writes and runs on one platform. Pure, so it can be tested anywhere.
function plan(platform, { node, script, args = [], home, dataDir }) {
  const p = platform === 'win32' ? path.win32 : path.posix; // the target's paths, wherever this runs
  const argv = [node, script, 'serve', ...args];
  const log = p.join(dataDir, 'server.log');
  if (platform === 'darwin') {
    const file = p.join(home, 'Library', 'LaunchAgents', LABEL + '.plist');
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array>
${argv.map(a => `    <string>${xml(a)}</string>`).join('\n')}
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(log)}</string>
</dict></plist>
`;
    return {
      files: [{ path: file, content }],
      start: [['launchctl', ['unload', file], { ignoreFailure: true }], ['launchctl', ['load', '-w', file]]],
      stop: [['launchctl', ['unload', '-w', file], { ignoreFailure: true }]],
      where: file,
    };
  }
  if (platform === 'linux') {
    const file = p.join(home, '.config', 'systemd', 'user', 'kurtest.service');
    const content = `[Unit]
Description=KurTest, a live page for test runs
After=network.target

[Service]
ExecStart=${argv.map(sd).join(' ')}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
`;
    return {
      files: [{ path: file, content }],
      start: [['systemctl', ['--user', 'daemon-reload']], ['systemctl', ['--user', 'enable', '--now', 'kurtest.service']]],
      stop: [['systemctl', ['--user', 'disable', '--now', 'kurtest.service'], { ignoreFailure: true }]],
      where: file,
      note: 'To keep it running while you are logged out (a server with no desktop): loginctl enable-linger $USER',
    };
  }
  if (platform === 'win32') {
    const launcher = p.join(dataDir, 'kurtest-service.vbs');
    // Run hidden (0), and don't wait (False). Output goes to server.log through cmd.
    const line = argv.map(a => `"${a}"`).join(' ') + ` >> "${log}" 2>&1`;
    const cmd = `cmd /c "${line}"`; // cmd drops the outer quotes and runs the line as written
    const content = `CreateObject("WScript.Shell").Run "${vbs(cmd)}", 0, False\r\n`;
    return {
      files: [{ path: launcher, content }],
      start: [
        ['schtasks', ['/Create', '/F', '/TN', 'KurTest', '/SC', 'ONLOGON', '/RL', 'LIMITED', '/TR', `wscript.exe "${launcher}"`]],
        ['schtasks', ['/Run', '/TN', 'KurTest']],
      ],
      stop: [['schtasks', ['/End', '/TN', 'KurTest'], { ignoreFailure: true }], ['schtasks', ['/Delete', '/F', '/TN', 'KurTest'], { ignoreFailure: true }]],
      where: 'the scheduled task "KurTest"',
    };
  }
  throw new Error(`kurtest service doesn't know how to set up ${platform} yet; run \`kurtest serve\` under your own service manager`);
}

function exec([cmd, args, o = {}], log) {
  const r = spawnSync(cmd, args, { stdio: 'pipe', encoding: 'utf8', windowsHide: true });
  if ((r.error || r.status) && !o.ignoreFailure) {
    throw new Error(`${cmd} ${args.join(' ')} failed: ${(r.error && r.error.message) || (r.stderr || r.stdout || '').trim()}`);
  }
  return r;
}

// Stops the KurTest that wrote <dataDir>/server.pid. True if one was running.
function stopServer(dataDir) {
  let pid;
  try { pid = Number(fs.readFileSync(path.join(dataDir, 'server.pid'), 'utf8')); } catch { return false; }
  try { process.kill(pid); } catch { return false; }
  return true;
}

async function service(argv, { log = console.log, err = console.error } = {}) {
  const [action, ...args] = argv;
  const script = path.resolve(__dirname, '..', 'bin', 'kurtest.js');
  const dataDir = path.resolve(N.env('DATA') || N.homeDir());
  const p = () => plan(process.platform, { node: process.execPath, script, args, home: os.homedir(), dataDir });
  try {
    if (action === 'install') {
      // npx keeps packages in a cache that can be cleared, so a service shouldn't point there.
      if (/[\\/]_npx[\\/]/.test(script)) throw new Error('install KurTest first (npm i -g kurtest), then run `kurtest service install`');
      const pl = p();
      pl.stop.forEach(c => exec(c, log));
      if (stopServer(dataDir)) await new Promise(r => setTimeout(r, 500)); // free the port for the service
      fs.mkdirSync(dataDir, { recursive: true });
      for (const f of pl.files) { fs.mkdirSync(path.dirname(f.path), { recursive: true }); fs.writeFileSync(f.path, f.content); }
      pl.start.forEach(c => exec(c, log));
      log(`✓ KurTest will start when you log in (${pl.where}), running ${process.execPath}`);
      if (pl.note) log('  ' + pl.note);
      log('  If you switch Node versions, run `kurtest service install` again.');
      const url = `http://localhost:${N.env('PORT') || N.DEFAULT_PORT}`;
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 250));
        if (await require('./autostart').healthy(url)) { log(`✓ Running at ${url}/`); return; }
      }
      log(`! Not answering at ${url} yet; see ${path.join(dataDir, 'server.log')}`);
    } else if (action === 'remove') {
      const pl = p();
      pl.stop.forEach(c => exec(c, log));
      for (const f of pl.files) fs.rmSync(f.path, { force: true });
      stopServer(dataDir); // on Windows the task only launched it, so stopping the task leaves it running
      log('✓ KurTest is stopped and no longer starts when you log in');
    } else if (action === 'status') {
      const pl = p();
      const installed = pl.files.every(f => fs.existsSync(f.path));
      const url = `http://localhost:${N.env('PORT') || N.DEFAULT_PORT}`;
      const up = await require('./autostart').healthy(url);
      log(`${installed ? 'Installed' : 'Not installed'} as a service; ${up ? 'running at ' + url + '/' : 'not running'}`);
    } else {
      log('kurtest service install [serve options] | remove | status');
      process.exitCode = action ? 2 : 0;
    }
  } catch (e) { err('kurtest service: ' + e.message); process.exitCode = 1; }
}

module.exports = { service, plan, stopServer };

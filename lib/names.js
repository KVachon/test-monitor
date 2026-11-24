'use strict';
// KurTest's names in one place, with the Test Monitor's old names still read, so machines set up
// before the rename keep working: KURTEST_* then TESTMONITOR_* variables, ~/.kurtest then ~/.test-monitor,
// .kurtest.json then .testmonitor.json.

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_PORT = 7357;
const CONFIG_FILES = ['.kurtest.json', '.testmonitor.json'];

// KURTEST_<name>, else TESTMONITOR_<old name or name>.
function env(name, oldName = name, e = process.env) {
  const v = e['KURTEST_' + name];
  if (v !== undefined && v !== '') return v;
  const o = e['TESTMONITOR_' + oldName];
  return o !== undefined && o !== '' ? o : undefined;
}

// This machine's KurTest folder: runs, token and config. ~/.kurtest, unless only the old folder exists.
function homeDir(home = os.homedir()) {
  const now = path.join(home, '.kurtest');
  const old = path.join(home, '.test-monitor');
  if (!fs.existsSync(now) && fs.existsSync(old)) return old;
  return now;
}

function readToken(dir) {
  try { return fs.readFileSync(path.join(dir, 'token'), 'utf8').trim(); } catch { return ''; }
}

// The nearest project settings file, from dir upwards.
function findProjectConfig(dir) {
  for (;;) {
    for (const name of CONFIG_FILES) {
      const f = path.join(dir, name);
      if (fs.existsSync(f)) return f;
    }
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

// The repository's name as its host spells it, from the URL of a git remote: https, ssh or scp-style.
function repoFromUrl(url) {
  const m = /([^/:]+?)(?:\.git)?\/*$/.exec(String(url || '').trim());
  return m ? m[1] : '';
}

// The project a run is filed under: --project, then KURTEST_PROJECT, then the `project` the chosen suites
// share (so one repo can hold suites for several projects), then the settings file's, then the git repository's name (from its origin remote, else its top folder), then the folder's name.
// The repository wins over the folder, so a clone in a scratch folder or with other capitals is still
// filed under the repo, the same way from every machine.
function projectName({ opt, config, suites = [], root, cwd = process.cwd(), e = process.env, git = gitInfo }) {
  const own = [...new Set(suites.map(s => s.project))];
  const shared = suites.length && own.length === 1 ? own[0] : '';
  const named = (opt && opt.project) || env('PROJECT', 'PROJECT', e) || shared || (config && config.project);
  if (named) return named;
  const g = git(root || cwd);
  return repoFromUrl(g.remote) || (g.top && path.basename(g.top)) || path.basename(root || cwd);
}

function gitInfo(dir) {
  const { execFileSync } = require('child_process');
  const out = args => {
    try { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).trim(); }
    catch { return ''; }
  };
  const top = out(['rev-parse', '--show-toplevel']);
  if (!top) return {};
  let remote = out(['remote', 'get-url', 'origin']);
  if (!remote) { const first = out(['remote']).split('\n')[0]; if (first) remote = out(['remote', 'get-url', first]); }
  return { top, remote };
}

module.exports = { env, homeDir, readToken, findProjectConfig, projectName, repoFromUrl, gitInfo, DEFAULT_PORT, CONFIG_FILES };

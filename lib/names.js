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

module.exports = { env, homeDir, readToken, findProjectConfig, DEFAULT_PORT, CONFIG_FILES };

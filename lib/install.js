'use strict';
// kurtest init claude [--url URL]
// Sets up this machine so Claude Code's test runs report to KurTest. Safe to run again.
//  - adds the PreToolUse hook to ~/.claude/settings.json (backing the file up first)
//  - adds the testing rule to ~/.claude/CLAUDE.md (following a symlink)
//  - saves KurTest's address in ~/.kurtest/config.json, if --url is given
//  - saves KURTEST_TOKEN from the environment to ~/.kurtest/token, if it's set
// Works the same on macOS, Windows and Linux (cloud sessions).

const fs = require('fs');
const os = require('os');
const path = require('path');

const N = require('./names');

const RULE_HEADING = '## Tests report to KurTest';
const OLD_RULE_HEADING = '## Tests report to the Test Monitor';
const HOOK = 'kurtest --claude-hook';

function rule() {
  // Git on Windows may check the file out with CRLF line endings.
  const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'claude-code.md'), 'utf8').replace(/\r+\n/g, '\n');
  const m = doc.match(/```markdown\n([\s\S]*?)\n```/);
  if (!m) throw new Error('rule text not found in docs/claude-code.md');
  return m[1];
}

function install({ home = os.homedir(), url, token = N.env('TOKEN'), log = console.log } = {}) {
  const claude = path.join(home, '.claude');
  const mine = N.homeDir(home);
  fs.mkdirSync(claude, { recursive: true });
  fs.mkdirSync(mine, { recursive: true });

  // 1. Hook
  const settingsFile = path.join(claude, 'settings.json');
  let settings = {};
  if (fs.existsSync(settingsFile)) {
    const raw = fs.readFileSync(settingsFile, 'utf8');
    try { settings = raw.trim() ? JSON.parse(raw) : {}; }
    catch (e) { throw new Error(`${settingsFile} isn't valid JSON, so it was left alone: ${e.message}`); }
  }
  settings.hooks = settings.hooks || {};
  settings.hooks.PreToolUse = settings.hooks.PreToolUse || [];
  const has = /(kurtest|testwatch) --claude-hook/.test(JSON.stringify(settings.hooks.PreToolUse));
  if (has) log('✓ Hook already in ' + settingsFile);
  else {
    if (fs.existsSync(settingsFile)) fs.copyFileSync(settingsFile, settingsFile + '.bak-kurtest');
    settings.hooks.PreToolUse.push({ matcher: 'Bash', hooks: [{ type: 'command', command: HOOK }] });
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n');
    log('✓ Hook added to ' + settingsFile);
  }

  // 2. Rule
  let rulesFile = path.join(claude, 'CLAUDE.md');
  try { rulesFile = fs.realpathSync(rulesFile); } catch {}
  const current = fs.existsSync(rulesFile) ? fs.readFileSync(rulesFile, 'utf8') : '';
  if (current.includes(RULE_HEADING) || current.includes(OLD_RULE_HEADING)) log('✓ Rule already in ' + rulesFile);
  else {
    if (current) fs.copyFileSync(rulesFile, rulesFile + '.bak-kurtest');
    fs.writeFileSync(rulesFile, current + (current && !current.endsWith('\n') ? '\n' : '') + (current ? '\n' : '') + rule() + '\n');
    log('✓ Rule added to ' + rulesFile);
  }

  // 3. Where runs go
  if (url) {
    const cfgFile = path.join(mine, 'config.json');
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8')); } catch {}
    cfg.url = url;
    fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + '\n');
    log('✓ Runs go to ' + url);
  }
  if (token) {
    const tokenFile = path.join(mine, 'token');
    fs.writeFileSync(tokenFile, token.trim() + '\n', { mode: 0o600 });
    log('✓ Token saved to ' + tokenFile);
  } else if (!fs.existsSync(path.join(mine, 'token'))) {
    log('! No token yet: set KURTEST_TOKEN, or put it in ' + path.join(mine, 'token') + ' (`kurtest token` prints it on the machine running KurTest)');
  }
}

module.exports = { install, RULE_HEADING, HOOK };

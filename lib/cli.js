'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const N = require('./names');

const HELP = `KurTest: a live page for your test runs.

  kurtest -- <test command>          run tests and watch them live (starts KurTest if it isn't running)
  kurtest [suite ...]                run the suites in this project's .kurtest.json
  kurtest serve [--host H] [--port P] [--lan-view] [--data DIR] [--open]
                                     run KurTest in this terminal
  kurtest service install [serve options] | remove | status
                                     start KurTest when you log in
  kurtest stop                       stop a KurTest running in the background
  kurtest token                      print the token and a sign-in link for other devices
  kurtest init claude [--url URL]    make Claude Code's test runs report to KurTest

Docs: https://github.com/KVachon/kurtest`;

async function main(argv, me = 'kurtest') {
  const [cmd, ...rest] = argv;
  const flagValue = name => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  switch (cmd) {
    case 'help': case '--help': case '-h':
      return console.log(HELP);
    case '--version': case '-v': case 'version':
      return console.log(require('../package.json').version);
    case 'serve':
      return require('./serve').serve(rest);
    case 'service':
      return require('./service').service(rest);
    case 'stop': {
      const dataDir = path.resolve(N.env('DATA') || N.homeDir());
      if (require('./service').stopServer(dataDir)) console.log('✓ Stopped KurTest');
      else console.log('KurTest isn\'t running in the background here');
      return;
    }
    case 'token': {
      const dataDir = path.resolve(N.env('DATA') || N.homeDir());
      const token = N.env('TOKEN') || N.readToken(dataDir);
      if (!token) { console.error('No token yet. Start KurTest once (kurtest serve) and it makes one.'); process.exitCode = 1; return; }
      const port = N.env('PORT') || N.DEFAULT_PORT;
      console.log(token);
      console.error(`\nSenders use it as KURTEST_TOKEN. To sign in from another device, open once:\n  http://${os.hostname()}:${port}/?token=${token}`);
      return;
    }
    case 'init':
      if (rest[0] !== 'claude') { console.error('kurtest init claude [--url URL]'); process.exitCode = 2; return; }
      return initClaude(flagValue('--url'));
    case '--install-claude': // the old spelling
      return initClaude(flagValue('--url'));
    case '--claude-hook':
      return require('./hook').runHook();
    default:
      return require('./run').run(argv, { me });
  }
}

function initClaude(url) {
  try { require('./install').install({ url }); }
  catch (e) { console.error('kurtest: ' + e.message); process.exitCode = 1; }
}

module.exports = { main, HELP };

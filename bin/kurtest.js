#!/usr/bin/env node
'use strict';
// KurTest: a live page for your test runs.
//
//   kurtest -- <test command>     run tests and watch them live (starts KurTest if it isn't running)
//   kurtest [suite ...]           run the suites in this project's .kurtest.json
//   kurtest serve [options]       run KurTest in this terminal (see lib/serve.js)
//   kurtest service install|remove|status   start KurTest when you log in
//   kurtest stop                  stop a KurTest running in the background
//   kurtest token                 print the token and a sign-in link for other devices
//   kurtest init claude [--url URL]   make Claude Code's test runs report here

const { main } = require('../lib/cli');
main(process.argv.slice(2), 'kurtest');

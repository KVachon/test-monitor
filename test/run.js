'use strict';
// Runs every test/*.test.js with Node's test runner, the same way on every Node version and OS.
// Extra arguments go to node --test, e.g. `node test/run.js --test-reporter=tap`.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort().map(f => path.join(__dirname, f));
const r = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...files], { stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);

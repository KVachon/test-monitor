'use strict';
// Playwright reporter for KurTest. Add it next to your usual reporter:
//
//   reporter: [['list'], ['kurtest/playwright']]          (with kurtest in devDependencies)
//   reporter: [['list'], ['/path/to/kurtest/reporters/playwright.cjs']]
//
// It prints @@kurtest lines only when the tests run under kurtest, and is silent otherwise.
// Groups are spec files; ids are the file plus the test's title path, so they stay stable.

const path = require('path');

const MARKER = '@@kurtest ';
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const humanize = s => { const t = s.replace(/[-_.]+/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };
const firstLine = s => String(s || '').replace(/\u001b\[[0-9;]*m/g, '').split('\n').map(l => l.trim()).find(Boolean) || '';

class KurTestReporter {
  constructor(options = {}) {
    this.on = !!(process.env.KURTEST || process.env.TESTMONITOR);
    this.suite = process.env.KURTEST_SUITE || process.env.TESTMONITOR_SUITE || options.suite || 'playwright';
    this.ms = new Map();
  }

  out(ev) {
    if (this.on) process.stdout.write(MARKER + JSON.stringify({ suite: this.suite, ...ev }) + '\n');
  }

  info(test) {
    const file = path.basename(test.location.file).replace(/\.(spec|test)\.[cm]?[jt]sx?$/, '');
    // titlePath is ['', project, file, ...describes, title]; keep the part after the file.
    const tp = test.titlePath();
    const fi = tp.findIndex(p => p && p.endsWith(path.basename(test.location.file)));
    const rest = fi >= 0 ? tp.slice(fi + 1) : [test.title];
    const project = test.parent && test.parent.project && test.parent.project();
    const pname = project && project.name ? project.name : '';
    return {
      id: slug([pname, file, ...rest].filter(Boolean).join(' ')),
      group: humanize(file),
      desc: rest.join(' › '),
    };
  }

  onBegin(config, suite) {
    this.out({ type: 'suite-start', tests: suite.allTests().map(t => this.info(t)) });
  }

  onTestBegin(test, result) {
    if (result.retry === 0) this.out({ type: 'test-start', ...this.info(test) });
  }

  onTestEnd(test, result) {
    const ms = (this.ms.get(test) || 0) + result.duration;
    this.ms.set(test, ms);
    const final = result.status === 'passed' || result.status === 'skipped' || result.retry >= test.retries;
    if (!final) return;
    const outcome = test.outcome();
    const status = outcome === 'expected' ? (result.status === 'skipped' ? 'skip' : 'pass')
      : outcome === 'flaky' ? 'flaky'
      : outcome === 'skipped' ? 'skip'
      : 'fail';
    const ev = { type: 'test-end', ...this.info(test), status, ms };
    if (status === 'fail') ev.reason = firstLine(result.error && result.error.message) || result.status;
    if (status === 'flaky') ev.reason = `failed ${result.retry === 1 ? 'once' : result.retry + ' times'}, passed on retry`;
    if (status === 'skip') { const a = test.annotations.find(x => x.type === 'skip' || x.type === 'fixme'); if (a && a.description) ev.reason = a.description; }
    this.out(ev);
  }

  printsToStdio() { return false; }
}

module.exports = KurTestReporter;

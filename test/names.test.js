'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const N = require('../lib/names');

test.describe('names', () => {
  test('KURTEST_ variables win, and the old TESTMONITOR_ ones still work', () => {
    assert.strictEqual(N.env('URL', 'URL', { KURTEST_URL: 'a', TESTMONITOR_URL: 'b' }), 'a');
    assert.strictEqual(N.env('URL', 'URL', { TESTMONITOR_URL: 'b' }), 'b');
    assert.strictEqual(N.env('HOST', 'BIND', { TESTMONITOR_BIND: '0.0.0.0' }), '0.0.0.0');
    assert.strictEqual(N.env('URL', 'URL', { KURTEST_URL: '' }), undefined);
  });

  test('the old ~/.test-monitor folder is used until ~/.kurtest exists', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-home-'));
    try {
      assert.strictEqual(N.homeDir(home), path.join(home, '.kurtest'));
      fs.mkdirSync(path.join(home, '.test-monitor'));
      assert.strictEqual(N.homeDir(home), path.join(home, '.test-monitor'));
      fs.mkdirSync(path.join(home, '.kurtest'));
      assert.strictEqual(N.homeDir(home), path.join(home, '.kurtest'));
    } finally { fs.rmSync(home, { recursive: true, force: true }); }
  });

  test('.kurtest.json is found before .testmonitor.json, searching upwards', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-proj-'));
    try {
      const sub = path.join(dir, 'a', 'b');
      fs.mkdirSync(sub, { recursive: true });
      fs.writeFileSync(path.join(dir, '.testmonitor.json'), '{}');
      assert.strictEqual(N.findProjectConfig(sub), path.join(dir, '.testmonitor.json'));
      fs.writeFileSync(path.join(dir, '.kurtest.json'), '{}');
      assert.strictEqual(N.findProjectConfig(sub), path.join(dir, '.kurtest.json'));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

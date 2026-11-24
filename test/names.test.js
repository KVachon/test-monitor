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

  test('a repository name is read from any remote URL', () => {
    for (const u of ['https://github.com/KVachon/Thread-Monitor.git', 'git@github.com:KVachon/Thread-Monitor.git',
      'ssh://git@github.com/KVachon/Thread-Monitor', 'https://github.com/KVachon/Thread-Monitor/', 'http://local_proxy@127.0.0.1:5/git/KVachon/Thread-Monitor'])
      assert.strictEqual(N.repoFromUrl(u), 'Thread-Monitor', u);
    assert.strictEqual(N.repoFromUrl(''), '');
  });

  test('the project is --project, KURTEST_PROJECT, the settings file, the repo, then the folder', () => {
    const git = () => ({ top: '/x/scratchpad', remote: 'https://github.com/KVachon/smart-home.git' });
    const none = () => ({});
    assert.strictEqual(N.projectName({ opt: { project: 'a' }, config: { project: 'b' }, e: { KURTEST_PROJECT: 'c' }, git }), 'a');
    assert.strictEqual(N.projectName({ opt: {}, config: { project: 'b' }, e: { KURTEST_PROJECT: 'c' }, git }), 'c');
    assert.strictEqual(N.projectName({ opt: {}, config: { project: 'b' }, e: {}, git }), 'b');
    assert.strictEqual(N.projectName({ opt: {}, config: {}, cwd: '/x/scratchpad/tests', e: {}, git }), 'smart-home');
    assert.strictEqual(N.projectName({ opt: {}, config: {}, cwd: '/x/y', e: {}, git: () => ({ top: '/x/My-Repo' }) }), 'My-Repo');
    assert.strictEqual(N.projectName({ opt: {}, config: {}, cwd: '/x/y', e: {}, git: none }), 'y');
  });

  test('a real git checkout is named after its origin remote, not its folder', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-git-'));
    try {
      const { execFileSync } = require('child_process');
      execFileSync('git', ['init', '-q', dir]);
      execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', 'git@github.com:KVachon/Real-Name.git']);
      fs.mkdirSync(path.join(dir, 'sub'));
      assert.strictEqual(N.projectName({ opt: {}, config: {}, cwd: path.join(dir, 'sub'), e: {} }), 'Real-Name');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

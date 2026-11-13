'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createReader, parseMarker, isMarkerStart } = require('../lib/readers');
const { normalize } = require('../lib/events');

const feed = (r, text) => text.split('\n').flatMap(l => r.line(l + '\n')).concat(r.end());


test.describe('readers', () => {
test('marker lines parse, under either name, and other lines do not', () => {
  assert.deepStrictEqual(parseMarker('@@kurtest {"type":"test-end","id":"a"}\n'), { type: 'test-end', id: 'a' });
  assert.deepStrictEqual(parseMarker('  @@kurtest {"type":"test-end","id":"a"}\n'), { type: 'test-end', id: 'a' });
  assert.deepStrictEqual(parseMarker('@@testmonitor {"type":"test-end","id":"a"}\n'), { type: 'test-end', id: 'a' });
  assert.strictEqual(parseMarker('ok @@kurtest {}'), null);
  assert.ok(isMarkerStart('@@kur') && isMarkerStart('@@testm') && isMarkerStart('@@kurtest {"ty'));
  assert.ok(!isMarkerStart('ok 1 - a') && !isMarkerStart('@@other'));
  assert.strictEqual(parseMarker('ok @@testmonitor {}'), null);
  assert.strictEqual(parseMarker('@@testmonitor {broken'), null);
});

test('TAP with nested subtests, a skip and a failure reason', () => {
  const evs = feed(createReader('tap', { label: 'node' }), [
    'TAP version 13',
    '# Subtest: math',
    '    # Subtest: adds',
    '    ok 1 - adds',
    '    # Subtest: divides',
    '    not ok 2 - divides',
    '      ---',
    "      message: 'expected 2, got 3'",
    '      ...',
    '    ok 3 - rounds # SKIP not yet',
    '    1..3',
    'not ok 1 - math',
    'ok 2 - standalone',
    '1..2',
  ].join('\n'));
  assert.deepStrictEqual(evs.map(e => [e.id, e.group, e.status, e.reason]), [
    ['math-adds', 'math', 'pass', undefined],
    ['math-divides', 'math', 'fail', 'expected 2, got 3'],
    ['math-rounds', 'math', 'skip', 'not yet'],
    ['standalone', 'node', 'pass', undefined],
  ]);
});

test('pattern rules for a one-line-per-test runner', () => {
  const r = createReader('pattern', {
    rules: [
      { match: '^pass\\s+(?<id>\\S+)\\s+(?<desc>.*)$', status: 'pass' },
      { match: '^FAIL\\s+(?<id>\\S+)\\s+(?<reason>.*)$', status: 'fail' },
    ],
    group: { match: '^([a-z]+\\d+)-', upper: true },
    groupNames: { F17: 'Uploads' },
  });
  const evs = feed(r, 'setup...\npass  f17-zip-ok  Accepts a small zip\nFAIL  f17-zip-cap  expected status 413, got 200');
  assert.deepStrictEqual(evs, [
    { type: 'test-end', id: 'f17-zip-ok', group: 'F17', status: 'pass', groupName: 'Uploads', desc: 'Accepts a small zip' },
    { type: 'test-end', id: 'f17-zip-cap', group: 'F17', status: 'fail', groupName: 'Uploads', reason: 'expected status 413, got 200' },
  ]);
});

test('normalize rejects bad events and trims good ones', () => {
  assert.throws(() => normalize({ type: 'test-end', run: 'r1', suite: 's', id: 'a', status: 'maybe' }));
  assert.throws(() => normalize({ type: 'nope', run: 'r1' }));
  assert.throws(() => normalize({ type: 'run-start', run: '../etc' }));
  assert.deepStrictEqual(normalize({ type: 'test-end', run: 'r1', suite: 's', id: 'a', status: 'pass', extra: 1, desc: ' hi\n' }),
    { type: 'test-end', run: 'r1', suite: 's', id: 'a', status: 'pass', desc: 'hi' });
});
});

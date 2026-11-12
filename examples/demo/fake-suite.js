#!/usr/bin/env node
'use strict';
// A pretend test suite for trying the monitor. It prints @@testmonitor lines (the "marker" reader)
// or TAP, with a few failures and a flaky test, at a speed you choose.
//
//   node fake-suite.js markers [speed]   speed 1 is real time (about 6 minutes); the default is 20
//   node fake-suite.js tap [speed]

const mode = process.argv[2] || 'markers';
const speed = Number(process.argv[3] || process.env.DEMO_SPEED || 20);
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const sleep = ms => new Promise(r => setTimeout(r, ms / speed));
const say = ev => process.stdout.write('@@testmonitor ' + JSON.stringify(ev) + '\n');

const features = ['Sign in', 'Profile', 'Directory', 'Events', 'Uploads', 'Search', 'Payments', 'Reports', 'Admin', 'Email', 'Exports', 'Settings'];
const words = ['shows', 'rejects', 'saves', 'lists', 'hides', 'sorts', 'escapes', 'limits', 'redirects', 'keeps'];
const things = ['the empty state', 'a long name', 'a bad token', 'the next page', 'a zip over the cap', 'quoted text', 'an old link', 'the summary', 'a duplicate', 'the menu'];

if (mode === 'markers') {
  const tests = [];
  features.forEach((name, f) => {
    const n = 6 + Math.floor(rnd() * 40);
    for (let i = 0; i < n; i++) tests.push({ id: `f${f + 1}-${i + 1}-${words[i % 10]}-${things[(i * 3 + f) % 10]}`.replace(/\s+/g, '-'), group: `F${f + 1}`, groupName: name, desc: `${words[i % 10][0].toUpperCase() + words[i % 10].slice(1)} ${things[(i * 3 + f) % 10]}` });
  });
  const fails = { 23: 'expected status 413, got 200', 97: "body has 'Covers the' nowhere", 180: 'expected 6 pills, found 5' };
  (async () => {
    say({ type: 'suite-start', tests });
    for (let i = 0; i < tests.length; i++) {
      const t = tests[i];
      say({ type: 'test-start', id: t.id, group: t.group });
      process.stdout.write(`… ${t.id}`);
      const ms = 150 + rnd() * rnd() * 1800;
      await sleep(ms);
      const status = fails[i] ? 'fail' : i === 140 ? 'flaky' : i === 60 ? 'skip' : 'pass';
      process.stdout.write(`\r${status === 'fail' ? 'FAIL' : status.padEnd(4)}  ${t.id}\n`);
      say({ type: 'test-end', id: t.id, group: t.group, status, ms: Math.round(ms / speed), reason: fails[i] || (status === 'flaky' ? 'timed out once, passed on retry' : status === 'skip' ? 'needs a mail server' : undefined) });
    }
    process.exit(Object.keys(fails).length ? 1 : 0);
  })();
} else {
  const files = ['home', 'search', 'checkout', 'account', 'staff-requests'];
  (async () => {
    console.log('TAP version 13');
    let n = 0, bad = 0;
    for (const f of files) {
      console.log(`# Subtest: ${f}`);
      const k = 3 + Math.floor(rnd() * 8);
      for (let i = 0; i < k; i++) {
        await sleep(1500 + rnd() * 5000);
        const fail = f === 'checkout' && i === 2;
        bad += fail;
        console.log(`    ${fail ? 'not ok' : 'ok'} ${i + 1} - ${words[(i + n) % 10]} ${things[(i * 7 + n) % 10]}`);
        if (fail) console.log("    ---\n    message: 'expected 6 pills, found 5'\n    ...");
      }
      console.log(`    1..${k}`);
      console.log(`${bad && f === 'checkout' ? 'not ok' : 'ok'} ${++n} - ${f}`);
    }
    console.log(`1..${n}`);
    process.exit(bad ? 1 : 0);
  })();
}

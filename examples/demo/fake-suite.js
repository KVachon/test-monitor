#!/usr/bin/env node
'use strict';
// A pretend test suite for trying the monitor. It prints @@kurtest lines (the "marker" reader)
// or TAP, with a few failures and a flaky test, at a speed you choose.
//
//   node fake-suite.js markers [speed]   speed 1 is real time (about 6 minutes); the default is 20
//   node fake-suite.js tap [speed]

const mode = process.argv[2] || 'markers';
const speed = Number(process.argv[3] || process.env.DEMO_SPEED || 20);
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const sleep = ms => new Promise(r => setTimeout(r, ms / speed));
const say = ev => process.stdout.write('@@kurtest ' + JSON.stringify(ev) + '\n');

const features = ['Sign in', 'Profile', 'Directory', 'Events', 'Uploads', 'Search', 'Payments', 'Reports', 'Admin', 'Email', 'Exports', 'Settings'];
const words = ['shows', 'rejects', 'saves', 'lists', 'hides', 'sorts', 'escapes', 'limits', 'redirects', 'keeps'];
const things = ['the empty state', 'a long name', 'a bad token', 'the next page', 'a zip over the cap', 'quoted text', 'an old link', 'the summary', 'a duplicate', 'the menu'];

if (mode === 'markers') {
  const tests = [];
  // Real suites don't run at one pace: some features are quick unit checks, others hit the database or
  // render pages, and each group pays a setup cost first. So each group gets its own speed.
  const pace = {};
  features.forEach((name, f) => {
    pace[`F${f + 1}`] = [0.2, 0.5, 1, 2.2, 0.35, 3, 0.8, 1.6, 0.25, 2.6, 0.6, 1.2][f];
    const n = 6 + Math.floor(rnd() * 40);
    for (let i = 0; i < n; i++) tests.push({ id: `f${f + 1}-${i + 1}-${words[i % 10]}-${things[(i * 3 + f) % 10]}`.replace(/\s+/g, '-'), group: `F${f + 1}`, groupName: name, desc: `${words[i % 10][0].toUpperCase() + words[i % 10].slice(1)} ${things[(i * 3 + f) % 10]}` });
  });
  const fails = { 23: 'expected status 413, got 200', 97: "body has 'Covers the' nowhere", 180: 'expected 6 pills, found 5' };
  (async () => {
    say({ type: 'suite-start', tests });
    let failed = 0;
    for (let i = 0; i < tests.length; i++) {
      const t = tests[i];
      say({ type: 'test-start', id: t.id, group: t.group });
      process.stdout.write(`… ${t.id}`);
      // DEMO_RUN=n makes runs differ like real ones: timings wobble, a flaky test fails now and then, one
      // failure gets fixed at run 6, a new one appears at run 9, and F6 gets slower from run 8.
      const k = process.env.DEMO_RUN ? Number(process.env.DEMO_RUN) : null, wob = k == null ? 1 : 0.75 + Math.random() * 0.5;
      const ms = wob * (k != null && k >= 8 && t.group === 'F6' ? 1.8 : 1) * ((150 + rnd() * rnd() * 1800) * pace[t.group] + (i === 0 || tests[i - 1].group !== t.group ? 2500 + rnd() * 3000 : 0));
      await sleep(ms);
      let fail = fails[i];
      if (k != null) { if (i === 97 && k >= 6) fail = null; if (i === 180 && k < 9) fail = null; if (i === 23 && Math.random() < .3) fail = null; if (i === 200 && Math.random() < .25) fail = 'timed out after 5000ms'; }
      if (fail) failed++;
      const status = fail ? 'fail' : i === 140 && (k == null || Math.random() < .4) ? 'flaky' : i === 60 ? 'skip' : 'pass';
      process.stdout.write(`\r${status === 'fail' ? 'FAIL' : status.padEnd(4)}  ${t.id}\n`);
      say({ type: 'test-end', id: t.id, group: t.group, status, ms: Math.round(ms / speed), reason: fail || (status === 'flaky' ? 'timed out once, passed on retry' : status === 'skip' ? 'needs a mail server' : undefined) });
    }
    process.exit(failed ? 1 : 0);
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
        await sleep((1500 + rnd() * 5000) * [0.5, 1.4, 2.5, 0.8, 1.2][files.indexOf(f)]);
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

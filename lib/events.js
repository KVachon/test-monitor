'use strict';
// Validates and cleans one event in the shared format (docs/convention.md).

const TYPES = new Set(['run-start', 'suite-start', 'test-start', 'test-end', 'suite-end', 'run-end']);
const STATUSES = new Set(['pass', 'fail', 'skip', 'flaky']);
const RUN_STATUSES = new Set(['pass', 'fail', 'stopped']);
const RUN_ID = /^[A-Za-z0-9._:-]{1,120}$/;
const MAX_PLAN = 50000;

function str(v, max) {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string' && typeof v !== 'number') return undefined;
  const s = String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  return s ? s.slice(0, max) : undefined;
}

function testFields(src, out) {
  const id = str(src.id, 300);
  if (!id) throw new Error('test id is required');
  out.id = id;
  const group = str(src.group, 120);
  if (group) out.group = group;
  const groupName = str(src.groupName, 120);
  if (groupName) out.groupName = groupName;
  const desc = str(src.desc, 500);
  if (desc) out.desc = desc;
  return out;
}

function normalize(ev) {
  if (!ev || typeof ev !== 'object' || Array.isArray(ev)) throw new Error('event must be an object');
  if (!TYPES.has(ev.type)) throw new Error(`unknown event type: ${String(ev.type).slice(0, 40)}`);
  if (typeof ev.run !== 'string' || !RUN_ID.test(ev.run)) throw new Error('run must be 1-120 characters of A-Z a-z 0-9 . _ : -');
  const out = { type: ev.type, run: ev.run };
  if (typeof ev.at === 'number' && Number.isFinite(ev.at)) out.at = ev.at;

  if (ev.type === 'run-start') {
    for (const k of ['project', 'command', 'host']) { const v = str(ev[k], 300); if (v) out[k] = v; }
    return out;
  }
  if (ev.type === 'run-end') {
    if (ev.status !== undefined) {
      if (!RUN_STATUSES.has(ev.status)) throw new Error('run-end status must be pass, fail or stopped');
      out.status = ev.status;
    }
    return out;
  }

  const suite = str(ev.suite, 100);
  if (!suite) throw new Error('suite is required');
  out.suite = suite;

  if (ev.type === 'suite-start') {
    const label = str(ev.label, 200); if (label) out.label = label;
    const command = str(ev.command, 300); if (command) out.command = command;
    if (ev.tests !== undefined) {
      if (!Array.isArray(ev.tests) || ev.tests.length > MAX_PLAN) throw new Error(`tests must be an array of at most ${MAX_PLAN}`);
      out.tests = ev.tests.map(t => testFields(t || {}, {}));
    }
    return out;
  }
  if (ev.type === 'suite-end') return out;

  testFields(ev, out);
  if (ev.type === 'test-end') {
    if (!STATUSES.has(ev.status)) throw new Error('status must be pass, fail, skip or flaky');
    out.status = ev.status;
    const reason = str(ev.reason, 2000); if (reason) out.reason = reason;
    if (typeof ev.ms === 'number' && Number.isFinite(ev.ms) && ev.ms >= 0) out.ms = Math.round(ev.ms);
  }
  return out;
}

module.exports = { normalize, TYPES, STATUSES };

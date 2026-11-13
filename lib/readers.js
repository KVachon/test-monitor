'use strict';
// Turn a test command's output, line by line, into events (without run/at; kurtest adds those).

// Reporters print `@@kurtest {json}` lines; the old `@@testmonitor {json}` works too.
const MARKER = '@@kurtest ';
const MARKERS = [MARKER, '@@testmonitor '];
const ANSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]/g;

const stripAnsi = s => s.replace(ANSI, '');
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 200) || 'test';

function parseMarker(line) {
  const head = line.trimStart();
  const mark = MARKERS.find(m => head.startsWith(m));
  if (!mark) return null;
  try {
    const ev = JSON.parse(head.slice(mark.length));
    return ev && typeof ev === 'object' ? ev : null;
  } catch { return null; }
}

// TAP 13/14, including the nested subtests Node's test runner prints.
function tapReader(opts = {}) {
  const fallbackGroup = opts.label || 'Tests';
  let stack = [];      // [{indent, name}] from "# Subtest:" lines
  let pending = null;  // a failing test waiting for its YAML block
  let yaml = null;
  const out = [];

  const emitPending = () => {
    if (pending) { out.push(pending); pending = null; }
    yaml = null;
  };

  function line(raw) {
    const l = stripAnsi(raw).replace(/\r?\n$/, '');
    if (yaml) {
      if (/^\s*\.\.\.\s*$/.test(l)) { emitPending(); return flush(); }
      // Node's runner says which file a test is in and how long it took.
      const loc = l.match(/^\s*location:\s*['"]?(.*?)(?::\d+:\d+)?['"]?\s*$/);
      if (loc && pending && pending.group === fallbackGroup && !pending.nested) {
        const base = loc[1].split(/[\\/]/).pop().replace(/\.(test|spec)\.[cm]?[jt]sx?$|\.[cm]?[jt]sx?$/, '');
        if (base) { pending.group = base; pending.id = slug(base + ' ' + pending.desc); }
        return flush();
      }
      const dur = l.match(/^\s*duration_ms:\s*([\d.]+)/);
      if (dur && pending) { pending.ms = Math.round(Number(dur[1])); return flush(); }
      const m = pending && pending.status !== 'pass' && l.match(/^\s*(?:message|error|reason):\s*(.*)$/);
      if (m && pending && !pending.reason) {
        let r = m[1].replace(/^['"|>-]+\s*|['"]$/g, '').trim();
        if (r) pending.reason = r.slice(0, 500);
        else yaml.want = true;
      } else if (yaml.want && pending && !pending.reason && l.trim()) {
        pending.reason = l.trim().replace(/^['"]|['"]$/g, '').slice(0, 500);
        yaml.want = false;
      }
      return flush();
    }
    if (/^\s*---\s*$/.test(l) && pending) { yaml = {}; return flush(); }

    const indent = l.match(/^\s*/)[0].length;
    const sub = l.match(/^\s*# Subtest: (.+)$/);
    if (sub) {
      emitPending();
      stack = stack.filter(s => s.indent < indent);
      stack.push({ indent, name: sub[1].trim(), kids: false });
      return flush();
    }
    const m = l.match(/^\s*(not ok|ok)\b\s*(\d+)?\s*(?:-\s*)?(.*)$/);
    if (!m) return flush();
    emitPending();
    let [, ok, , rest] = m;
    let directive = '';
    const hash = rest.match(/^(.*?)\s+#\s+(SKIP|TODO)\b\s*(.*)$/i);
    if (hash) { rest = hash[1]; directive = hash[2].toUpperCase(); var dirReason = hash[3].trim(); }
    const name = rest.trim() || `test ${m[2] || ''}`.trim();

    // An ok line closes the subtest at its own indent. If that subtest had children, it was a group, not a test.
    const own = stack.findIndex(s => s.indent === indent && s.name === name);
    if (own >= 0) {
      const had = stack.some((s, i) => i > own) || stack[own].kids;
      stack = stack.slice(0, own);
      if (had) return flush();
    }
    const parents = stack.filter(s => s.indent < indent);
    parents.forEach(p => { p.kids = true; });
    const group = parents.length ? parents[0].name : fallbackGroup;
    const path = parents.map(p => p.name).concat(name);
    const ev = { type: 'test-end', id: slug(path.join(' ')), group, desc: name };
    if (parents.length) Object.defineProperty(ev, 'nested', { value: true });
    if (directive === 'SKIP' || directive === 'TODO') {
      ev.status = 'skip';
      if (dirReason) ev.reason = dirReason;
    } else {
      ev.status = ok === 'ok' ? 'pass' : 'fail';
    }
    // Held until the next line, in case a YAML block with details follows.
    pending = ev;
    return flush();
  }
  function flush() { return out.splice(0); }
  function end() { emitPending(); return flush(); }
  return { line, end, detect: l => /^\s*(TAP version \d+|(not )?ok \d+\b)/.test(stripAnsi(l)) };
}

// Regex rules from .kurtest.json, for runners that print one line per test.
function patternReader(opts = {}) {
  const rules = (opts.rules || []).map(r => ({ re: new RegExp(r.match), status: r.status }));
  if (!rules.length) throw new Error('the pattern reader needs "rules" in .kurtest.json');
  const g = opts.group || {};
  const groupRe = g.match ? new RegExp(g.match) : null;
  const names = opts.groupNames || {};
  function line(raw) {
    const l = stripAnsi(raw).replace(/\r?\n$/, '');
    for (const r of rules) {
      const m = l.match(r.re);
      if (!m) continue;
      const k = m.groups || {};
      const id = (k.id || '').trim();
      if (!id) return [];
      let group = k.group;
      if (!group && groupRe) { const gm = id.match(groupRe); if (gm) group = gm[1] || gm[0]; }
      if (group && g.upper) group = group.toUpperCase();
      group = group || opts.label || 'Tests';
      const ev = { type: 'test-end', id, group, status: r.status };
      if (names[group]) ev.groupName = names[group];
      if (k.desc && k.desc.trim()) ev.desc = k.desc.trim();
      if (k.reason && k.reason.trim()) ev.reason = k.reason.trim();
      return [ev];
    }
    return [];
  }
  return { line, end: () => [] };
}

function createReader(kind, opts) {
  if (kind === 'tap') return tapReader(opts);
  if (kind === 'pattern') return patternReader(opts);
  if (kind === 'marker' || kind === 'none') return { line: () => [], end: () => [] };
  if (kind === 'auto' || !kind) {
    // Marker lines are always read; TAP switches on the first time a TAP line shows up.
    let tap = null;
    return {
      line(l) {
        if (!tap) { const t = tapReader(opts); if (t.detect(l)) tap = t; else return []; }
        return tap.line(l);
      },
      end: () => (tap ? tap.end() : []),
    };
  }
  throw new Error(`unknown reader: ${kind}`);
}

// Could this (trimmed) partial line still turn out to be a marker line? Then it waits for the rest.
const isMarkerStart = head => MARKERS.some(m => m.startsWith(head.slice(0, m.length)) || head.startsWith(m));

module.exports = { createReader, parseMarker, isMarkerStart, stripAnsi, slug, MARKER };

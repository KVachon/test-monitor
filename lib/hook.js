'use strict';
// Claude Code PreToolUse hook: when Claude is about to run tests without testwatch, stop that one call
// and tell Claude to run it through testwatch instead. The rerun goes through the normal permission
// rules, so the hook never approves anything by itself.
//
// In ~/.claude/settings.json:
//   "hooks": { "PreToolUse": [ { "matcher": "Bash", "hooks": [ { "type": "command", "command": "testwatch --claude-hook" } ] } ] }

// Commands that run a test suite. Kept specific, so builds and installs are never caught.
const TEST_COMMANDS = [
  /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b/,
  /\b(npx\s+|pnpm\s+exec\s+|yarn\s+)?playwright\s+test\b/,
  /\b(npx\s+)?(vitest|jest|mocha|ava)\b(?!\s+--version)/,
  /\bnode\s+(--[\w-]+\s+)*--test\b/,
  /\b(python3?\s+-m\s+)?pytest\b/,
  /\b(vendor\/bin\/)?(phpunit|pest)\b/,
  /\bgo\s+test\b/,
  /\bcargo\s+test\b/,
  /\bdotnet\s+test\b/,
  /(^|[\s;&|(])(\.\/|bash\s+|sh\s+)?(tests?|spec)\/[\w.-]*\.(sh|bat|cmd|ps1)\b/,
];

function decide(input) {
  if (!input || input.tool_name !== 'Bash') return null;
  const cmd = String((input.tool_input && input.tool_input.command) || '');
  if (!cmd || /\btestwatch\b/.test(cmd) || process.env.TESTMONITOR_RUN || /\bTESTWATCH_HOOK=off\b/.test(cmd)) return null;
  // Only the part before a pipe to a pager or filter matters; a grep for "pytest" isn't a test run.
  if (/^\s*(git|grep|rg|cat|less|head|tail|echo|ls|find|sed|awk)\b/.test(cmd)) return null;
  if (!TEST_COMMANDS.some(re => re.test(cmd))) return null;
  const wrapped = `testwatch -- ${cmd}`;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        'Test runs go through testwatch so they show live on the Test Monitor (see the testing rule in CLAUDE.md). ' +
        `Run the same command as: ${wrapped}  ` +
        '(for several suites in one project, `testwatch` alone runs everything in .testmonitor.json). ' +
        'testwatch keeps the output and exit code, and the tests still run if the monitor is down. ' +
        'To skip it for one command, start the command with TESTWATCH_HOOK=off.',
    },
  };
}

function runHook() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', c => { raw += c; });
  process.stdin.on('end', () => {
    let out = null;
    try { out = decide(JSON.parse(raw)); } catch { out = null; }
    if (out) process.stdout.write(JSON.stringify(out));
    process.exit(0);
  });
}

module.exports = { decide, runHook };

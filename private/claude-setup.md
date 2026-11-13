# Making it the default for Claude

On every machine where Claude runs tests (the Mac mini, KurtPC, and cloud sessions through their setup script).

## The quick way

```sh
npm install -g github:KVachon/test-monitor
testwatch --install-claude --url https://tests.kvach.co
```

That adds the hook and the rule below, and saves where runs go. Set `TESTMONITOR_TOKEN` before running it, and it saves the token too (in `~/.test-monitor/token`). At home, `--url http://192.168.86.20:7357` skips the tunnel. It's safe to run again.

The steps it does, by hand:

## 1. Install testwatch

```sh
npm install -g github:KVachon/test-monitor
```

This puts `testwatch` (and `test-monitor`) on the PATH.

## 2. The hook

In `~/.claude/settings.json` (on Windows, `%USERPROFILE%\.claude\settings.json`), add:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [ { "type": "command", "command": "testwatch --claude-hook" } ] }
    ]
  }
}
```

When Claude is about to run a test command (npm test, Playwright, Vitest, Jest, pytest, PHPUnit, go test, `tests/*.sh` and so on) without testwatch, the hook stops that call and tells Claude to rerun it as `testwatch -- <same command>`. The rerun goes through the usual permission rules; the hook never approves anything. Starting a command with `TESTWATCH_HOOK=off` skips it once.

## 3. The rule in CLAUDE.md

Add this to the global `~/.claude/CLAUDE.md`:

```markdown
## Tests report to the Test Monitor

Whenever you write or run tests, in any project:
- Run them through `testwatch` (`testwatch` alone runs the suites in the project's `.testmonitor.json`; `testwatch -- <command>` runs anything), so the run shows live on the Mac mini.
- Every test has a stable id, a group, and a short description, and ends as pass, fail, skip or flaky, with a one-line reason for anything but pass.
- New suites emit the Test Monitor event format or use a built-in reader (TAP, the Playwright reporter); existing suites get a `.testmonitor.json` rule instead of a rewrite.
- The full convention is in the test-monitor repo, docs/convention.md.
```

## Where runs go

`testwatch` sends to `TESTMONITOR_URL` with `TESTMONITOR_TOKEN`. On the mini, the defaults (localhost and `~/.test-monitor/token`) work as they are. On the PC, set both (or put `url` in the project's `.testmonitor.json`). In cloud sessions, set both as environment secrets, pointing at the tunnel.

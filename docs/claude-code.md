# Claude Code

KurTest can be the default for every test run Claude Code makes: a hook catches test commands and sends them back through `kurtest`, and a short rule in `CLAUDE.md` tells Claude to write tests in the shape KurTest reads.

## Set it up

```sh
npm i -g kurtest
kurtest init claude
```

That's it when KurTest runs on the same machine. If it runs somewhere else, say where, with the token from that machine (`kurtest token` prints it there):

```sh
KURTEST_TOKEN=<token> kurtest init claude --url http://my-server:7357
```

`init claude` is safe to run again. It backs up anything it changes (`*.bak-kurtest`) and does three things:

1. **The hook**, in `~/.claude/settings.json` (on Windows, `%USERPROFILE%\.claude\settings.json`):

   ```json
   {
     "hooks": {
       "PreToolUse": [
         { "matcher": "Bash", "hooks": [ { "type": "command", "command": "kurtest --claude-hook" } ] }
       ]
     }
   }
   ```

   When Claude is about to run a test command (npm test, Playwright, Vitest, Jest, pytest, PHPUnit, go test, cargo test, `tests/*.sh` and so on) without `kurtest`, the hook stops that call and tells Claude to rerun it as `kurtest -- <same command>`. The rerun goes through your usual permission rules; the hook never approves anything. Starting a command with `KURTEST_HOOK=off` skips it once.

2. **The rule**, added to `~/.claude/CLAUDE.md` (following a symlink if it is one). It's the block below.

3. **Where runs go**: `--url` is saved in `~/.kurtest/config.json`, and `KURTEST_TOKEN`, if set, in `~/.kurtest/token`.

## The rule

```markdown
## Tests report to KurTest

Whenever you write or run tests, in any project:
- Run them through `kurtest` (`kurtest` alone runs the suites in the project's `.kurtest.json`; `kurtest -- <command>` runs anything), so the run shows live in KurTest.
- Every test has a stable id, a group, and a short description, and ends as pass, fail, skip or flaky, with a one-line reason for anything but pass.
- New suites use a built-in reader (TAP, the Playwright reporter) or print KurTest events; existing suites get a `.kurtest.json` rule instead of a rewrite.
- The full convention: https://github.com/KVachon/kurtest/blob/main/docs/convention.md
```

## Cloud and CI sessions

Set `KURTEST_URL` and `KURTEST_TOKEN` in the environment and install KurTest in the setup script:

```sh
npm i -g kurtest && kurtest init claude
```

The machine running KurTest has to be reachable from there; see [remote access](remote.md).

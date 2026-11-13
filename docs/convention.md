# Test convention

KurTest shows whatever your tests report, but it's most useful when every test reports the same few things. This is the shape to aim for, whatever runner you use.

## What every test has

| Field | Rule | Example |
| --- | --- | --- |
| `id` | Stable across runs and unique within its suite. Lowercase, `a-z0-9` and `-`, no line numbers, no timestamps. Renaming a test changes its id, so do it on purpose. | `upload-rejects-big-zip` |
| `group` | The short key the test belongs to: a feature, a spec file or a module. Groups are the cells in the grid, so aim for 5 to 60 tests per group. | `UPL` |
| `groupName` | Optional. A human name for the group. When it's set, the grid shows the key and the name. | `Uploads` |
| `desc` | One short sentence saying what the test checks, in plain words. Under about 80 characters. | `Rejects a zip over the size cap` |
| `status` | `pass`, `fail`, `skip` or `flaky` (failed at least once, then passed on retry). | `fail` |
| `reason` | One line, for `fail`, `skip` and `flaky`. The assertion that broke, not a stack trace. | `expected status 413, got 200` |

The built-in readers fill these in from what your runner already prints: the TAP reader uses the file name as the group and the test name as the description, and the Playwright reporter uses the spec file and the test's title path. Ids come from those names, so they stay stable as long as the names do.

## As a rule for a team, or for an AI assistant

The short version, to paste into a contributing guide or a `CLAUDE.md`:

> When you write or run tests:
> - Run them through `kurtest` (`kurtest` alone runs the suites in `.kurtest.json`; `kurtest -- <command>` runs anything).
> - Every test has a **stable id**, a **group**, and a **short description**. It ends as **pass**, **fail**, **skip** or **flaky**, and a fail, skip or flaky result has a one-line **reason**.
> - New suites use a built-in reader or print KurTest events. Existing suites get a reader rule in `.kurtest.json` rather than a rewrite.

[Claude Code](claude-code.md) can have this added for you, along with a hook that routes its test runs through `kurtest`.

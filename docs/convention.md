# Test convention and event format

Every test suite in every project reports to the Test Monitor in one shape. This file is the source of truth. The short version also goes into the global CLAUDE.md as a rule, so every project and thread follows it.

## The rule (for CLAUDE.md)

> When you write or run tests in any project, they report to the Test Monitor:
> - Run tests through `testwatch` (or the project's `.testmonitor.json`), never bare, so the run shows live on the Mac mini.
> - Every test has a **stable id**, a **group**, and a **short description**. It ends as **pass**, **fail**, **skip** or **flaky**, and a fail, skip or flaky result has a one-line **reason**.
> - New suites emit the event format below directly, or use a built-in reader. Existing suites get a reader rule in `.testmonitor.json` rather than a rewrite.

## What every test has

| Field | Rule | Example |
| --- | --- | --- |
| `id` | Stable across runs and unique within its suite. Lowercase, `a-z0-9` and `-`, no line numbers, no timestamps. Renaming a test changes its id, so do it on purpose. | `f17-zip-cap` |
| `group` | The short key the test belongs to: a feature, a spec file or a module. Groups are the cells in the grid, so aim for 5 to 60 tests per group. | `F17` |
| `groupName` | Optional. A human name for the group. When it's set, the grid shows the key and the name. | `Uploads` |
| `desc` | One short sentence saying what the test checks, in plain words. Under about 80 characters. | `Rejects a zip over the size cap` |
| `status` | `pass`, `fail`, `skip` or `flaky` (failed at least once, then passed on retry). | `fail` |
| `reason` | One line, for `fail`, `skip` and `flaky`. The assertion that broke, not a stack trace. | `expected status 413, got 200` |

## Event format

Events are JSON objects. A runner sends them in one of two ways:

1. **Marker lines on stdout**, picked up by `testwatch`: a line that starts with `@@testmonitor ` followed by one JSON event. `testwatch` hides these lines from the terminal and fills in `run` and `suite` when they're missing. This is the easiest route for a custom runner.
2. **HTTP**: `POST /api/events` on the monitor with a JSON array of events (or one event, or JSON lines). Send `Authorization: Bearer <token>` when the monitor has a token.

Every event has `type` and `run`. `testwatch` adds `at` (the sender's clock in milliseconds since the epoch); the monitor turns that into its own time so runs from different machines line up.

```jsonc
// once per run
{"type":"run-start","run":"kurtpc-20261112-140312-a1b2","project":"amchp-member-portal","command":"testwatch","host":"KurtPC"}

// once per suite; "tests" is the plan, so the grid is laid out before the first test runs
{"type":"suite-start","run":"…","suite":"php","label":"tests/run.sh","command":"./tests/run.sh",
 "tests":[{"id":"f17-zip-cap","group":"F17","groupName":"Uploads","desc":"Rejects a zip over the size cap"}]}

// per test; test-start is optional but makes the "now running" line and the live tick work
{"type":"test-start","run":"…","suite":"php","id":"f17-zip-cap","group":"F17"}
{"type":"test-end","run":"…","suite":"php","id":"f17-zip-cap","group":"F17","status":"fail","reason":"expected status 413, got 200","ms":840}

{"type":"suite-end","run":"…","suite":"php"}
{"type":"run-end","run":"…","status":"fail"}   // pass | fail | stopped
```

Notes:

- Send `test-end` once per test, with the final result. A test that is retried and then passes is `flaky`, not two events.
- The plan in `suite-start` is optional. Without it, the monitor lays the grid out from the last run of the same project and command, so the layout is stable from the second run on.
- `ms` is optional. Without it, the monitor uses the time between `test-start` and `test-end`.
- Unknown fields are ignored, so a runner can add its own.

## Built-in readers

`testwatch` reads a suite's output with one of these:

| Reader | For | How |
| --- | --- | --- |
| `marker` | Anything that prints `@@testmonitor` lines, including the Playwright reporter in `reporters/playwright.cjs` | Always on |
| `tap` | Node's test runner, Vitest (`--reporter=tap`), pytest with `pytest-tap`, anything TAP | `"reader": "tap"`, or detected automatically |
| `pattern` | A custom runner that prints one line per test | Regex rules in `.testmonitor.json` |

Readers for Jest's JSON output, pytest and JUnit XML are planned.

## `.testmonitor.json`

Put it in the project root. `testwatch` with no arguments runs every suite in it, in order, as one run.

```json
{
  "project": "amchp-member-portal",
  "suites": [
    {
      "name": "php",
      "label": "tests/run.sh",
      "command": "./tests/run.sh",
      "reader": "pattern",
      "rules": [
        { "match": "^pass\\s+(?<id>\\S+)\\s+(?<desc>.*)$", "status": "pass" },
        { "match": "^FAIL\\s+(?<id>\\S+)\\s+(?<reason>.*)$", "status": "fail" }
      ],
      "group": { "match": "^([a-z]+\\d+)-", "upper": true },
      "groupNames": { "F17": "Uploads" }
    },
    {
      "name": "browser",
      "label": "tests/browser.sh",
      "command": "./tests/browser.sh",
      "reader": "marker"
    }
  ]
}
```

- A rule's named groups can be `id`, `desc`, `reason` and `group`. The first rule that matches a line wins.
- `shell` names the shell for a suite's command (for example `bash` for `.sh` scripts on Windows).
- `group.match` takes the group from the id (the first capture). `upper` uppercases it.
- `groupNames` maps a group key to its name.

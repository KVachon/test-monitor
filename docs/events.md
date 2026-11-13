# Event format

Events are JSON objects. A runner sends them in one of two ways:

1. **`@@kurtest` lines on stdout**, picked up by `kurtest`: a line that starts with `@@kurtest ` followed by one JSON event. `kurtest` hides these lines from the terminal, adds the run and the time, and fills in `suite` when it's missing. This is the easiest route for a custom runner. (`@@testmonitor ` works too, from before the rename.)
2. **HTTP**: `POST /api/events` with a JSON array of events, one event, or JSON lines. See [api.md](api.md).

Every event has `type` and `run`. Senders add `at`, their clock in milliseconds since the epoch; KurTest turns that into its own time, so runs from different machines line up.

```jsonc
// once per run
{"type":"run-start","run":"laptop-20261112-140312-a1b2","project":"my-app","command":"kurtest","host":"laptop"}

// once per suite; "tests" is the plan, so the grid is laid out before the first test runs
{"type":"suite-start","run":"…","suite":"api","label":"tests/run.sh","command":"./tests/run.sh",
 "tests":[{"id":"upload-rejects-big-zip","group":"UPL","groupName":"Uploads","desc":"Rejects a zip over the size cap"}]}

// per test; test-start is optional but makes the "now running" line and the live tick work
{"type":"test-start","run":"…","suite":"api","id":"upload-rejects-big-zip","group":"UPL"}
{"type":"test-end","run":"…","suite":"api","id":"upload-rejects-big-zip","group":"UPL","status":"fail","reason":"expected status 413, got 200","ms":840}

{"type":"suite-end","run":"…","suite":"api"}
{"type":"run-end","run":"…","status":"fail"}   // pass | fail | stopped
```

Notes:

- Send `test-end` once per test, with the final result. A test that is retried and then passes is `flaky`, not two events.
- The plan in `suite-start` is optional. Without it, KurTest lays the grid out from the last run of the same project and command, so the layout is stable from the second run on.
- `ms` is optional. Without it, KurTest uses the time between `test-start` and `test-end`.
- Run ids are 1 to 120 characters of `A-Z a-z 0-9 . _ : -`.
- Unknown fields are ignored, so a runner can add its own.

What each field should hold is in the [test convention](convention.md).

# Runners

`kurtest -- <command>` reads TAP and `@@kurtest` lines from any command by itself. This page covers each common runner, and `.kurtest.json` for everything else.

## Node's test runner

```sh
kurtest -- node --test
```

Under `kurtest` its output isn't a terminal, so Node prints TAP on its own. Groups are test files; nested `describe` blocks become part of the description.

## Vitest

```sh
kurtest -- npx vitest run --reporter=tap
```

## Mocha

```sh
kurtest -- npx mocha --reporter tap
```

## pytest

```sh
pip install pytest-tap
kurtest -- pytest --tap-stream
```

A native pytest plugin is planned.

## Playwright

Add KurTest's reporter next to your usual one in `playwright.config.ts`:

```ts
reporter: [['list'], ['kurtest/playwright']],
```

`kurtest/playwright` resolves when `kurtest` is in the project's `devDependencies` (`npm i -D kurtest`). With a global install, give the full path instead: `npm root -g` shows the folder, and the reporter is `kurtest/reporters/playwright.cjs` inside it.

Then run `kurtest -- npx playwright test`. The reporter is silent unless the tests run under `kurtest`, so it's safe to leave in. Groups are spec files, retries that pass are `flaky`, and the plan of every test is sent first, so the grid is laid out before the first test finishes.

## Jest, JUnit XML, Go, Rust, .NET, PHPUnit

There are no built-in readers for these yet. Until there are, use a TAP reporter where one exists (for Jest, the `jest-tap-reporter` package), or a `pattern` rule if the runner prints one line per test (below).

## A runner that prints one line per test

Give the suite regex rules in `.kurtest.json`. The first rule that matches a line wins, and its named groups can be `id`, `desc`, `reason` and `group`:

```json
{
  "project": "my-app",
  "suites": [
    {
      "name": "api",
      "label": "tests/run.sh",
      "command": "./tests/run.sh",
      "reader": "pattern",
      "rules": [
        { "match": "^pass\\s+(?<id>\\S+)\\s+(?<desc>.*)$", "status": "pass" },
        { "match": "^FAIL\\s+(?<id>\\S+)\\s+(?<reason>.*)$", "status": "fail" }
      ],
      "group": { "match": "^([a-z]+)-", "upper": true },
      "groupNames": { "UPL": "Uploads" }
    }
  ]
}
```

- `group.match` takes the group from the id (the first capture); `upper` uppercases it.
- `groupNames` maps a group key to its name.

## Your own runner

Print one line per event to stdout, starting with `@@kurtest ` and followed by the event as JSON. `kurtest` hides these lines from the terminal and fills in the run and suite. The events are in [events.md](events.md).

```js
console.log('@@kurtest ' + JSON.stringify({ type: 'test-end', id: 'adds', group: 'Math', status: 'pass' }));
```

Or send events straight to KurTest over HTTP: see [api.md](api.md).

## `.kurtest.json`

Put it in the project root. `kurtest` with no arguments runs every suite in it, in order, as one run; `kurtest unit e2e` runs just those.

| Field | Meaning |
| --- | --- |
| `project` | The project's name on the page. Defaults to the folder name. |
| `url` | Where this project's runs go, if not this machine. |
| `suites[].name` | Short name, used on the command line. |
| `suites[].label` | What the page calls it. Defaults to the name. |
| `suites[].command` | The command to run. |
| `suites[].cwd` | Folder to run it in, relative to `.kurtest.json`. |
| `suites[].shell` | The shell for the command, for example `bash` for `.sh` scripts on Windows. |
| `suites[].reader` | `auto` (the default: TAP and `@@kurtest` lines), `tap`, `marker`, or `pattern`. |
| `suites[].rules`, `group`, `groupNames` | For the `pattern` reader, above. |

# Contributing

Thanks for helping. Issues and pull requests are welcome; for anything bigger than a fix, open an issue first so we can agree on the shape.

## Working on it

```sh
git clone https://github.com/KVachon/kurtest && cd kurtest
npm test                 # Node's test runner, no install step: there are no dependencies
node bin/kurtest.js serve --open
npm run demo             # a pretend run with two suites, a few failures and a flaky test
```

Or watch KurTest's own tests in KurTest: `node bin/kurtest.js` runs the suite in `.kurtest.json`.

## Ground rules

- **No dependencies.** KurTest installs in a second and runs anywhere Node does. Use Node's standard library.
- **Nothing moves while a run is live.** The page reserves room for everything up front, a line that's been drawn never redraws, and counts never wrap. Layout changes need to keep that.
- **Keep the old names working** (`testwatch`, `TESTMONITOR_*`, `.testmonitor.json`, `@@testmonitor`) until a major version drops them.
- **Tests run on macOS, Linux and Windows** in CI. Mind paths, line endings and shells.
- Copy in the UI and docs is short and plain.

## Adding a reader

Readers live in `lib/readers.js`: a reader takes the command's output one line at a time and returns events (see [docs/events.md](docs/events.md)). Add tests with real output from the runner in `test/readers.test.js`, and a recipe in `docs/runners.md`.

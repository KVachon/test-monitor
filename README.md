# Test Monitor

A live page for test runs, from any project on any machine. Every run reports to one always-on monitor (on the Mac mini), and the page shows it as it happens: elapsed time and counts, tests finished per minute with a red line at each failure, the running group's ticks, a grid of every group, and the failures with their reasons.

Node 18 or later, no dependencies. Works on macOS and Windows.

- [docs/convention.md](docs/convention.md): the one structure every test suite follows, and the event format.
- [docs/brief.md](docs/brief.md): the starting brief.
- [design/mockup-template.html](design/mockup-template.html): the agreed design the page is built from.

## Run the monitor

```sh
node bin/test-monitor.js            # http://localhost:7357
node bin/test-monitor.js --open     # also opens the page when a run starts and no tab is open
```

| Setting | Flag | Environment | Default |
| --- | --- | --- | --- |
| Port | `--port` | `TESTMONITOR_PORT` | `7357` |
| Address to listen on | `--bind` | `TESTMONITOR_BIND` | `0.0.0.0` |
| Where runs are kept | `--data` | `TESTMONITOR_DATA` | `~/.test-monitor` |
| Open the page on a new run | `--open` | `TESTMONITOR_OPEN=1` | off |
| Token for senders | | `TESTMONITOR_TOKEN`, or a `token` file in the data folder | none |

With a token set, sending runs always needs it. The page is open to this machine and the home network, and needs `?token=…` from anywhere else (including through a tunnel). The last 300 runs are kept.

## Report a run

```sh
testwatch -- npm test                 # any command; TAP and @@testmonitor lines are read automatically
testwatch                             # every suite in .testmonitor.json, as one run
testwatch php                         # one suite from .testmonitor.json
```

`testwatch` mirrors the command's output, sends events to `TESTMONITOR_URL` (default `http://localhost:7357`) with `TESTMONITOR_TOKEN` (or `~/.test-monitor/token`), and exits with the command's exit code. If the monitor can't be reached, it says so once and the tests carry on.

For Playwright, add the reporter next to your usual one:

```js
reporter: [['list'], ['<path to test-monitor>/reporters/playwright.cjs']],
```

## Try it

```sh
node bin/test-monitor.js &
npm run demo            # a pretend run with two suites, a few failures and a flaky test
```

Run the demo twice: from the second run on, the page lays out every suite before it starts and estimates time left from the last run.

## Tests

```sh
npm test
```

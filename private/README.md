# Kurt's own setup (private)

Everything in this folder is personal and never goes into the public KurTest repo: `private/scripts/export-public.sh` copies every tracked file except this folder, and refuses if it finds personal details.

| File | What it is |
| --- | --- |
| `brief.md`, `DECISIONS.md`, `STATUS.md` | The project's history and decisions |
| `setup-mac-mini.md`, `scripts/setup-mac-mini.sh` | The Mac mini's service, tunnel and Claude setup |
| `claude-setup.md` | The Claude hook and rule as set up on the mini, KurtPC and cloud sessions |
| `amchp-member-portal/` | The portal's `.testmonitor.json` and reporter line |
| `design/` | The original mockup, with portal test ids |
| `scripts/export-public.sh` | Step 2: builds the public copy and checks it |

## Nothing changes until step 3

Merging the KurTest prep into main and pulling it on the mini changes nothing there: the launchd job runs `bin/test-monitor.js`, which keeps the old defaults (every address, the page open to the home network, the existing token in `~/.test-monitor/token`). `testwatch`, `TESTMONITOR_*`, `.testmonitor.json` and `@@testmonitor` all keep working. Two things do change for the better: a `?token=` link now signs in with a cookie and drops the token from the address, and the fonts come from the mini instead of Google.

## Step 3: switching each machine to the public package

Once `kurtest` is on npm:

**Mac mini** (Kurt runs these; remote sessions can't edit LaunchAgents)

```sh
launchctl unload ~/Library/LaunchAgents/org.testmonitor.plist && rm ~/Library/LaunchAgents/org.testmonitor.plist
npm i -g kurtest
kurtest service install --host 0.0.0.0 --lan-view
```

Runs, history and the token stay in `~/.test-monitor`, which KurTest keeps using while `~/.kurtest` doesn't exist. Leave out `--open`: SITREP notifies instead. The service runs Herd's current Node by its full path, so after a Node upgrade in Herd, run `kurtest service install --host 0.0.0.0 --lan-view` again. The Cloudflare tunnel needs no change (same port).

**KurtPC**: `npm.cmd i -g kurtest`, then `kurtest.cmd init claude --url https://tests.kvach.co` (with `KURTEST_TOKEN` set), so the hook calls `kurtest`.

**Cloud environment**: setup script becomes `npm i -g kurtest`; `TESTMONITOR_URL` and `TESTMONITOR_TOKEN` keep working, or rename them to `KURTEST_URL` and `KURTEST_TOKEN`.

**AMCHP portal**: rename `.testmonitor.json` to `.kurtest.json`, and point the Playwright reporter at the global kurtest install (`npm.cmd root -g` shows the folder).

**CLAUDE.md**: the rule's heading stays "Tests report to the Test Monitor" until replaced; swapping in the rule from `docs/claude-code.md` is optional.

**SITREP**: nothing; same port and API.

Then rename this repo to `kurtest-home` and trim it to this folder.

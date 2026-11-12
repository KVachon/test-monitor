# AMCHP member portal

The portal's tests run on KurtPC (Windows, in the Local site). To report them to the monitor on the mini:

1. Copy `.testmonitor.json` into the portal's root. Check `url` against the mini's name on the network.
2. Set `TESTMONITOR_TOKEN` on the PC (or put the token in `%USERPROFILE%\.test-monitor\token`).
3. Add the Test Monitor reporter to the portal's Playwright config, next to the reporter it uses now:
   ```js
   reporter: [['list'], ['C:/Users/KVach/AppData/Roaming/npm/node_modules/test-monitor/reporters/playwright.cjs']],
   ```
   (the path is `npm root -g` plus `test-monitor/reporters/playwright.cjs`; the reporter is silent unless testwatch runs it).
4. Run `testwatch` in the portal root for both suites, or `testwatch php` / `testwatch browser` for one.

`run.sh` prints `pass <id> <desc>` and `FAIL <id> <reasons>`, so the php suite is read with two regex rules, and the group is the id's prefix (`f17-…` is F17). The feature names in `tests/cases.json` aren't read yet: add them to `groupNames` (`{"F17": "Uploads", …}`) so the grid shows the names too. Both scripts run in bash, which on Windows is Git Bash.

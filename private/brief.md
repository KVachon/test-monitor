# Test Monitor: starting brief

Written 11 Nov 2026 from the AMCHP Member Portal thread "Visualize test runs as they happen".

## What Kurt asked for
A visual, live view of test runs, so a long test run isn't silent. It's inspired by a "tests visualised" post: a header with elapsed time and pass/fail counts, a tests-per-second trace with a red line at each failure, and per-file rows of ticks. Kurt's direction:
- Make it our own design and keep the general idea. The first version, one row per group, was too tall.
- Follow the global design rules: no coloured left-border stripes, and the clean-copy ladder.
- It must be reusable for any project with tests, not specific to the portal.
- He chose a live browser dashboard over Playwright's UI mode or a terminal view.

## The bigger goal (Kurt, 12 Nov)
In Kurt's words: "a generalized test runner that always opens in a webpage on the mini whenever claude is running tests, so whenever there are tests to be made/run, they follow a structure that reports to this and does so consistently." What that means for the build:
- **The default, not an extra.** Any time Claude runs tests in any of Kurt's projects, the run reports here and a page opens on the Mac mini showing it live. Nobody should have to remember to turn it on.
- **Lives on the Mac mini.** The page is served and opened on the mini, which is always on. Kurt named the mini for this, which overrides the PC-only working rule for this one piece. Test runs elsewhere (the Windows PC with the portal's Local site, cloud sessions) still have to show up on the mini's page. So the mini needs a small always-on service that takes run events over the network, and every runner, local or remote, sends its events there. How those runs reach the mini safely (local network, a tunnel, an authenticated endpoint) is the first design question to settle with Kurt.
- **One structure for every test suite.** New tests Claude writes, in any project, follow one shared convention so they report consistently: a stable id, a group, a short description, and pass/fail/skip/flaky with a reason. Existing suites are adapted to report in that shape, either through a reader for their output or by emitting the event format directly. Write the convention down once, in this repo and as a global rule in Kurt's CLAUDE.md, so every project and thread follows it.
- **Opening automatically** needs a hook that fires whenever Claude starts a test run, for example a Claude Code hook or a wrapper every project's test command goes through. It should open the page on the mini, or reuse the tab if one is already open.
- Keep the agreed design (below): one page, live, with a stable layout.

## Mockup
https://claude.ai/artifact/6ARz62GX1Xj9mSY6TokwJF. The source is `mockup-template.html` in this folder: `__DATA__` is filled with the case list. It's one near-black panel in the style of the original, dark only by choice. From top to bottom:
- A header with a status icon, "Running tests", the project and command, elapsed time, and passed · failed counts.
- "Tests finished per minute" (per minute suits suites this slow): a white curve over a dotted fill that fades towards the bottom, with a red line and top dot at each failure, a dashed line where the next suite starts (its name on a fixed row under the chart), and a glowing dot at the live end. How it's drawn (this took several rounds with Kurt to get right):
  - **The dot draws the line.** Each frame the dot eases toward the rate over the last 30 seconds (an exponential ease with a 12-second time constant, in run time rather than frames, so the shape is the same at any replay speed). The line is the dot's own trail. Once drawn, a point never moves: measured at under 1px behind the dot. Kurt specifically didn't want the line redrawing behind the dot.
  - The curve is a monotone spline (Fritsch-Carlson), so it never overshoots.
  - The vertical scale is square-root and starts from the last run's peak (300/min in the mockup). It only grows, and gradually.
- The open group's ticks, one per test. This is the group running now, or the one clicked.
- A grid with one cell per group, filling as it runs, under one heading per suite. On phones the cells show only their key.
- Failures with the id, the description and the reason. Flaky tests are shown in amber.
- The fonts are Inter and IBM Plex Mono.
- Polish pass (11 Nov), following the global SaaS design rules:
  - one panel with a hairline border, an inner highlight and a deep shadow on a near-black page
  - a status orb with a thin spinning ring while running, green or red when done
  - a large elapsed time, with passed and failed as pill chips (the failed one turns red)
  - a thin progress bar for the whole run under the header
  - the chart in a framed well, with faint guides, a soft glow under the line, a pulsing live dot, and failure marks that fade downwards
  - the suite labels have hairline rules, and the cells have glow and pressed states
  - failures have the reason in a code chip, and the empty state shows a check icon
  - the footer has a segmented speed control and a Replay button
- Nothing moves while it runs. The ticks area reserves room for the largest group at the current width, the "now" line has fixed rows, the counts never wrap, and the Failures section is always there ("None so far." when empty). Keep it that way: Kurt asked that nothing grows or shrinks.

## Proposed shape (not yet agreed in detail; adjust it to the bigger goal above)
- `testwatch <your test command>` runs the command, mirrors its output to the terminal, serves the page locally and opens it. It's Node with no dependencies, and runs on Windows and Mac.
- Readers for output:
  - built in: Playwright (a reporter), Jest/Vitest, pytest, JUnit XML and TAP
  - a per-project settings file with a line pattern, for custom runners
  - a plain JSON-lines event format that any runner can write
- Per-project run history (a folder in the project) for time left and comparison with recent runs.

## First user: the AMCHP member portal
- `./tests/run.sh` (PHP, 583 cases) prints `pass  <id>  <desc>` or `FAIL  <id>  <reasons>`, one per case. The group is the id prefix (`f17-` is F17), and the feature names are in `tests/cases.json`.
- `./tests/browser.sh` (Playwright, 194 tests, one worker, one retry) groups by spec file.
- The tests run on Kurt's Windows PC (KurtPC) in the Local site, so they have to report across to the monitor on the mini. Apart from the monitor itself, keep the PC-only rule: don't use Mac paths for the portal.

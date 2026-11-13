# Changelog

## 0.1.0 (unreleased)

First public release, as KurTest. It was a personal tool called Test Monitor before that.

- `kurtest -- <command>` runs any test command and shows it live, starting KurTest in the background if it isn't running.
- Readers for TAP, `@@kurtest` lines and regex rules, and a Playwright reporter.
- `kurtest serve` listens on this machine only by default, makes a token on first start, and swaps a `?token=` link for a sign-in cookie.
- `kurtest service install` for launchd, systemd and Windows, and a Docker image.
- `kurtest init claude` adds a Claude Code hook and rule.
- Fonts are bundled, so the page works offline.
- The old Test Monitor names keep working.

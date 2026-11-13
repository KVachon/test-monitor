# Settings

## `kurtest serve`

| Setting | Flag | Environment | Default |
| --- | --- | --- | --- |
| Port | `--port` | `KURTEST_PORT` | `7357` |
| Address to listen on | `--host` | `KURTEST_HOST` | `127.0.0.1` (this machine only) |
| Show the page to the local network without the token | `--lan-view` | `KURTEST_LAN_VIEW=1` | off |
| Where runs and the token are kept | `--data` | `KURTEST_DATA` | `~/.kurtest` |
| Open the page when a run starts and no tab is open | `--open` | `KURTEST_OPEN=1` | off (on when started in the background by `kurtest -- …`) |
| Token | | `KURTEST_TOKEN`, or the `token` file in the data folder | made on first start |

## `kurtest` (sending runs)

| Setting | Flag | Environment / file | Default |
| --- | --- | --- | --- |
| Where runs go | `--url` | `KURTEST_URL`, then `url` in `.kurtest.json`, then `url` in `~/.kurtest/config.json` | `http://localhost:7357`, started if it isn't running |
| Token | | `KURTEST_TOKEN`, or `~/.kurtest/token` | |
| Project name | `--project` | `project` in `.kurtest.json` | the folder name |
| Suite label (for `--`) | `--label` | | the command |
| Reader | `--reader` | `reader` per suite | `auto` |
| Don't start KurTest in the background | | `KURTEST_AUTOSTART=0` | starts it |

Under `kurtest`, the test command sees `KURTEST=1`, `KURTEST_RUN`, `KURTEST_URL` and `KURTEST_SUITE`, which reporters use to know they're being watched.

## Names from before the rename

KurTest was called Test Monitor. The old names still work, so older setups keep running: the `testwatch` and `test-monitor` commands, `TESTMONITOR_*` variables (`TESTMONITOR_BIND` for `KURTEST_HOST`), the `~/.test-monitor` folder (used while `~/.kurtest` doesn't exist), `.testmonitor.json`, and `@@testmonitor` lines. `test-monitor` also keeps its old defaults: every address, the page open to the local network, and no token made for you.

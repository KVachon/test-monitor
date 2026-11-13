# Setting up the monitor on the Mac mini

Decided 12 Nov 2026: runs reach the mini on the home network directly, and from anywhere else (cloud sessions) through a Cloudflare Tunnel. Every sender needs the shared token.

## 1. Install and make a token

```sh
git clone https://github.com/KVachon/test-monitor ~/test-monitor
mkdir -p ~/.test-monitor
openssl rand -hex 24 > ~/.test-monitor/token
chmod 600 ~/.test-monitor/token
```

## 2. Keep it running (launchd)

The quick way: `bash ~/test-monitor/scripts/setup-mac-mini.sh` does this step plus the Claude hook and rule from docs/claude-setup.md, and can be run again safely. It starts node through a login shell, so it keeps working when the Node version changes. The manual way:

Save as `~/Library/LaunchAgents/org.testmonitor.plist`, with your Node path from `which node`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>org.testmonitor</string>
  <key>ProgramArguments</key><array>
    <string>/opt/homebrew/bin/node</string>
    <string>/Users/YOU/test-monitor/bin/test-monitor.js</string>
    <string>--open</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>/Users/YOU/.test-monitor/server.log</string>
</dict></plist>
```

```sh
launchctl load ~/Library/LaunchAgents/org.testmonitor.plist
```

It runs as you (a LaunchAgent, not a daemon), so `--open` can open the page in your browser when a run starts.

## 3. The tunnel (for cloud sessions)

A named tunnel needs a domain on Cloudflare. With one:

```sh
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create test-monitor
cloudflared tunnel route dns test-monitor tests.<your-domain>
cloudflared tunnel run --url http://localhost:7357 test-monitor     # then install it as a service: sudo cloudflared service install
```

Without a domain, `cloudflared tunnel --url http://localhost:7357` gives a free `trycloudflare.com` address, but it changes every restart, so it's only good for trying it out.

Requests through the tunnel always need the token, both for sending and for viewing the page (`https://tests.<your-domain>/?token=…`).

## 4. Point each sender at it

| Where the tests run | `TESTMONITOR_URL` | Token |
| --- | --- | --- |
| The mini itself | (default) `http://localhost:7357` | `~/.test-monitor/token` |
| The Windows PC | `http://<mini's name or LAN address>:7357` | `TESTMONITOR_TOKEN`, or `%USERPROFILE%\.test-monitor\token` |
| Cloud sessions | `https://tests.<your-domain>` | `TESTMONITOR_TOKEN` as an environment secret |

Cloud sessions also need the tunnel's hostname allowed in the environment's network settings.

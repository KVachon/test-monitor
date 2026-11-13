#!/bin/bash
# Finishes the Test Monitor setup on the Mac mini. Safe to run again.
#  - a LaunchAgent that keeps the monitor running (started through a login shell, so it finds node
#    even after the Node version changes)
#  - the Claude Code hook in ~/.claude/settings.json
#  - the testing rule in ~/.claude/CLAUDE.md (following the symlink if there is one)
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$HOME/.test-monitor" "$HOME/Library/LaunchAgents" "$HOME/.claude"

# 1. LaunchAgent
PLIST="$HOME/Library/LaunchAgents/org.testmonitor.plist"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>org.testmonitor</string>
  <key>ProgramArguments</key><array>
    <string>/bin/zsh</string><string>-lc</string>
    <string>exec node "$REPO/bin/test-monitor.js" --open</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME/.test-monitor/server.log</string>
  <key>StandardErrorPath</key><string>$HOME/.test-monitor/server.log</string>
</dict></plist>
PL
launchctl unload "$PLIST" 2>/dev/null || true
# Stop a monitor started by hand, so the LaunchAgent can take the port.
lsof -ti tcp:7357 -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
sleep 1
launchctl load "$PLIST"
echo "✓ LaunchAgent loaded ($PLIST)"

# 2. Hook (merged into the existing settings, with a backup)
SETTINGS="$HOME/.claude/settings.json"
[ -f "$SETTINGS" ] && cp "$SETTINGS" "$SETTINGS.bak-testmonitor"
node - "$SETTINGS" <<'JS'
const fs = require('fs'); const f = process.argv[2];
let s = {}; try { s = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
s.hooks = s.hooks || {}; s.hooks.PreToolUse = s.hooks.PreToolUse || [];
const has = s.hooks.PreToolUse.some(m => (m.hooks || []).some(h => /testwatch --claude-hook/.test(h.command || '')));
if (!has) s.hooks.PreToolUse.push({ matcher: 'Bash', hooks: [{ type: 'command', command: 'testwatch --claude-hook' }] });
fs.writeFileSync(f, JSON.stringify(s, null, 2) + '\n');
console.log(has ? '✓ Hook was already there' : '✓ Hook added to ' + f);
JS

# 3. CLAUDE.md rule
RULES="$HOME/.claude/CLAUDE.md"
[ -L "$RULES" ] && RULES="$(cd "$(dirname "$RULES")" && cd "$(dirname "$(readlink "$RULES")")" && pwd)/$(basename "$(readlink "$RULES")")"
if grep -q "## Tests report to the Test Monitor" "$RULES" 2>/dev/null; then
  echo "✓ Rule was already in $RULES"
else
  [ -f "$RULES" ] && cp "$RULES" "$RULES.bak-testmonitor"
  awk '/^```markdown$/{on=1;next} on&&/^```$/{exit} on' "$REPO/private/claude-setup.md" | { echo; cat; } >> "$RULES"
  echo "✓ Rule added to $RULES"
fi

sleep 1
curl -fsS localhost:7357/healthz >/dev/null && echo "✓ Monitor answering on http://localhost:7357" || echo "! Monitor not answering yet; see ~/.test-monitor/server.log"

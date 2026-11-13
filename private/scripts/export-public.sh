#!/bin/bash
# Step 2 of the KurTest plan: copies everything public (all tracked files except private/) into a fresh
# folder, checks it for personal details, and runs the tests there. Nothing is pushed or published.
#   bash private/scripts/export-public.sh /tmp/kurtest-public
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${1:?usage: export-public.sh <empty folder>}"
mkdir -p "$OUT"
[ -z "$(ls -A "$OUT")" ] || { echo "$OUT isn't empty"; exit 1; }

cd "$REPO"
git ls-files | grep -v '^private/' | while IFS= read -r f; do
  mkdir -p "$OUT/$(dirname "$f")"; cp -p "$f" "$OUT/$f"
done
echo "✓ Copied $(git ls-files | grep -vc '^private/') files to $OUT"

# Personal details that must not appear. Kurt's name is allowed only in LICENSE and package.json's author.
PATTERN='kvachon@|@gmail|amchp|mac.?mini|kurts?-mac|192\.168\.86|herd|sitrep|smart.?home|kvach\.co|kvachon\.com|kurtpc|/Users/kurt|users[\\/]+kvach'
if grep -rniIE "$PATTERN" "$OUT"; then echo "✗ Personal details found (above)"; exit 1; fi
if grep -rniIE "kurt[^e]|vachon" "$OUT" | grep -vE "^$OUT/(LICENSE|package\.json):|github\.com/KVachon/kurtest|ghcr\.io/kvachon/kurtest"; then
  echo "✗ Kurt's name outside LICENSE and package.json (above)"; exit 1
fi
echo "✓ No personal details"

if command -v gitleaks >/dev/null; then gitleaks detect --no-git --source "$OUT" && echo "✓ gitleaks found nothing"
else echo "! gitleaks isn't installed; install it and rerun before publishing"; fi

(cd "$OUT" && node test/run.js >/dev/null) && echo "✓ Tests pass in the copy"

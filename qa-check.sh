#!/usr/bin/env bash
# FoundationGaps — QA check
# Runs the project-specific test suite. Pushes to GitHub ONLY on a clean pass.
# Usage: bash qa-check.sh

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

log() { echo -e "${YELLOW}▶ $1${NC}"; }
ok()  { echo -e "${GREEN}✓ $1${NC}"; }
err() { echo -e "${RED}✗ $1${NC}"; }

echo ""
echo "══════════════════════════════════════════"
echo "  FoundationGaps QA Check"
echo "══════════════════════════════════════════"
echo ""

# 1. Static HTML sanity checks
log "Checking HTML file exists and is non-empty..."
[ -s docs/index.html ] && ok "docs/index.html OK" || { err "docs/index.html missing or empty"; exit 1; }

log "Checking required functions exist in HTML..."
REQUIRED=(showLibrary saveCurrentSession focusNoteEditor setSpeed fetchArxiv showReport)
MISSING=()
for fn in "${REQUIRED[@]}"; do
  grep -q "function ${fn}" docs/index.html || MISSING+=("$fn")
done
if [ ${#MISSING[@]} -gt 0 ]; then
  err "Missing functions: ${MISSING[*]}"; exit 1
fi
ok "All required functions present"

log "Checking no duplicate function definitions..."
DUPES=$(grep -oP 'function \w+' docs/index.html | sort | uniq -d)
if [ -n "$DUPES" ]; then
  err "Duplicate function definitions: $DUPES"
  exit 1
fi
ok "No duplicate functions"

# 2. Install Playwright if not present
log "Checking Playwright installation..."
if ! npx playwright --version &>/dev/null 2>&1; then
  log "Installing Playwright + Chromium (one-time)..."
  npm install --quiet
  npx playwright install chromium --with-deps
fi
ok "Playwright ready"

# 3. Run the test suite
log "Running FoundationGaps test suite..."
echo ""
PLAYWRIGHT_RESULT=0
npx playwright test --config tests/e2e/playwright.config.ts || PLAYWRIGHT_RESULT=$?

echo ""
if [ "$PLAYWRIGHT_RESULT" -ne 0 ]; then
  err "Tests FAILED — not pushing to GitHub"
  echo ""
  echo "  Fix the failures above, then re-run: bash qa-check.sh"
  echo "  Full HTML report: open tests/report/index.html"
  exit 1
fi

ok "All tests passed"

# 4. Push to GitHub
log "Pushing to GitHub..."
git push origin master
echo ""
ok "Released successfully → https://github.com/HemanthGudaparthi/FoundationGaps"
echo ""

#!/usr/bin/env bash
# Run what CI runs, locally, so a push needs no Actions minutes to find out.
#
#   scripts/check.sh            frontend + web E2E (Chromium) + Rust
#   scripts/check.sh --quick    frontend only (lint, format, types, Vitest, build)
#   scripts/check.sh --no-rust  skip the Rust workspace
#
# WebKit projects run when Playwright's WebKit is installed; otherwise they are
# skipped with a note. PW_CHROMIUM_PATH points Chromium at a local browser
# (sandboxes without Playwright's download).
set -euo pipefail
cd "$(dirname "$0")/.."

quick=false
rust=true
for arg in "$@"; do
  case "$arg" in
    --quick) quick=true ;;
    --no-rust) rust=false ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

step "frontend"
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
$quick && { echo; echo "quick checks passed"; exit 0; }

step "web E2E"
projects=(--project=pixel-7 --project=galaxy-s8 --project=chromium)
if node -e "require('fs').accessSync(require('@playwright/test').webkit.executablePath())" 2>/dev/null; then
  projects+=(--project=iphone-15 --project=ipad-mini --project=webkit)
else
  echo "WebKit is not installed (npx playwright install webkit): skipping the iPhone, iPad and Safari projects"
fi
npx playwright test "${projects[@]}"

if $rust; then
  step "rust"
  cargo fmt --all --check
  cargo clippy --workspace --all-targets --locked -- -D warnings
  cargo test --workspace --locked
fi

echo
echo "all checks passed"

#!/usr/bin/env bash
# Replay nzap-engine changes onto the vendored copy (see VENDORED.md).
#
#   scripts/sync-engine.sh <path-to-nzap-engine> [--apply]
#
# Without --apply it prints the upstream diff since the pinned commit. With
# --apply it applies that diff here with a 3-way merge, so local `mobile:`
# edits are kept where they do not conflict, and updates the pinned commit.
set -euo pipefail

engine=${1:?usage: scripts/sync-engine.sh <path-to-nzap-engine> [--apply]}
mode=${2:-}
here=$(cd "$(dirname "$0")/.." && pwd)
paths=(crates/nzap-core crates/nzap-mock-colab src e2e/web public)

pinned=$(grep -oE '`[0-9a-f]{40}`' "$here/VENDORED.md" | head -1 | tr -d '`')
head=$(git -C "$engine" rev-parse HEAD)
if [[ "$pinned" == "$head" ]]; then
  echo "Already at nzap-engine $head."
  exit 0
fi

patch=$(mktemp)
trap 'rm -f "$patch"' EXIT
git -C "$engine" diff --binary "$pinned" "$head" -- "${paths[@]}" >"$patch"

if [[ "$mode" != "--apply" ]]; then
  echo "Upstream changes $pinned..$head:"
  git -C "$engine" diff --stat "$pinned" "$head" -- "${paths[@]}"
  exit 0
fi

if [[ -s "$patch" ]]; then
  # --3way needs the upstream blobs; fetch them into this repository's object store.
  git -C "$here" fetch --quiet "$engine" "$head" || true
  git -C "$here" apply --3way --whitespace=nowarn "$patch"
fi
sed -i.bak "s/$pinned/$head/" "$here/VENDORED.md" && rm -f "$here/VENDORED.md.bak"
echo "Synced to nzap-engine $head. Review 'git diff', resolve conflicts, run the tests."

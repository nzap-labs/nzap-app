#!/usr/bin/env bash
# Check the Android release artefacts CI just built:
#   - every APK is signed, not debuggable, and carries only its own ABI;
#   - R8 ran (a non-empty mapping.txt per variant, obfuscated classes);
#   - WebView debugging is not compiled in (no e2e feature in releases).
#
#   scripts/verify-android-release.sh <android app build dir> [--allow-e2e]
set -euo pipefail

build=${1:?usage: verify-android-release.sh <app/build> [--allow-e2e]}
allow_e2e=${2:-}
tools=$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)
aapt2="$tools/aapt2"
apksigner="$tools/apksigner"
failures=0
fail() {
  echo "::error::$*"
  failures=$((failures + 1))
}

declare -A expected_abi=(
  [arm64]=arm64-v8a [arm]=armeabi-v7a [x86]=x86 [x86_64]=x86_64
)

mapfile -t apks < <(find "$build/outputs/apk" -name '*release*.apk' | sort)
[[ ${#apks[@]} -gt 0 ]] || fail "no release APKs under $build/outputs/apk"

printf '%-60s %10s  %s\n' APK size ABIs
for apk in "${apks[@]}"; do
  flavor=$(basename "$(dirname "$(dirname "$apk")")")
  abis=$(unzip -Z1 "$apk" | sed -n 's#^lib/\([^/]*\)/libnzap_app_lib\.so$#\1#p' | sort | tr '\n' ' ')
  printf '%-60s %10s  %s\n' "${apk#"$build"/}" "$(du -h "$apk" | cut -f1)" "$abis"

  "$apksigner" verify "$apk" >/dev/null || fail "$apk is not signed"

  manifest=$("$aapt2" dump xmltree --file AndroidManifest.xml "$apk")
  if grep -q 'android:debuggable.*=true' <<<"$manifest"; then
    fail "$apk is debuggable"
  fi

  if [[ -n "${expected_abi[$flavor]:-}" ]]; then
    [[ "$abis" == "${expected_abi[$flavor]} " ]] || fail "$apk should hold only ${expected_abi[$flavor]}, has: $abis"
  else
    for abi in arm64-v8a armeabi-v7a x86 x86_64; do
      grep -qw -- "$abi" <<<"$abis" || fail "$apk (universal) is missing $abi"
    done
  fi

  # The e2e feature enables WebView debugging via wry's devtools; its marker
  # string must not be in a shipped library.
  if [[ "$allow_e2e" != "--allow-e2e" ]]; then
    lib=$(unzip -Z1 "$apk" | grep -m1 'libnzap_app_lib\.so$')
    if unzip -p "$apk" "$lib" | grep -aq 'NZAP_E2E_BUILD'; then
      fail "$apk was built with the e2e feature"
    fi
  fi
done

mapfile -t mappings < <(find "$build/outputs/mapping" -name mapping.txt 2>/dev/null | sort)
[[ ${#mappings[@]} -gt 0 ]] || fail "no R8 mapping.txt: minification did not run"
for mapping in "${mappings[@]}"; do
  [[ -s "$mapping" ]] || fail "$mapping is empty"
  # R8 renamed at least some classes (lines like `a.b.C -> x.y:`).
  renamed=$(grep -cE '^[^ #].* -> [a-zA-Z0-9_.$]+:$' "$mapping" || true)
  echo "R8 ${mapping#"$build"/}: $renamed classes mapped"
  [[ "$renamed" -gt 0 ]] || fail "$mapping maps no classes"
done

if [[ $failures -gt 0 ]]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo "All Android release checks passed."

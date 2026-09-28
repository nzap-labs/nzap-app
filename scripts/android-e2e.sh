#!/usr/bin/env bash
# Run the Android E2E suite on the attached emulator:
#   1. start nzap-mock-colab on the host,
#   2. forward the emulator's 127.0.0.1:<port> to it (adb reverse),
#   3. install the e2e APK (permissions granted),
#   4. run e2e/android with Playwright, keeping logcat and the mock log.
#
#   scripts/android-e2e.sh <path/to/e2e.apk>
set -euo pipefail

apk=${1:?usage: scripts/android-e2e.sh <path/to/e2e.apk>}
here=$(cd "$(dirname "$0")/.." && pwd)
port=${NZAP_E2E_MOCK_PORT:-9901}
artifacts="$here/e2e/android/artifacts"
mkdir -p "$artifacts"

mock_bin="$here/target/release/mock-colab"
[[ -x "$mock_bin" ]] || { echo "Build the mock first: cargo build --release -p nzap-mock-colab"; exit 1; }
"$mock_bin" "$port" >"$artifacts/mock.log" 2>&1 &
mock=$!
finish() {
  status=$?
  adb logcat -d >"$artifacts/logcat.txt" 2>/dev/null || true
  adb shell dumpsys activity services com.nzaplabs.app >"$artifacts/services.txt" 2>/dev/null || true
  kill "$mock" 2>/dev/null || true
  exit $status
}
trap finish EXIT

for _ in $(seq 60); do
  curl -s -o /dev/null "http://127.0.0.1:$port/" && break
  sleep 1
done

adb wait-for-device
adb logcat -c || true
adb reverse "tcp:$port" "tcp:$port"
adb install -r -g "$apk"
# The keep-alive notification permission (Android 13+), in case -g missed it.
adb shell pm grant com.nzaplabs.app android.permission.POST_NOTIFICATIONS 2>/dev/null || true

cd "$here"
npx playwright test -c e2e/android/playwright.config.ts

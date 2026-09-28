#!/usr/bin/env bash
# Install the simulator build on an iPhone simulator, launch it and check it
# stays up and renders.
#
#   scripts/ios-smoke.sh <path/to/NZAP.app> <artifacts dir>
set -euo pipefail

app=${1:?usage: scripts/ios-smoke.sh <NZAP.app> <artifacts dir>}
out=${2:?usage: scripts/ios-smoke.sh <NZAP.app> <artifacts dir>}
bundle=com.nzaplabs.app
mkdir -p "$out"

# The newest available iPhone simulator.
udid=$(xcrun simctl list devices available -j |
  python3 -c '
import json, sys
devices = json.load(sys.stdin)["devices"]
phones = [(runtime, d) for runtime, list_ in devices.items() if "iOS" in runtime
          for d in list_ if d["name"].startswith("iPhone")]
phones.sort(key=lambda item: item[0])
print(phones[-1][1]["udid"])
')
echo "Simulator: $udid"
xcrun simctl boot "$udid" || true
xcrun simctl bootstatus "$udid" -b

xcrun simctl install "$udid" "$app"
xcrun simctl launch "$udid" "$bundle"
sleep 25

# Still running after startup (no crash while loading the engine and the UI).
if ! xcrun simctl spawn "$udid" launchctl list | grep -q "$bundle"; then
  echo "::error::NZAP is not running 25 s after launch"
  xcrun simctl spawn "$udid" log show --last 2m --predicate "process == 'NZAP'" >"$out/log.txt" || true
  exit 1
fi
xcrun simctl io "$udid" screenshot "$out/launch.png"
xcrun simctl spawn "$udid" log show --last 2m --predicate "process == 'NZAP'" >"$out/log.txt" || true
echo "NZAP launched and is running."

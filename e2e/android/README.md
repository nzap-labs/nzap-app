# Android E2E

Drives the **real app** — the R8-minified release build with the CI-only
`e2e` feature — on an Android emulator, through its WebView, with
Playwright's `_android` API. The Rust engine and the native plugin are real;
Google is `nzap-mock-colab` on the host, forwarded into the emulator with
`adb reverse`.

The suite signs in through the loopback redirect, checks the Keystore store
survives a restart, launches a runtime, streams cells and `input()`, opens
the terminal, lists files, runs a public notebook, checks the keep-alive
foreground service, then releases the runtime and disconnects.

```bash
# from the repository root, with the Android SDK/NDK set up and an
# x86_64 emulator (or device) attached
npx tauri android build --apk --split-per-abi --target x86_64 --features e2e
cargo build --release -p nzap-mock-colab --bin mock-colab
scripts/android-e2e.sh "$(find src-tauri/gen/android/app/build/outputs/apk -name '*release*.apk' | head -1)"
```

`artifacts/` receives logcat, the mock's log and the service state.

The `e2e` feature (see `src-tauri/src/e2e.rs`) enables WebView debugging so
Playwright can attach, points every Google endpoint at the mock and lets the
app follow the auto-approving consent page itself. It is never part of a
shipped build: `scripts/verify-android-release.sh` fails any release APK
that contains the feature's marker.

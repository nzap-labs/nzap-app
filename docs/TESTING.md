# Testing

| Suite                  | Command                                                                                       | What it proves                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Engine                 | `cargo test -p nzap-core`                                                                     | the vendored engine against `nzap-mock-colab`, plus the mobile hooks (platform store, return page) |
| Shell + plugin (Rust)  | `cargo test -p nzap-app -p tauri-plugin-nzap-mobile`                                          | platform helpers, redaction, stream / secrets state, the plugin's argument shapes                  |
| Lints                  | `cargo clippy --workspace --all-targets -- -D warnings` (and `--features e2e` for `nzap-app`) |                                                                                                    |
| Frontend unit          | `npm test`                                                                                    | panels, dialogs, IPC layer, back-button order, terminal modifiers                                  |
| Web E2E, phones        | `npx playwright test --project=pixel-7 --project=iphone-15 …`                                 | the phone UI through touch on Pixel 7, Galaxy S8 (Chromium), iPhone 15, iPad Mini (WebKit)         |
| Web E2E, wide          | `npx playwright test --project=chromium --project=webkit`                                     | the tablet-landscape / desktop layout                                                              |
| **Android E2E**        | see [`e2e/android`](../e2e/android/README.md)                                                 | the R8 release build on an Android 14 emulator with the real engine and plugin against the mock    |
| iOS smoke              | `.github/workflows/ios.yml`                                                                   | the simulator build installs, launches and stays up                                                |
| Android release checks | `scripts/verify-android-release.sh <app/build>`                                               | signed, not debuggable, one ABI per split APK, R8 ran, no e2e build shipped                        |

In a sandbox without Playwright's own browser download, point Chromium
projects at a local build: `PW_CHROMIUM_PATH=/path/to/chrome npx playwright test`.

Real Google and Colab are never called in CI.

## Live verification checklist

Before a release, on a real Android phone and (with a signed build) an
iPhone, against a real Google account with Colab:

- [ ] **Connect Google** opens a Custom Tab / sign-in sheet; after approving,
      the tab closes by itself and NZAP shows the account
- [ ] Force-quit and reopen: still connected (Keystore / Keychain)
- [ ] **Use a code** connects too
- [ ] Create a CPU runtime and a T4 runtime (if the plan allows)
- [ ] Run a cell; `input()` prompt; interrupt a long cell; restart the kernel
- [ ] `from google.colab import drive; drive.mount('/content/drive')`: approve,
      Continue, mounted
- [ ] Terminal: type, Tab completion and Ctrl-C from the key bar, rotate the
      phone (the terminal refits)
- [ ] Files: upload a photo from the gallery and a file from Files/Drive,
      download one with **Save to…**, rename, delete
- [ ] Run a `.ipynb` and save the executed copy
- [ ] Ephemeral job with an artifact; **Share** the artifact
- [ ] Run a public notebook with a parameter; import and export your own
- [ ] Background the app for 10 minutes with a runtime: Android shows
      "Keeping 1 runtime alive"; the runtime is still there on return
- [ ] Back button: closes a sheet, then the drawer, then goes back, then
      backgrounds the app (runtimes kept alive)
- [ ] Dark mode: status bar icons stay readable
- [ ] **Settings → Share diagnostics log**: the log contains no tokens
- [ ] Release a runtime; **Disconnect** revokes access

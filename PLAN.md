# NZAP for mobile — Build Plan

`nzap-app` is the mobile edition of [NZAP Engine](https://github.com/nzap-labs/nzap-engine):
the same app, running on **Android** (arm64-v8a, armeabi-v7a, x86_64, x86) and
**iOS** (arm64 devices, arm64 + x86_64 simulators). It drives **your own Google
Colab runtimes** (CPU / GPU / TPU) from your phone or tablet: a console, a real
terminal, a file manager, parameterised notebooks and ephemeral jobs. There is
no server, no NZAP account and no database. You install one app and connect Google.

This document is the source of truth for the build. Each phase ends with a
commit and a push, green CI, and its checklist ticked here in the same commit.

---

## 1. Decisions

| Question            | Decision                                                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack               | **Tauri 2 mobile.** The Rust engine (`nzap-core`) runs on the device, and the React UI and NZAP design system are the desktop app's, adapted for touch. One codebase for Android and iOS.                                                         |
| Sharing with engine | **Vendored.** `nzap-engine` is private, so its CI-free copy lives here: `crates/nzap-core`, `crates/nzap-mock-colab` and the UI in `src/`. `VENDORED.md` records the source commit; `scripts/sync-engine.sh` re-syncs; mobile changes are marked. |
| iOS                 | CI builds for the simulator (and an unsigned device build) and launches it in a simulator. Signing and TestFlight switch on when Apple secrets exist.                                                                                             |
| Navigation          | **Bottom tab bar** in the NZAP style (Runtimes · Console · Terminal · Files · More); the sidebar becomes a drawer. "More" holds Run & jobs, Notebooks, Account and Settings.                                                                      |
| Identity            | App id `com.nzaplabs.app`, product name **NZAP**. Same brand, tokens, fonts and copy as NZAP Engine.                                                                                                                                              |

## 2. From the desktop engine to mobile

| NZAP Engine (desktop)                              | NZAP mobile                                                                                                                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tauri 2 desktop shell (`src-tauri`)                | Tauri 2 **mobile** shell: `#[tauri::mobile_entry_point]`, `gen/android` (Gradle, committed) and `gen/apple` (Xcode, generated in CI)                                           |
| OS keychain (`keyring`) + 0600 file fallback       | **Android Keystore** (AES-256-GCM key that never leaves the keystore) and **iOS Keychain** (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`), through a native plugin       |
| Loopback OAuth in the system browser               | Same PKCE loopback flow, opened in a **Custom Tab** (Android) or **ASWebAuthenticationSession** (iOS) so the app stays alive to receive the redirect; "Use a code" stays       |
| Native save dialogs (`tauri-plugin-dialog`)        | **Storage Access Framework** "Save to…" (Android) and the document exporter (iOS), plus the system **share sheet**                                                             |
| HTML file inputs and drag-and-drop for uploads     | HTML file inputs (the WebView's file chooser: files, photos, camera)                                                                                                           |
| Close-to-tray keeps runtimes alive                 | A **foreground service** with an ongoing notification keeps runtimes alive while the app is in the background (Android); iOS keeps them alive while open and resumes on return |
| Tray, single instance, window state, reveal-in-dir | Removed (no equivalent on mobile)                                                                                                                                              |
| "Open log folder"                                  | "Share diagnostics log" through the share sheet                                                                                                                                |
| Artifacts folder (Downloads/NZAP Engine)           | App-private artifacts folder; each artifact can be shared or saved with the system picker                                                                                      |
| Sidebar + pill tabs                                | Drawer + bottom tab bar, safe-area insets, 44 px touch targets, bottom-sheet dialogs, terminal key bar                                                                         |
| WebdriverIO + tauri-driver desktop E2E             | Playwright `_android` against the **R8-minified release build** on an Android emulator, pointed at `mock-colab` through `adb reverse`                                          |
| tauri-action installers                            | Split APKs per ABI + universal APK + AAB (signed), R8 mapping files, iOS simulator `.app` and unsigned device build                                                            |

Everything else — Runtimes, Console with `input()` and Drive consent, Setup,
History, Terminal, Files, Run a file, Jobs, Notebooks (public + yours), Account,
Settings — is the same feature, the same engine command and the same copy.

## 3. Architecture

```
┌──────────────────────────── NZAP (one app process) ────────────────────────────┐
│                                                                                │
│  System WebView (Android WebView / WKWebView)                                  │
│  React 19 + TS · NZAP design system · TanStack Router + Query                  │
│  mobile shell: drawer, bottom tabs, sheets, safe areas                         │
│        │ invoke(command)            ▲ Channel<event> streams                   │
│        ▼                            │                                          │
│  src-tauri (Rust, cdylib/staticlib)  — thin adapter, same commands as desktop  │
│   commands/*  state.rs  platform.rs (mobile integration)                       │
│        │                           │ run_mobile_plugin                         │
│        │                           ▼                                           │
│        │           plugins/nzap-mobile  (Kotlin + Swift)                       │
│        │            secure storage · auth session · save/share · keep-alive    │
│        ▼                                                                       │
│  crates/nzap-core (pure Rust, vendored)                                        │
│   auth · secrets (pluggable store) · colab · runtime · session · history       │
│   ops (automation, run file, jobs, import) · notebooks · settings              │
└────────────────────────────────────┬───────────────────────────────────────────┘
                                     │ HTTPS / WSS (rustls, webpki roots)
            accounts.google.com · colab.research.google.com · colab.pa.googleapis.com
            runtime proxies · Drive v3 · raw.githubusercontent.com (public notebooks)
```

Networking stays in Rust (reqwest + tokio-tungstenite with rustls and bundled
webpki roots), so it behaves identically on every ABI and needs no platform TLS.
The WebView only talks IPC; the CSP forbids any network access from the page.

### Repository layout

```
nzap-app/
├── src/                      React UI (vendored from nzap-engine, mobile shell added)
├── src-tauri/                Tauri mobile app crate
│   ├── src/                  commands, state, platform integration
│   ├── gen/android/          Gradle project (committed; R8 + signing config)
│   └── tauri.conf.json
├── plugins/nzap-mobile/      native plugin: Kotlin (android/) + Swift (ios/) + Rust
├── crates/
│   ├── nzap-core/            the engine (vendored, mobile-aware)
│   └── nzap-mock-colab/      mock Google services for tests and E2E (vendored)
├── e2e/
│   ├── web/                  Playwright: UI on phone + tablet viewports (Chromium, WebKit)
│   └── android/              Playwright _android: real app on an emulator vs mock-colab
├── scripts/                  sync-engine.sh, CI helpers
└── .github/workflows/        ci.yml, android.yml, ios.yml, release.yml
```

## 4. Mobile-specific design

### 4.1 Sign-in

1. The engine starts its one-shot loopback listener (`127.0.0.1` + `::1`, random
   port, `state` checked, 5-minute timeout) exactly as on desktop.
2. The consent URL opens in a **Custom Tab** (Android, falling back to the default
   browser) or an **ASWebAuthenticationSession** (iOS). Both are real browsers,
   which Google requires; embedded WebViews are refused by Google.
3. Google redirects to `http://localhost:<port>/callback`. The app is still in the
   foreground task, so the listener answers, then the success page sends the
   browser to `nzap://auth/done`, which closes the tab / session and returns to the app.
4. **Use a code** (paste the code from Google's page) remains the fallback.

### 4.2 Secrets

`nzap-core` gains a pluggable `SecretStore` (`EngineOptions::secret_store`).
The mobile shell supplies `PlatformSecretStore`, backed by the native plugin:
Android encrypts values with a non-exportable AES-256-GCM Keystore key and keeps
only ciphertext in private preferences (excluded from backup); iOS stores them in
the Keychain, this-device-only. The Account page reports `keychain`.

### 4.3 Background behaviour

- Android: while at least one runtime is connected and keep-alive is on, a
  foreground service (type `dataSync`, ongoing notification "Keeping N runtimes
  alive", with a Stop action) keeps the process and its keep-alive pings running.
  `POST_NOTIFICATIONS` is requested on Android 13+ the first time it is needed.
- iOS: keep-alive runs while the app is open; on return to the foreground the
  engine resumes (reconnects kernels, restarts pings). Colab's own idle timeout
  applies while the app is suspended, and Settings says so.
- On resume (`RunEvent::Resumed`) the UI refetches status, runtimes and quota.

### 4.4 Files in and out

- Upload: `<input type="file">` (the WebView's chooser) → `files_upload_bytes`.
- Download / export / artifacts: Rust writes into the app cache, then the plugin
  hands the file to **Save to…** (SAF `ACTION_CREATE_DOCUMENT` / iOS exporter) or
  the **share sheet**. File paths never come from the WebView.

### 4.5 Touch UI

- Bottom tab bar (paper background, ink hairline, sunshine active pill), safe-area
  aware (`env(safe-area-inset-*)`, edge-to-edge on Android 15+).
- Dialogs become bottom sheets under `sm`; 44 px minimum targets; no hover-only
  affordances; long-press menus in Files.
- Terminal: xterm.js with a key bar (Esc, Tab, Ctrl, Alt, arrows, `|`, `~`, `/`)
  and sticky modifiers, and a fit that follows the on-screen keyboard.
- Console: composer pinned above the keyboard; Run on Ctrl/⌘-Enter and a button.
- Android back button closes sheets, then the drawer, then navigates back.
- Tablets get the desktop layout (persistent sidebar, pill tabs) at `lg`.

## 5. Build, shrinking and ABIs

- Rust targets: `aarch64-linux-android`, `armv7-linux-androideabi`,
  `x86_64-linux-android`, `i686-linux-android`; `aarch64-apple-ios`,
  `aarch64-apple-ios-sim`, `x86_64-apple-ios`.
- Release Rust profile: LTO, `codegen-units = 1`, `opt-level = "s"`, stripped,
  `panic = "abort"`.
- **R8**: full mode, `minifyEnabled` + `shrinkResources` on release, keep rules for
  Tauri/wry JNI and plugin classes (reflection and `@Command`/`@InvokeArg`),
  `mapping.txt` uploaded with every build; `-printusage`/`-printconfiguration`
  reports kept as CI artifacts.
- Split APKs per ABI (version code = base × 10 + ABI index) + a universal APK + an AAB.
- Signing: a release keystore from secrets (`ANDROID_KEYSTORE_BASE64`, …); without
  them CI signs with an ephemeral key so the build is still installable and testable.

## 6. Testing strategy

| Layer               | Tooling                                                | What it proves                                                                                                                                       |
| ------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core unit + integr. | `cargo test` + `nzap-mock-colab`                       | the vendored engine (135+ checks) plus the mobile changes (pluggable secret store, deep-link return page)                                            |
| Shell               | `cargo test -p nzap-app`                               | command wiring, platform store, stream cancel, URL policy                                                                                            |
| Native plugin       | Gradle unit tests (JVM) + Robolectric-free pure-Kotlin | Keystore envelope format, argument parsing, notification text                                                                                        |
| Frontend unit       | Vitest + Testing Library                               | mobile shell (tabs, drawer, back handling), sheets, terminal key bar, every panel                                                                    |
| Web E2E             | Playwright on Pixel 7, iPhone 15 and iPad viewports    | every workspace flow through touch, on Chromium and WebKit, against the simulated engine                                                             |
| **Android E2E**     | Playwright `_android` on an API 34 emulator (x86_64)   | the **R8-minified release APK** with the real Rust engine against `mock-colab`: sign-in, runtime, cells, `input()`, terminal, files, notebooks, stop |
| iOS smoke           | `xcrun simctl` on a simulator                          | the app installs, launches, renders and survives                                                                                                     |

The Android E2E build is the release build plus the `e2e` cargo feature, which
turns on WebView debugging (so Playwright can attach), points the engine at
`http://127.0.0.1:<port>` (forwarded to the host's mock with `adb reverse`) and
lets the app "play the browser" for the auto-approving mock consent screen. The
shipped release never contains the feature; CI asserts that.

## 7. CI/CD (GitHub Actions)

- `ci.yml` (push, PR): frontend lint / format / typecheck / Vitest / build; Rust fmt,
  clippy (`-D warnings`) and tests; web E2E on mobile viewports; npm + cargo audit.
- `android.yml` (push, PR): build the release APKs/AAB for all four ABIs with R8,
  upload APKs + mapping; build the E2E APK and run the emulator suite.
- `ios.yml` (push, PR): Rust iOS targets, `tauri ios init`, simulator build,
  launch smoke test, unsigned device build.
- `release.yml` (tag `v*`): signed artefacts attached to a draft GitHub Release.
- Dependabot for cargo, npm, gradle and actions.

## 8. Phases

Each phase ends with a commit and a push, and CI green on the branch.

### Phase 0 — Plan & foundation

- [x] Research the engine and Tauri 2 mobile (templates, R8 defaults, WebView file chooser, WebView debugging, Info.ios.plist merge)
- [x] This plan, README, SECURITY, CONTRIBUTING, templates
- [x] Vendor `nzap-core`, `nzap-mock-colab` and the UI from nzap-engine (`VENDORED.md`, `scripts/sync-engine.sh`)
- [x] CI: frontend checks + Rust fmt / clippy / tests

### Phase 1 — Mobile engine & Tauri mobile shell

- [x] `nzap-core`: pluggable `SecretStore`, keychain feature off on mobile, deep-link return on the loopback success page
- [x] `src-tauri`: mobile entry point, every desktop command ported (desktop-only ones replaced), mobile config and CSP
- [x] `gen/android` committed: app id, icons, theme, edge-to-edge, R8 release config and keep rules, ABI splits
- [x] CI: Android release build (4 ABIs, R8) with APK + mapping artifacts

### Phase 2 — Native plugin

- [x] `plugins/nzap-mobile`: Kotlin + Swift + Rust bindings
- [x] Secure storage (Android Keystore / iOS Keychain) wired as the engine's secret store
- [x] Auth session (Custom Tabs / ASWebAuthenticationSession) + `nzap://` return
- [x] Save to… and share sheet for downloads, exports, artifacts and logs
- [x] Keep-alive foreground service + notification permission
- [x] Plugin unit tests (JVM) and Rust tests

### Phase 3 — Mobile UI

- [x] Mobile shell: drawer, bottom tab bar, "More" sheet, safe areas, Android back handling
- [x] Bottom-sheet dialogs, touch targets, no hover-only actions
- [x] Terminal key bar and keyboard-aware fit; console composer
- [x] Mobile copy (save/share, background keep-alive, diagnostics)
- [x] Vitest suites for the new pieces; simulated engine gains the mobile commands

### Phase 4 — Web E2E on mobile viewports

- [x] Playwright projects: Pixel 7 (Chromium), iPhone 15 (WebKit), iPad (WebKit)
- [x] Every workspace flow through the bottom tabs, plus accessibility checks
- [x] Wired into CI

### Phase 5 — Android E2E on the R8 release build

- [x] `e2e` feature (WebView debugging, mock endpoints, auto consent)
- [x] Emulator job: mock-colab + `adb reverse` + Playwright `_android`
- [x] Full flow: sign-in, runtime, cells, `input()`, terminal, files, notebook, stop, disconnect
- [x] Guard: the shipped release APK is not debuggable and has no WebView debugging

### Phase 6 — Release pipeline & iOS

- [x] Signing from secrets (ephemeral key otherwise), version codes per ABI, AAB
- [x] `release.yml`: draft release with APKs, AAB, mapping and checksums (same build steps as the green Android/iOS jobs; not yet run on a real tag)
- [x] iOS: simulator build, launch smoke test, unsigned device build

### Phase 7 — Hardening & docs

- [x] Security review (IPC surface, exported components, backup rules, network security config, logging)
- [x] Accessibility pass (labels, focus, 44 px targets, reduced motion); a TalkBack / VoiceOver run on hardware is in the live checklist (`docs/TESTING.md`)
- [x] Docs: INSTALL, ARCHITECTURE, TESTING (with a live checklist), RELEASING, TROUBLESHOOTING

Status: phases 0–7 are complete and every CI workflow is green (frontend, Rust, audit, web E2E on
Pixel 7 / Galaxy S8 / iPhone 15 / iPad mini, Android release build for four ABIs with R8, the R8
e2e APK on an Android 14 emulator, and the iOS simulator build with launch smoke test). Still open:
the live checklist in `docs/TESTING.md` on real devices with a real Google account, and the first
tagged release with the keystore secrets configured.

### Audit (2026-10-07) — where the app stands

Measured locally (no CI minutes spent):

| Check                                        | Result                                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| ESLint, Prettier, `tsc`                      | clean                                                                         |
| Vitest                                       | 40 / 40                                                                       |
| Web E2E, Chromium (Pixel 7, Galaxy S8, wide) | 44 / 44                                                                       |
| Web E2E, WebKit (iPhone, iPad, Safari)       | not runnable in the cloud sandbox (WebKit download blocked); runs on a laptop |
| Android emulator E2E, iOS simulator          | need KVM / macOS; run on a workstation or by manual `workflow_dispatch`       |

Findings, most important first:

1. **The UI is a release behind the engine.** `src/` was vendored at `e63d98e`; nzap-engine has
   since shipped phase 10 (Apps), phase 11 (the NZAP Labs monochrome "chrome" brand: NZ mark,
   NZΛP wordmark, ink-on-paper palette, brushed-metal primary buttons), phase 12 (in-app
   updates) and `nzap://` links. The phone app still shows the old cream paper, the yellow
   "sunshine" accent and the sparkle logo, so the two products no longer look like one.
2. **Apps are missing on mobile** (`/apps` falls back to Colab) — the engine's headline feature.
3. **Native chrome is off-brand**: Android `colors.xml` / `themes.xml` use the old palette (yellow
   `colorPrimary`, cream window background shown before the WebView paints) and the launcher /
   iOS icons are the old sparkle.
4. **Phone ergonomics**: once connected, the Google Auth card (three stacked stat tiles) fills
   the whole first screen of Runtimes, pushing "New runtime" and the runtime list below the fold.
5. **CI cost**: Android (2 × ~60 min Linux) and iOS (macOS, 10× minute multiplier) run on every
   pull request. Docs-only changes run everything.

### Phase 8 — Save CI minutes; one local check command

- [ ] `scripts/check.sh`: lint, format, typecheck, Vitest, build, Chromium web E2E, Rust fmt / clippy / tests — what CI runs, locally
- [ ] Android and iOS workflows: `main` + manual dispatch only (not every PR); drop stale `ccr-*`/`phase-*` triggers
- [ ] CI skips docs-only changes (`paths-ignore`)

### Phase 9 — Re-sync with nzap-engine (brand, Apps, updates, links)

- [ ] `scripts/sync-engine.sh --apply` to engine `HEAD`; resolve conflicts keeping every `mobile:` edit
- [ ] Brand: monochrome tokens, chrome fills, NZ mark + wordmark in the header, drawer and onboarding
- [ ] Mobile-only CSS (safe areas, sheets, touch) kept on top of the new tokens
- [ ] Desktop-only pieces (in-app updater, desktop deep-link plugin) are stubbed on mobile: stores update the app

### Phase 10 — Apps on the phone

- [ ] `/apps` and `/apps/$appId` routes; Apps in the More sheet and drawer
- [ ] App page laid out for phones (form, progress and outputs stacked; media fits the width)
- [ ] CSP: `blob:` for media and waveform decoding, as on desktop
- [ ] Web E2E on phone viewports: open an app, run it, see outputs

### Phase 11 — Native brand

- [ ] Android `colors.xml` / `themes.xml` (day + night) on the new palette; status / nav bar contrast
- [ ] Launcher icons (adaptive) and iOS icons from the engine's `brand/app-icon-1024.png`

### Phase 12 — Phone UX polish

- [ ] Compact connection card on phones once connected (one-line summary, details on tap)
- [ ] Screenshot review of every page on Pixel 7 and Galaxy S8 in light and dark; fix overflow / spacing

### Phase 13 — Docs and pin

- [ ] VENDORED.md pinned to the new engine commit with the new local changes listed
- [ ] TESTING.md: `scripts/check.sh`, how to run the Android / iOS workflows on demand

## 9. Risks

| Risk                                                   | Mitigation                                                                                                      |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Colab's internal endpoints change                      | Same as desktop: one endpoint module, mock contract tests, raw status surfaced                                  |
| Google restricts the built-in (Cloud SDK) OAuth client | Bring-your-own Desktop client in Settings (paste JSON), as on desktop                                           |
| The OS suspends the app during sign-in                 | Custom Tab / ASWebAuthenticationSession keep the app in the foreground task; "Use a code" fallback              |
| Android kills background work                          | Foreground service while runtimes are kept alive; resume-and-reconnect on return                                |
| R8 strips classes reached by reflection or JNI         | Keep rules for Tauri, wry and the plugin; the E2E suite runs against the minified build                         |
| No Apple signing identity                              | Simulator + unsigned device builds; signing steps activate when secrets are set                                 |
| Vendored code drifts from nzap-engine                  | `VENDORED.md` pins the source commit; `sync-engine.sh` diffs and re-syncs; mobile edits are marked `// mobile:` |

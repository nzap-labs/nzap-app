# NZAP for mobile

**Your own Google Colab runtimes, from your phone.**

NZAP for mobile is the Android and iOS edition of
[NZAP Engine](https://github.com/nzap-labs/nzap-engine). It allocates and drives
the Colab VMs that belong to _your_ Google account (CPU, GPU and TPU) and gives
you a console, a real terminal, a file manager, parameterised notebooks and
ephemeral jobs. There is no server, no NZAP account and no database: install
the app and connect Google.

> **Status: in development.** [PLAN.md](./PLAN.md) has the design, the phases
> and what is done.

## What it does

The same features as the desktop app, built for touch:

- **Connect Google once.** OAuth with PKCE in a secure browser tab. The refresh
  token is encrypted by the Android Keystore / stored in the iOS Keychain and
  never reaches the UI.
- **Runtimes.** Assign CPU / T4 / L4 / G4 / A100 / H100 / TPU v5e / v6e, with
  optional High-RAM, then keep them alive (also in the background on Android),
  restart, interrupt and release them. Runtimes created elsewhere can be imported.
- **Console.** Streaming cell output, `input()` prompts, and Drive / Google Cloud
  consent that pauses the cell and resumes it after you approve.
- **Terminal.** A real shell on the VM, with a key bar for Esc, Tab, Ctrl and arrows.
- **Files.** Browse, edit, upload (files, photos, camera), download, share,
  rename, create and delete.
- **Run.** Run a `.py`/`.ipynb` (or a Colab / Drive / GitHub link) and get the
  executed notebook back, or launch an ephemeral job on a fresh VM.
- **Notebooks.** The public collection plus your own, with typed parameters.
- **Compute units, history, settings** — as on desktop.

## Supported devices

| Platform | Versions                                              | CPU architectures                                           |
| -------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| Android  | 7.0 (API 24) and up, with Android System WebView 111+ | arm64-v8a, armeabi-v7a, x86_64, x86 (per-ABI and universal) |
| iOS      | 16.4 and up                                           | arm64 devices; arm64 and x86_64 simulators                  |

## How it works

```
NZAP (one app)
├─ WebView: React UI  ──IPC──►  Tauri mobile shell  ──►  nzap-core (Rust, on device)
│                                     │
│                                     └─► native plugin (Kotlin / Swift):
│                                         Keystore/Keychain, auth tab, save/share, keep-alive
└──────────────────────────────────────────────────────┬───────────
                                        HTTPS / WSS to Google Colab,
                                        your runtimes, Drive, GitHub
```

## Documentation

| Guide                                           | For                                                |
| ----------------------------------------------- | -------------------------------------------------- |
| [INSTALL.md](./docs/INSTALL.md)                 | installing on Android and iOS, where data lives    |
| [OAUTH.md](./docs/OAUTH.md)                     | how sign-in works, using your own OAuth client     |
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md)       | how the pieces fit, platform integration, IPC      |
| [TESTING.md](./docs/TESTING.md)                 | the test suites and the live checklist             |
| [RELEASING.md](./docs/RELEASING.md)             | tagging releases, Android signing, R8, iOS signing |
| [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) | common problems                                    |
| [SECURITY.md](./SECURITY.md)                    | threat model and reporting vulnerabilities         |
| [VENDORED.md](./VENDORED.md)                    | code shared with NZAP Engine and how to re-sync it |

## Development

Prerequisites: Node 22+, Rust stable, and for device builds the
[Tauri mobile prerequisites](https://v2.tauri.app/start/prerequisites/#configure-for-mobile-targets)
(Android Studio SDK + NDK, JDK 17+; Xcode on macOS for iOS).

```bash
npm install
npm run dev              # the UI in a browser against a simulated engine (no Rust needed)
npm run android:dev      # on a connected device or emulator
npm run android:build    # release APKs + AAB (R8-minified)
npm run ios:dev          # macOS only
```

| Command                                                 | What it does                               |
| ------------------------------------------------------- | ------------------------------------------ |
| `npm run lint` / `typecheck` / `test`                   | frontend checks and component tests        |
| `npx playwright test`                                   | web E2E on phone and tablet viewports      |
| `cargo test --workspace`                                | engine unit and integration tests          |
| `cargo clippy --workspace --all-targets -- -D warnings` | Rust lints                                 |
| see [`e2e/android`](./e2e/android/README.md)            | E2E on an emulator against the release APK |

Layout: `src/` (React UI), `src-tauri/` (mobile shell and `gen/android`),
`plugins/nzap-mobile/` (Kotlin + Swift), `crates/nzap-core` (the engine),
`crates/nzap-mock-colab` (mock Google services), `e2e/`. Code shared with the
desktop app is vendored; see [VENDORED.md](./VENDORED.md).

## Disclaimer

NZAP is not affiliated with or endorsed by Google. It uses the same endpoints as
Google's Colab clients, and those are internal APIs that may change without
notice. Your use of Colab is governed by Google's terms.

## License

[Apache-2.0](./LICENSE)

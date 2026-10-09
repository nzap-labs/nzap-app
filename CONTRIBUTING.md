# Contributing to NZAP for mobile

Thanks for helping. This guide keeps changes easy to review and safe to ship.

## Ground rules

- **Be kind.** See the [Code of Conduct](./CODE_OF_CONDUCT.md).
- **Security issues are private.** Follow [SECURITY.md](./SECURITY.md) and do not open a public issue.
- **Never commit secrets.** No tokens, runtime-proxy URLs, keystores, OAuth client
  secrets of your own, or personal data, including in tests and fixtures.

## Getting set up

1. Install Node 22+ and Rust stable.
2. For device builds, install the [Tauri mobile prerequisites](https://v2.tauri.app/start/prerequisites/#configure-for-mobile-targets).
3. Run `npm install`, then `npm run dev` (browser) or `npm run android:dev`.

## Before you open a PR

```bash
scripts/check.sh            # everything CI's main workflow runs (add --quick for frontend only)
```

GitHub Actions minutes are limited, so run the checks locally and push when
they pass. On pull requests CI runs the frontend, Rust, audit and web E2E jobs
(not for docs-only changes). The Android workflow (R8 release for four ABIs,
emulator E2E) and the iOS workflow (simulator build and launch, on macOS, which
bills at 10x) run on `main` and on demand: start them from the Actions tab
(**Run workflow** on your branch) when a change touches native code, the
Gradle / Xcode projects, the plugin or `src-tauri`.

## Where things go

- UI: `src/` — the mobile shell lives in `src/features/shell/`.
- IPC commands: `src-tauri/src/commands/` — add each new command to
  `src/dev/fake-engine.ts` too, so the browser build and tests know it.
- Native code: `plugins/nzap-mobile/android` (Kotlin) and `plugins/nzap-mobile/ios` (Swift).
  Anything reached by reflection or JNI needs an R8 keep rule.
- Engine: `crates/nzap-core/` is vendored from nzap-engine. Prefer fixing it
  upstream; mark local edits `mobile:` and list them in [VENDORED.md](./VENDORED.md).

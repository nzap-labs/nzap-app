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
npm run lint && npm run format:check && npm run typecheck && npm test
npx playwright test
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

CI also builds the Android release (R8) for all four ABIs, runs the emulator
E2E suite against it, and builds and launches the iOS app in a simulator.

## Where things go

- UI: `src/` — the mobile shell lives in `src/features/shell/`.
- IPC commands: `src-tauri/src/commands/` — add each new command to
  `src/dev/fake-engine.ts` too, so the browser build and tests know it.
- Native code: `plugins/nzap-mobile/android` (Kotlin) and `plugins/nzap-mobile/ios` (Swift).
  Anything reached by reflection or JNI needs an R8 keep rule.
- Engine: `crates/nzap-core/` is vendored from nzap-engine. Prefer fixing it
  upstream; mark local edits `mobile:` and list them in [VENDORED.md](./VENDORED.md).

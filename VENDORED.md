# Vendored code

`nzap-engine` is private, so this repository carries its own copy of the parts
the mobile app shares with the desktop app. CI never needs access to the engine
repository.

| Here                      | From `nzap-labs/nzap-engine` | Notes                                           |
| ------------------------- | ---------------------------- | ----------------------------------------------- |
| `crates/nzap-core/`       | `crates/nzap-core/`          | the engine; mobile changes are marked `mobile:` |
| `crates/nzap-mock-colab/` | `crates/nzap-mock-colab/`    | mock Google services for tests and E2E          |
| `src/`                    | `src/`                       | the React UI; the mobile shell is added here    |
| `e2e/web/`                | `e2e/web/`                   | web E2E, extended with mobile viewports         |
| `public/`                 | `public/`                    |                                                 |

**Source commit:** `16e70c0c53c9e9f5a43b103174166acf7ef3505b`
(nzap-engine `main`, "build: Cargo.lock for the deep-link plugin; docs for nzap:// links": Apps,
the NZAP Labs brand, in-app updates and `nzap://` links).

## Local changes

Every change to vendored code carries a `mobile:` comment (Rust and TS) so a
re-sync can find and replay it. They are listed here as they land:

- `crates/nzap-core/src/auth/loopback.rs`: `LoopbackServer::with_return_url`; the
  finished page sends the browser to the app's deep link (`nzap://auth/done`).
- `crates/nzap-core/src/auth/manager.rs`: `AuthManager::set_return_url`.
- `crates/nzap-core/src/engine.rs`: `EngineOptions::secret_store` (platform
  Keystore / Keychain store) and `EngineOptions::return_url`.
- `crates/nzap-core/tests/engine.rs`: the new options, and a test that a platform
  store holds the connection.
- `crates/nzap-core/src/auth/manager.rs`: `AuthManager::reload_secrets` (Android
  Keystore secrets load after startup), with a test in `tests/auth_flow.rs`.
- `src/`: the phone shell (`features/shell/bottom-nav.tsx`, `back-button.ts`,
  `components/ui/sheet.tsx`), route-driven workspace tabs
  (`features/colab/workspace-tabs.ts`), the terminal key bar, bottom-sheet
  dialogs, safe areas, platform wording (`lib/platform.ts`), notebook import from
  file text, and the simulated engine's phone behaviour.
- `e2e/web/console.spec.ts`: an exact match for `42` (it matched timestamps).
- `src/features/updates/` is not vendored: phones update through the store or a
  release APK, so the shell and Settings do not mount the desktop updater.
- `src/features/deep-links/deep-links.tsx`: only `parseDeepLink`; the desktop
  listener (`tauri-plugin-deep-link`) waits for the plugin's mobile setup.
- `src/components/logo.tsx`: "Mobile" under the wordmark instead of "Engine".
- `src/features/colab/notebooks-panel.tsx`: notebook actions wrap on narrow phones.
- `src-tauri/tauri.conf.json` follows the engine's CSP (`blob:` for app media).
- `Cargo.toml`: the workspace `nzap-core` dependency has `default-features = false`
  (no desktop keychain on mobile).

## Re-syncing

```bash
# with nzap-engine checked out next to this repository
scripts/sync-engine.sh ../nzap-engine          # show what changed upstream
scripts/sync-engine.sh ../nzap-engine --apply  # copy it over, then review `git diff`
```

The script diffs the engine at its current `HEAD` against the pinned commit,
applies only the upstream changes (as a patch, so local `mobile:` edits survive
where they do not conflict) and updates the source commit above.

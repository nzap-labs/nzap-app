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

**Source commit:** `e63d98e1cfcdd1b457b04b189c92e2b6fb8e5e27`
(nzap-engine `main`, "phases 7–9 — end-to-end tests, packaging & releases, hardening & docs").

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

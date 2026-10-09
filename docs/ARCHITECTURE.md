# Architecture

NZAP for mobile is one app process: the React UI in the system WebView, the
Rust engine behind it, and a small native plugin for what only Kotlin or
Swift can do. There is no server, database or account system. Google Colab
provides the compute; GitHub hosts the public notebooks.

```
 WebView (React 19, TanStack Router + Query)          ─ src/
   phone shell: drawer, bottom tab bar, sheets, safe areas
    │  invoke(command, args)          ▲  Channel<event>  (streams)
    ▼                                 │
 src-tauri — the shell: commands/*, state.rs, platform.rs, redact.rs, e2e.rs
    │                      │ run_mobile_plugin (Rust → native only)
    │                      ▼
    │        plugins/nzap-mobile — Kotlin (android/) + Swift (ios/)
    │          Keystore secrets · Custom Tab / ASWebAuthenticationSession ·
    │          Save to… / share sheet · keep-alive service · system bars
    ▼
 crates/nzap-core — the engine (vendored from nzap-engine, see VENDORED.md)
    auth · secrets · colab · runtime · session · history · ops · notebooks
    │
    ▼  HTTPS / WSS (rustls + bundled webpki roots)
 accounts.google.com · colab.research.google.com · colab.pa.googleapis.com
 runtime proxies · Drive v3 · raw.githubusercontent.com
```

## Boundaries

**The webview holds no secrets and no paths.** Tokens never cross IPC. The
UI sees an identity and a status. Files leave the app only through the
system: Rust writes into `cache/share/` and the plugin hands the file to the
document picker or the share sheet. `reveal_path` accepts only files inside
the app's own folders.

**The plugin grants the webview nothing.** Its commands are invoked from Rust
(`NzapMobileExt::nzap_mobile()`), so no capability can reach them from the
page. The webview's capability is `core:default`.

**Networking stays in Rust.** reqwest and tokio-tungstenite with rustls and
bundled roots behave the same on every ABI and do not depend on the
platform's TLS stack or network security config. The CSP forbids network
access from the page.

**`nzap-core` has no Tauri dependency** and is tested with plain `cargo test`
against `nzap-mock-colab`. Mobile changes to it are marked `mobile:`.

## Platform integration (`src-tauri/src/platform.rs`)

| Need                  | Android                                  | iOS                        | desktop (dev) |
| --------------------- | ---------------------------------------- | -------------------------- | ------------- |
| secrets               | AES-256-GCM, key in the Android Keystore | Keychain (`keyring`)       | 0600 file     |
| sign-in browser       | Custom Tab                               | ASWebAuthenticationSession | browser       |
| saving a file         | Storage Access Framework "Save to…"      | document exporter          | save dialog   |
| handing out a file    | share sheet via FileProvider             | share sheet                | file manager  |
| background keep-alive | `dataSync` foreground service            | resume on return           | —             |
| back button           | sheet → drawer → back → background       | —                          | —             |

### Android secrets load after startup

Plugin calls run on the Android UI thread, so the engine cannot read the
Keystore synchronously while the app is being set up. `platform::start`
loads every secret once setup returns, then `AuthManager::reload_secrets`
picks up the connection and `auth_status` (the first thing the UI asks)
waits until that is done. Writes block on a worker thread, never the UI thread.

### Sign-in

1. The engine binds its one-shot loopback listener (`127.0.0.1`/`::1`, random
   port, single-use `state`, PKCE S256, 5-minute timeout).
2. The consent page opens in a Custom Tab / ASWebAuthenticationSession: real
   browsers that keep the app in the foreground task, so it can answer.
3. Google redirects to `http://localhost:<port>/callback`; the engine
   exchanges the code, and the page sends the browser to `nzap://auth/done`,
   which closes the tab and returns to the app.
4. **Use a code** is the fallback.

### Background keep-alive

With keep-alive and "Keep runtimes alive in the background" on (the desktop's
close-to-tray setting, on by default on phones) and at least one runtime,
Android runs a foreground service with an ongoing notification so the
process — and its pings to Colab — survive in the background. The shell
syncs it when runtimes change, when the app goes to the background and every
15 s. iOS suspends apps; NZAP re-checks runtimes when it comes back.

### Logs

Every log line goes through `redact.rs` (query tokens, `Bearer`, OAuth
fields, `ya29.`/`1//` credentials) before it reaches logcat or the log file
that **Settings → Share diagnostics log** hands out.

## IPC conventions

As on desktop: commands are `snake_case`, arguments camelCase JSON, errors
`{ code, message, status? }`, streams through `Channel` with a `streamId` for
`stream_cancel`. Mobile additions: `app_set_theme`, `app_minimize`, and
`notebook_import` takes the file's text.

## The simulated engine

`src/dev/fake-engine.ts` implements every command in memory. It powers
`npm run dev`, the Vitest suites and the Playwright web suites. On touch
devices it answers like a phone (file names after saves, shares recorded).

# Security Policy

## Reporting a vulnerability

Please report vulnerabilities **privately** through
[GitHub Security Advisories](https://github.com/nzap-labs/nzap-app/security/advisories/new).
Do not open a public issue. We aim to acknowledge reports within 3 working days
and to ship a fix or mitigation for confirmed issues as quickly as their severity requires.

Only the latest release is supported with security fixes.

## What the app protects

NZAP acts with the Google account you connect. The assets it guards are:

| Asset                      | Where it lives                                                                                         | Protection                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Google refresh token       | Android: ciphertext in private storage, key in the Android Keystore · iOS: Keychain (this device only) | never sent to the WebView, never logged, excluded from backup |
| Google access token        | process memory                                                                                         | short-lived, refreshed ahead of expiry, never logged          |
| Runtime proxy tokens       | `sessions.json` in the app's private data directory                                                    | VM-scoped and short-lived; never sent to the WebView          |
| Your notebooks and history | app's private data directory                                                                           | local only; nothing is uploaded except to your own runtime    |

## Design decisions

- **No listening server.** The UI talks to the engine over Tauri IPC, restricted
  by capabilities. The only socket is the OAuth loopback listener: bound to
  loopback, ephemeral port, one request, closed after use or after 5 minutes.
- **OAuth with PKCE (S256)** and a single-use `state`, in a Custom Tab /
  ASWebAuthenticationSession (never an embedded WebView).
- **Strict CSP.** No remote scripts and no network access from the page. The
  external opener only accepts `https:` URLs.
- **Files leave the app only through the system.** Downloads and exports go
  through the system "Save to…" picker or share sheet; the WebView never supplies
  a file path.
- **Android hardening.** Only the launcher activity is exported; cleartext traffic
  is off; backups exclude secrets and runtime tokens; release builds are
  R8-minified, not debuggable, and have WebView debugging off.
- **Input confinement.** Session names are validated. File operations go through
  the runtime's Jupyter contents API only. URL import rejects private, loopback
  and link-local targets and caps downloads at 20 MB. User values embedded in
  generated Python are always Python string literals.
- **Public notebooks** are fetched from GitHub over HTTPS and verified against
  the SHA-256 digests in the catalog. They run on your Colab VM, never on your device.
- **No telemetry.** Network traffic goes only to Google (accounts, Colab, Drive,
  your runtimes) and GitHub (the notebook catalog).
- **Supply chain.** `Cargo.lock`, `package-lock.json` and the Gradle wrapper are
  committed; CI builds with `--locked` and runs `cargo audit` and `npm audit`.

## Known limits

- Colab's endpoints are internal APIs used by Google's own clients. They may
  change, and NZAP cannot guarantee their behaviour.
- Anyone with your unlocked device can use the stored Google connection, as with
  any app that remembers a sign-in. Use **Account → Disconnect** to revoke it,
  and [Google account permissions](https://myaccount.google.com/permissions) to
  revoke it everywhere.

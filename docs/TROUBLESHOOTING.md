# Troubleshooting

**The app shows a blank screen (Android).** Update **Android System WebView**
(and Chrome) from the Play Store. NZAP needs WebView 111 or later.

**Connect Google never finishes.** Finish the sign-in in the tab that opens;
it closes by itself and returns to NZAP. If your browser cannot return to
the app (some browsers without Custom Tabs support), cancel and use
**Use a code**.

**`invalid_client` / `unauthorized_client` when signing in.** Google has
restricted the built-in client; use your own Desktop OAuth client
([OAUTH.md](./OAUTH.md#the-built-in-client-and-your-own)).

**Runtimes stop while the phone is locked.** On Android, check that
**Settings → Keep runtimes alive in the background** is on and that
notifications are allowed for NZAP (the keep-alive notification is what
keeps it running). Some manufacturers also kill background apps
aggressively: set NZAP's battery usage to **Unrestricted**. Android 15 limits
this kind of background work to 6 hours a day. iOS pauses apps in the
background; NZAP reconnects when you open it, and Colab's own idle timeout
applies meanwhile.

**Colab says too many runtimes.** Release one from **Runtimes**, or import and
release runtimes created elsewhere (**Runtimes → Runtimes in your account**).

**The terminal does not show the keyboard.** Tap inside the black terminal area.
The key bar under it has Esc, Tab, Ctrl, Alt and arrows.

**Reporting a problem.** **Settings → Share diagnostics log** shares a copy of
the app log with tokens redacted. Attach it to an
[issue](https://github.com/nzap-labs/nzap-app/issues/new/choose) — check it
first; never post tokens.

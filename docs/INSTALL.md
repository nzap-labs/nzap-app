# Installing NZAP

## Android

Download an APK from [Releases](https://github.com/nzap-labs/nzap-app/releases):

| File                        | Devices                                            |
| --------------------------- | -------------------------------------------------- |
| `…-android-arm64-v8a.apk`   | almost every phone and tablet from the last decade |
| `…-android-armeabi-v7a.apk` | older 32-bit devices                               |
| `…-android-x86_64.apk`      | Chromebooks and emulators                          |
| `…-android-x86.apk`         | older 32-bit emulators                             |
| `…-android-universal.apk`   | any of the above (larger download)                 |

Open the APK and allow installing from your browser or file manager when
Android asks. Requirements: Android 7.0+ with an up-to-date **Android System
WebView** (version 111 or later; update it from the Play Store if the app
shows a blank screen).

On first use NZAP asks to show notifications (Android 13+). They are used
only for the "Keeping runtimes alive" notification; you can decline and
turn background keep-alive off in **Settings**.

## iOS

Releases include an **unsigned** IPA (`…-ios-unsigned.ipa`) until NZAP is on
the App Store. Sign it with your own Apple developer certificate (for
example with Xcode or a re-signing tool), or build from source:

```bash
npm install
npx tauri ios init
npx tauri ios dev        # on a connected device or a simulator
```

Requires iOS 16.4 or later. `…-ios-simulator.app.zip` runs in the iOS Simulator.

## Where things are stored

Everything stays in the app's private storage and is removed when you
uninstall it:

| What                         | Where                                                              |
| ---------------------------- | ------------------------------------------------------------------ |
| Google refresh token         | Android: encrypted with an Android Keystore key · iOS: Keychain    |
| Runtimes, history, notebooks | app data directory                                                 |
| Job artifacts                | app data directory (`artifacts/`); share them from the job         |
| Settings                     | app config directory                                               |
| Logs                         | app log directory; **Settings → Share diagnostics log** (redacted) |

Backups are off: a restored copy could not decrypt the Keystore-protected
token anyway.

## Uninstalling

Uninstall like any app. To also revoke NZAP's access at Google, use
**Account → Disconnect** first, or
[Google account permissions](https://myaccount.google.com/permissions).

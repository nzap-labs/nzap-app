# tauri-plugin-nzap-mobile

NZAP's native integration for Android (Kotlin, `android/`) and iOS (Swift,
`ios/`). The Rust API in `src/lib.rs` is used only by the app shell; the plugin
grants the webview no commands.

| Call            | Android                                             | iOS                          |
| --------------- | --------------------------------------------------- | ---------------------------- |
| secrets         | AES-256-GCM, key in the Android Keystore            | — (Keychain via `nzap-core`) |
| `openAuthUrl`   | Custom Tab                                          | `ASWebAuthenticationSession` |
| `saveFile`      | `ACTION_CREATE_DOCUMENT` (Storage Access Framework) | document exporter            |
| `shareFile`     | `ACTION_SEND` through the app's `FileProvider`      | `UIActivityViewController`   |
| `setKeepAlive`  | `dataSync` foreground service + notification        | no-op                        |
| `setSystemBars` | light / dark bar icons                              | no-op                        |

JVM unit tests: `src-tauri/gen/android/gradlew -p src-tauri/gen/android :tauri-plugin-nzap-mobile:testDebugUnitTest`.

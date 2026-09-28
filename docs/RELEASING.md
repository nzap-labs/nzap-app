# Releasing

1. Bump `version` in `src-tauri/tauri.conf.json` and `package.json` (X.Y.Z).
2. Update the changelog in the release notes as needed and merge to `main`.
3. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. `.github/workflows/release.yml` builds everything and opens a **draft**
   GitHub Release with the files and `SHA256SUMS.txt`. Check it, then publish.

`workflow_dispatch` on the same workflow builds all artefacts without
publishing (a dry run).

## Version codes

The version code base is `X*10000 + Y*100 + Z`; Gradle multiplies it by 10
and adds the ABI (`1` armeabi-v7a, `2` arm64-v8a, `3` x86, `4` x86_64; `0`
universal and AAB), so every APK upgrades cleanly and stores prefer the most
specific one.

## Android signing

Create a release keystore once and keep it safe — every future update must
be signed with it:

```bash
keytool -genkeypair -v -keystore nzap-release.jks -alias nzap \
  -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 nzap-release.jks   # → ANDROID_KEYSTORE_BASE64
```

Repository secrets:

| Secret                      | Value                                |
| --------------------------- | ------------------------------------ |
| `ANDROID_KEYSTORE_BASE64`   | the keystore, base64-encoded         |
| `ANDROID_KEYSTORE_PASSWORD` | its password                         |
| `ANDROID_KEY_ALIAS`         | the key alias (`nzap` above)         |
| `ANDROID_KEY_PASSWORD`      | the key password (defaults to above) |

Without them the release is signed with a throwaway debug key and the
release notes say so. Locally, put the same values in
`src-tauri/gen/android/keystore.properties` (`storeFile`, `storePassword`,
`keyAlias`, `keyPassword`; git-ignored) or the `NZAP_KEYSTORE_*` variables.

For Google Play, upload the `.aab` and enable Play App Signing; upload the
R8 mapping zip so Play shows readable stack traces.

## R8

Release builds are shrunk, optimised and obfuscated by R8 with resource
shrinking (`app/build.gradle.kts`, `optimization { enable = true }`). Keep
rules live in `app/proguard-rules.pro` and the plugin's `consumer-rules.pro`.
Every CI build uploads `mapping.txt`, `usage.txt` (what was removed) and the
merged configuration; the Android E2E suite runs against the minified build,
so a missing keep rule fails CI.

## iOS

Releases currently ship an unsigned IPA and a simulator build. To sign in
CI, add a distribution certificate and provisioning profile (or App Store
Connect API credentials, which `tauri ios build` reads from
`APPLE_API_KEY`, `APPLE_API_ISSUER` and `APPLE_API_KEY_PATH`) and set
`APPLE_DEVELOPMENT_TEAM`; then drop `--no-sign` and use
`--export-method app-store-connect` in `release.yml`.

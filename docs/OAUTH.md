# Google sign-in and OAuth clients

NZAP has no account system of its own. **Connect Google** runs a standard
OAuth 2.0 installed-app flow on your device, and everything afterwards talks
to Google directly with your token.

## What happens when you connect

1. The engine generates a PKCE verifier (RFC 7636, `S256`) and starts a
   one-shot listener on `127.0.0.1` and `::1` on a random port.
2. Google's consent page opens in a **Custom Tab** (Android) or an
   **ASWebAuthenticationSession** sheet (iOS). These are real browsers —
   Google refuses sign-in inside embedded WebViews — and they keep NZAP in
   the foreground so it can receive the redirect.
3. After you approve, Google redirects to
   `http://localhost:<port>/callback`. The listener accepts exactly one
   request that carries the expected `state`, answers with a short page that
   sends the browser to `nzap://auth/done` (closing the tab), and closes. It
   gives up after five minutes.
4. The engine exchanges the code for tokens, stores the **refresh token** in
   the Android Keystore-protected store or the iOS Keychain, and keeps the
   access token in memory only.

**Use a code** is the fallback when the browser cannot return to the app:
Google shows a code on `sdk.cloud.google.com/applicationdefaultauthcode.html`,
and you paste it into NZAP.

**Disconnect** revokes the token at Google, then deletes it locally.

## Scopes

The same set Google's Colab CLI and VS Code extension use:
`openid`, `userinfo.email`, `userinfo.profile`,
`https://www.googleapis.com/auth/colaboratory`,
`https://www.googleapis.com/auth/drive.file` (only used for `drive.mount()`
after you confirm it per runtime) and
`https://www.googleapis.com/auth/cloud-platform` (only used for
`google.colab.auth.authenticate_user()`).

## The built-in client and your own

NZAP signs in with the installed-app client Google ships with the Cloud SDK
(as Google's Colab CLI does). If Google restricts it and sign-in fails with
`invalid_client` or `unauthorized_client`, create a **Desktop app** OAuth
client in the Google Cloud console and paste its JSON in
**Settings → Google OAuth client**. Desktop clients accept any
`http://localhost:<port>` redirect, so nothing else needs registering.

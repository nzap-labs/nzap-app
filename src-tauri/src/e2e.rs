//! The CI-only `e2e` build (never shipped): the release build, R8 and all,
//! plus what the Android emulator suite needs to drive it.
//!
//! - WebView debugging (the feature enables `tauri/devtools`), so Playwright
//!   can attach to the app's WebView;
//! - every Google endpoint on the mock (`nzap-mock-colab`), reached through
//!   `adb reverse` at the same loopback address as on the CI host;
//! - "playing the browser" for sign-in: the mock's consent screen approves
//!   at once and redirects to the app's loopback listener, so the app fetches
//!   the consent URL itself instead of opening a Custom Tab.
//!
//! `scripts/verify-android-release.sh` fails any shipped build that contains
//! [`MARKER`].

use nzap_core::config::Endpoints;

/// Where the mock listens (baked in at build time).
pub const MOCK_GOOGLE: &str = match option_env!("NZAP_E2E_MOCK_GOOGLE") {
    Some(url) => url,
    None => "http://127.0.0.1:9901",
};

/// Present in every e2e build, absent from every shipped one.
pub const MARKER: &str = "NZAP_E2E_BUILD";

pub fn endpoints() -> Endpoints {
    Endpoints::single_host(MOCK_GOOGLE)
}

/// Follow the consent URL like a browser would: the mock approves and
/// redirects to the app's loopback listener, which completes the sign-in.
pub fn play_browser(url: String) {
    tauri::async_runtime::spawn(async move {
        let outcome = match nzap_core::http::build_client() {
            Ok(client) => client.get(&url).send().await.map(|response| response.status()),
            Err(error) => {
                log::warn!("{MARKER}: no HTTP client: {error}");
                return;
            }
        };
        match outcome {
            Ok(status) => log::info!("{MARKER}: consent page answered {status}"),
            Err(error) => log::warn!("{MARKER}: consent page failed: {error}"),
        }
    });
}

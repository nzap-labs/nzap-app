//! App-level commands: info, settings, external links, stream cancellation.

use nzap_core::auth::OAuthClient;
use nzap_core::engine::HardwareConfig;
use nzap_core::settings::{Settings, SettingsPatch};
use nzap_core::Error;
use serde::Serialize;
use tauri::{AppHandle, State};

use crate::platform;
use crate::state::{AppState, CmdResult};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: &'static str,
    pub os: &'static str,
    pub arch: &'static str,
    /// A phone or tablet build (Android / iOS).
    pub mobile: bool,
}

#[tauri::command]
pub fn app_info() -> AppInfo {
    AppInfo {
        version: nzap_core::VERSION,
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        mobile: cfg!(mobile),
    }
}

/// Open an `https://` link in the user's browser. Nothing else is allowed
/// out of the webview.
pub fn open_external(app: &AppHandle, state: &AppState, url: &str) -> nzap_core::Result<()> {
    check_external_url(url)?;
    if state.log_opened_url(url)? {
        return Ok(());
    }
    platform::open_url(app, url)
}

/// Open Google's consent page in the platform's sign-in browser.
pub async fn open_auth(app: &AppHandle, state: &AppState, url: &str) -> nzap_core::Result<()> {
    check_external_url(url)?;
    if state.log_opened_url(url)? {
        return Ok(());
    }
    platform::open_auth_url(app, url).await
}

/// The Android back button on the last page: background the app.
#[tauri::command]
pub async fn app_minimize(app: AppHandle) {
    platform::move_to_background(&app).await;
}

/// The UI's theme changed: keep the system bars readable over it.
#[tauri::command]
pub async fn app_set_theme(app: AppHandle, dark: bool) {
    platform::set_system_bars(&app, dark).await;
}

/// Only `https://` leaves the app (plain `http://` to loopback is allowed in
/// development builds, for the mock Google server).
pub fn check_external_url(url: &str) -> nzap_core::Result<()> {
    let parsed = url::Url::parse(url).map_err(|_| Error::invalid("That is not a valid link."))?;
    let loopback = matches!(parsed.host_str(), Some("127.0.0.1" | "localhost"));
    let allowed = parsed.scheme() == "https"
        || (cfg!(debug_assertions) && loopback && parsed.scheme() == "http");
    if allowed {
        Ok(())
    } else {
        Err(Error::invalid("Only https:// links can be opened."))
    }
}

#[tauri::command]
pub fn open_url(app: AppHandle, state: State<'_, AppState>, url: String) -> CmdResult<()> {
    open_external(&app, &state, &url).map_err(Into::into)
}

/// Hand a file the app saved (a job artifact, an export) to the user: the
/// share sheet on phones, the file manager on desktop. Only files inside the
/// app's own folders are accepted.
#[tauri::command]
pub async fn reveal_path(app: AppHandle, path: String) -> CmdResult<()> {
    let path = platform::owned_file(&app, std::path::Path::new(&path))?;
    platform::reveal(&app, &path).await.map_err(Into::into)
}

/// Share (phones) or open (desktop) the diagnostics log.
#[tauri::command]
pub async fn open_log_dir(app: AppHandle) -> CmdResult<()> {
    platform::open_logs(&app).await.map_err(Into::into)
}

#[tauri::command]
pub fn stream_cancel(state: State<'_, AppState>, stream_id: String) -> bool {
    state.cancel_stream(&stream_id)
}

#[tauri::command]
pub fn config_get(state: State<'_, AppState>) -> HardwareConfig {
    state.engine.hardware_config()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    pub settings: Settings,
    pub oauth_client_id: String,
    pub custom_oauth_client: bool,
    pub default_catalog_url: &'static str,
}

fn settings_view(state: &AppState) -> SettingsView {
    let client = state.engine.auth.oauth_client();
    SettingsView {
        settings: state.engine.settings.get(),
        custom_oauth_client: !client.is_default(),
        oauth_client_id: client.client_id,
        default_catalog_url: nzap_core::notebooks::DEFAULT_CATALOG_URL,
    }
}

#[tauri::command]
pub fn settings_get(state: State<'_, AppState>) -> SettingsView {
    settings_view(&state)
}

#[tauri::command]
pub fn settings_update(
    app: AppHandle,
    state: State<'_, AppState>,
    patch: SettingsPatch,
) -> CmdResult<SettingsView> {
    // mobile: `closeToTray` means "keep runtimes alive in the background".
    let background_change = patch.close_to_tray.is_some() || patch.keep_alive.is_some();
    state.engine.update_settings(patch)?;
    if background_change {
        platform::sync_background(&app);
    }
    Ok(settings_view(&state))
}

/// Bring your own OAuth client (`null` restores the built-in one).
#[tauri::command]
pub async fn settings_set_oauth_client(
    state: State<'_, AppState>,
    json: Option<String>,
) -> CmdResult<SettingsView> {
    if let Some(text) = json.as_deref() {
        OAuthClient::from_json(text)?;
    }
    state.engine.set_oauth_client(json.as_deref()).await?;
    Ok(settings_view(&state))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_https_leaves_the_app() {
        assert!(check_external_url("https://colab.research.google.com/notebooks").is_ok());
        assert!(check_external_url("https://accounts.google.com/o/oauth2/v2/auth?x=1").is_ok());
        for refused in [
            "http://example.com/",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "ms-settings:privacy",
            "not a url",
        ] {
            assert!(check_external_url(refused).is_err(), "{refused}");
        }
        // The loopback exception exists only in development builds.
        assert_eq!(check_external_url("http://127.0.0.1:9/auth").is_ok(), cfg!(debug_assertions));
    }
}

//! NZAP's native mobile integration, used only by the Rust shell:
//!
//! - **secrets** (Android): values encrypted with a non-exportable AES-256-GCM
//!   key in the Android Keystore (iOS uses the Keychain through `nzap-core`);
//! - **sign-in browser**: a Custom Tab (Android) or an
//!   `ASWebAuthenticationSession` (iOS) for Google's consent page;
//! - **files out**: the system "Save to…" picker and the share sheet;
//! - **background keep-alive**: an Android foreground service while runtimes
//!   are kept alive;
//! - **system bars**: light / dark status-bar icons to match the app theme.
//!
//! On desktop (development builds) every call reports [`Error::Unsupported`].

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Manager, Runtime};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("not available on this platform")]
    Unsupported,
    #[error("{0}")]
    Native(String),
}

pub type Result<T> = std::result::Result<T, Error>;

#[cfg(any(target_os = "android", target_os = "ios"))]
impl From<tauri::plugin::mobile::PluginInvokeError> for Error {
    fn from(error: tauri::plugin::mobile::PluginInvokeError) -> Self {
        Self::Native(error.to_string())
    }
}

#[cfg_attr(not(any(target_os = "android", target_os = "ios")), allow(dead_code))]
#[derive(Deserialize)]
struct SecretsLoaded {
    values: BTreeMap<String, String>,
}

#[cfg_attr(not(any(target_os = "android", target_os = "ios")), allow(dead_code))]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveOutcome {
    saved: bool,
}

#[cfg_attr(not(any(target_os = "android", target_os = "ios")), allow(dead_code))]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SecretArgs<'a> {
    key: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    value: Option<&'a str>,
}

#[cfg_attr(not(any(target_os = "android", target_os = "ios")), allow(dead_code))]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileArgs<'a> {
    path: &'a str,
    name: &'a str,
    mime_type: &'a str,
}

/// What the keep-alive notification shows.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeepAlive {
    pub active: bool,
    pub count: usize,
    pub title: String,
    pub text: String,
}

impl KeepAlive {
    pub fn stopped() -> Self {
        Self { active: false, count: 0, title: String::new(), text: String::new() }
    }

    /// The ongoing notification for `count` runtimes.
    pub fn running(count: usize) -> Self {
        let text = match count {
            1 => "Keeping 1 runtime alive".to_owned(),
            n => format!("Keeping {n} runtimes alive"),
        };
        Self { active: true, count, title: "NZAP".to_owned(), text }
    }
}

/// The plugin's handle, from [`NzapMobileExt::nzap_mobile`].
pub struct NzapMobile<R: Runtime> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    handle: tauri::plugin::PluginHandle<R>,
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    _runtime: std::marker::PhantomData<fn() -> R>,
}

#[cfg(any(target_os = "android", target_os = "ios"))]
impl<R: Runtime> NzapMobile<R> {
    /// Every stored secret, decrypted (Android). Entries that can no longer
    /// be decrypted (the Keystore key was reset) are dropped.
    pub async fn secrets_load(&self) -> Result<BTreeMap<String, String>> {
        let loaded: SecretsLoaded = self.handle.run_mobile_plugin_async("secretsLoad", ()).await?;
        Ok(loaded.values)
    }

    /// Store a secret. Blocks until it is on disk; never call it from the
    /// main thread.
    pub fn secret_set(&self, key: &str, value: &str) -> Result<()> {
        let _: serde_json::Value =
            self.handle.run_mobile_plugin("secretSet", SecretArgs { key, value: Some(value) })?;
        Ok(())
    }

    /// Delete a secret. Blocks; never call it from the main thread.
    pub fn secret_delete(&self, key: &str) -> Result<()> {
        let _: serde_json::Value =
            self.handle.run_mobile_plugin("secretDelete", SecretArgs { key, value: None })?;
        Ok(())
    }

    /// Show Google's consent page in the platform's sign-in browser.
    pub async fn open_auth_url(&self, url: &str) -> Result<()> {
        let _: serde_json::Value = self
            .handle
            .run_mobile_plugin_async("openAuthUrl", serde_json::json!({ "url": url }))
            .await?;
        Ok(())
    }

    /// Let the user save the file at `path` somewhere of their choosing.
    /// `false` when they cancelled.
    pub async fn save_file(&self, path: &str, name: &str, mime_type: &str) -> Result<bool> {
        let outcome: SaveOutcome = self
            .handle
            .run_mobile_plugin_async("saveFile", FileArgs { path, name, mime_type })
            .await?;
        Ok(outcome.saved)
    }

    /// Offer the file at `path` to other apps through the share sheet.
    pub async fn share_file(&self, path: &str, name: &str, mime_type: &str) -> Result<()> {
        let _: serde_json::Value = self
            .handle
            .run_mobile_plugin_async("shareFile", FileArgs { path, name, mime_type })
            .await?;
        Ok(())
    }

    /// Start, update or stop the background keep-alive (Android).
    pub async fn set_keep_alive(&self, state: &KeepAlive) -> Result<()> {
        let _: serde_json::Value =
            self.handle.run_mobile_plugin_async("setKeepAlive", state).await?;
        Ok(())
    }

    /// Dark (light icons) or light (dark icons) system bars.
    pub async fn set_system_bars(&self, dark: bool) -> Result<()> {
        let _: serde_json::Value = self
            .handle
            .run_mobile_plugin_async("setSystemBars", serde_json::json!({ "dark": dark }))
            .await?;
        Ok(())
    }

    /// Send the app to the background without finishing it (Android back
    /// button on the last page), so runtimes stay kept alive.
    pub async fn move_to_background(&self) -> Result<()> {
        let _: serde_json::Value =
            self.handle.run_mobile_plugin_async("moveToBackground", ()).await?;
        Ok(())
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
impl<R: Runtime> NzapMobile<R> {
    pub async fn secrets_load(&self) -> Result<BTreeMap<String, String>> {
        Err(Error::Unsupported)
    }
    pub fn secret_set(&self, _key: &str, _value: &str) -> Result<()> {
        Err(Error::Unsupported)
    }
    pub fn secret_delete(&self, _key: &str) -> Result<()> {
        Err(Error::Unsupported)
    }
    pub async fn open_auth_url(&self, _url: &str) -> Result<()> {
        Err(Error::Unsupported)
    }
    pub async fn save_file(&self, _path: &str, _name: &str, _mime_type: &str) -> Result<bool> {
        Err(Error::Unsupported)
    }
    pub async fn share_file(&self, _path: &str, _name: &str, _mime_type: &str) -> Result<()> {
        Err(Error::Unsupported)
    }
    pub async fn set_keep_alive(&self, _state: &KeepAlive) -> Result<()> {
        Err(Error::Unsupported)
    }
    pub async fn set_system_bars(&self, _dark: bool) -> Result<()> {
        Err(Error::Unsupported)
    }
    pub async fn move_to_background(&self) -> Result<()> {
        Err(Error::Unsupported)
    }
}

/// `app.nzap_mobile()` on any `Manager` (app handle, window, …).
pub trait NzapMobileExt<R: Runtime> {
    fn nzap_mobile(&self) -> &NzapMobile<R>;
}

impl<R: Runtime, T: Manager<R>> NzapMobileExt<R> for T {
    fn nzap_mobile(&self) -> &NzapMobile<R> {
        self.state::<NzapMobile<R>>().inner()
    }
}

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_nzap_mobile);

/// Register the plugin (first, so the shell can use it during setup).
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("nzap-mobile")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            let handle = api.register_android_plugin("com.nzaplabs.mobile", "NzapMobilePlugin")?;
            #[cfg(target_os = "ios")]
            let handle = api.register_ios_plugin(init_plugin_nzap_mobile)?;
            #[cfg(any(target_os = "android", target_os = "ios"))]
            app.manage(NzapMobile { handle });
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                let _ = api;
                app.manage(NzapMobile::<R> { _runtime: std::marker::PhantomData });
            }
            Ok(())
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keep_alive_notification_text() {
        assert_eq!(KeepAlive::running(1).text, "Keeping 1 runtime alive");
        assert_eq!(KeepAlive::running(3).text, "Keeping 3 runtimes alive");
        assert!(!KeepAlive::stopped().active);
        let json = serde_json::to_value(KeepAlive::running(2)).unwrap();
        assert_eq!(json["active"], true);
        assert_eq!(json["count"], 2);
    }

    #[test]
    fn arguments_cross_as_camel_case() {
        let file =
            serde_json::to_value(FileArgs { path: "/p", name: "a.txt", mime_type: "text/plain" })
                .unwrap();
        assert_eq!(file["mimeType"], "text/plain");
        let secret = serde_json::to_value(SecretArgs { key: "k", value: None }).unwrap();
        assert!(secret.get("value").is_none());
    }
}

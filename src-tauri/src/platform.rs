//! Everything that differs between the phone and the desktop development
//! build lives here, behind one small API the commands use:
//!
//! | Need                  | Android                        | iOS                         | desktop (dev)      |
//! | --------------------- | ------------------------------ | --------------------------- | ------------------ |
//! | where secrets live    | Android Keystore (plugin)      | Keychain (`nzap-core`)      | 0600 file          |
//! | the sign-in browser   | Custom Tab                     | ASWebAuthenticationSession  | system browser     |
//! | saving a file         | "Save to…" (SAF)               | document exporter           | native save dialog |
//! | handing out a file    | share sheet                    | share sheet                 | file manager       |
//! | background keep-alive | foreground service             | — (resume on return)        | —                  |
//!
//! File paths never come from the webview: saving always goes through a
//! location the platform (or the user, in a picker) chose, and sharing only
//! accepts files inside the app's own folders.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use nzap_core::secrets::SecretStore;
use nzap_core::{Error, Result};
use tauri::{AppHandle, Manager};

/// The deep link the sign-in page sends the browser back to.
pub const AUTH_RETURN_URL: &str = "nzap://auth/done";

/// The log file's name, without `.log`.
pub const LOG_FILE_NAME: &str = "nzap";

/// Largest single upload to a runtime.
pub const MAX_UPLOAD_BYTES: u64 = 512 * 1024 * 1024;

/// Seconds between background keep-alive checks.
const BACKGROUND_SYNC_SECONDS: u64 = 15;

/// The secret store the engine should use, or `None` for its default choice
/// (the iOS Keychain through `nzap-core`, or a 0600 file on desktop).
pub fn secret_store(app: &AppHandle) -> Option<Arc<dyn SecretStore>> {
    #[cfg(target_os = "android")]
    {
        let store = Arc::new(android::KeystoreSecrets::new(app.clone()));
        app.manage(android::Secrets(store.clone()));
        Some(store)
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        None
    }
}

/// Whether the engine should use `nzap-core`'s keychain store.
pub fn use_engine_keychain() -> bool {
    cfg!(target_os = "ios")
}

/// Whether the loopback page should hand the browser back to the app.
pub fn auth_return_url() -> Option<String> {
    cfg!(mobile).then(|| AUTH_RETURN_URL.to_owned())
}

/// Work that starts once the app is running: loading Android Keystore
/// secrets (reachable only after setup, through the UI thread) and the
/// background keep-alive loop. The engine is ready for sign-in once
/// [`crate::state::AppState::wait_for_secrets`] returns.
pub fn start(app: &AppHandle) {
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        #[cfg(target_os = "android")]
        android::load_secrets(&handle).await;
        if let Some(state) = handle.try_state::<crate::state::AppState>() {
            state.mark_secrets_ready();
            let engine = state.engine.clone();
            // Reconnect to runtimes that survived the last session.
            engine.resume().await;
        }
        if cfg!(mobile) {
            background_loop(handle).await;
        }
    });
}

/// A file name the platform accepts: the last path segment, without
/// characters that are special on Android, iOS or Windows.
pub fn safe_file_name(name: &str, fallback: &str) -> String {
    let last = name.rsplit(['/', '\\']).next().unwrap_or_default();
    let cleaned: String = last
        .chars()
        .map(|c| if c.is_control() || r#"<>:"|?*"#.contains(c) { '_' } else { c })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.');
    if trimmed.is_empty() {
        fallback.to_owned()
    } else {
        trimmed.chars().take(120).collect()
    }
}

/// `dir/name`, or `dir/name (2).ext`, … when the name is taken.
pub fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, ext) = match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => (stem, format!(".{ext}")),
        _ => (name, String::new()),
    };
    (2..)
        .map(|n| dir.join(format!("{stem} ({n}){ext}")))
        .find(|path| !path.exists())
        .expect("an unused name exists")
}

/// The MIME type pickers and share targets should see for `name`.
pub fn mime_type(name: &str) -> &'static str {
    let ext = name.rsplit_once('.').map(|(_, ext)| ext.to_ascii_lowercase()).unwrap_or_default();
    match ext.as_str() {
        "ipynb" => "application/x-ipynb+json",
        "json" => "application/json",
        "jsonl" => "application/jsonl",
        "md" => "text/markdown",
        "txt" | "log" => "text/plain",
        "py" => "text/x-python",
        "csv" => "text/csv",
        "html" => "text/html",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "zip" => "application/zip",
        "gz" | "tgz" => "application/gzip",
        _ => "application/octet-stream",
    }
}

/// Where job artifacts go when Settings has no folder: app-private on
/// phones (shared from the UI), the Downloads folder on desktop.
pub fn default_artifacts_dir(app: &AppHandle) -> Result<PathBuf> {
    #[cfg(mobile)]
    {
        app.path()
            .app_data_dir()
            .map(|dir| dir.join("artifacts"))
            .map_err(|error| Error::Io(format!("No app data folder: {error}")))
    }
    #[cfg(desktop)]
    {
        app.path()
            .download_dir()
            .map(|dir| dir.join("NZAP"))
            .map_err(|error| Error::Io(format!("No downloads folder: {error}")))
    }
}

/// A private staging folder for files on their way to a picker or the
/// share sheet (the only folder the Android FileProvider exposes).
#[cfg_attr(desktop, allow(dead_code))]
async fn share_dir(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| Error::Io(format!("No cache folder: {error}")))?
        .join("share");
    tokio::fs::create_dir_all(&dir).await?;
    Ok(dir)
}

/// Save `bytes` as `name` where the user chooses. Returns what to show
/// (the file name on phones, the full path on desktop), or `None` when the
/// user cancelled.
pub async fn save_bytes(
    app: &AppHandle,
    name: &str,
    filter: Option<(&str, &[&str])>,
    bytes: Vec<u8>,
) -> Result<Option<String>> {
    let name = safe_file_name(name, "download");
    #[cfg(mobile)]
    {
        use tauri_plugin_nzap_mobile::NzapMobileExt;
        let _ = filter;
        let staging = share_dir(app).await?.join(format!("save-{}", uuid_like()));
        tokio::fs::create_dir_all(&staging).await?;
        let path = staging.join(&name);
        tokio::fs::write(&path, bytes).await?;
        let outcome = app
            .nzap_mobile()
            .save_file(&path.to_string_lossy(), &name, mime_type(&name))
            .await
            .map_err(|error| Error::Io(error.to_string()));
        let _ = tokio::fs::remove_dir_all(&staging).await;
        Ok(outcome?.then_some(name))
    }
    #[cfg(desktop)]
    {
        desktop::save_bytes(app, &name, filter, bytes).await
    }
}

/// A short random suffix for staging folders.
#[cfg_attr(desktop, allow(dead_code))]
fn uuid_like() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    format!("{nanos:x}")
}

/// `path`, canonicalised, if it is an existing file inside one of the
/// folders the app writes to (data, cache, logs, artifacts). Anything else is
/// refused, so the webview cannot make the app hand out arbitrary files.
pub fn owned_file(app: &AppHandle, path: &Path) -> Result<PathBuf> {
    let gone = || Error::not_found("That file no longer exists.");
    let path = path.canonicalize().map_err(|_| gone())?;
    if !path.is_file() {
        return Err(gone());
    }
    let resolver = app.path();
    let mut roots: Vec<PathBuf> =
        [resolver.app_data_dir(), resolver.app_cache_dir(), resolver.app_log_dir()]
            .into_iter()
            .flatten()
            .collect();
    roots.extend(default_artifacts_dir(app).ok());
    if let Some(state) = app.try_state::<crate::state::AppState>() {
        roots.extend(state.engine.settings.get().artifacts_dir.map(PathBuf::from));
    }
    let inside =
        roots.iter().filter_map(|root| root.canonicalize().ok()).any(|root| path.starts_with(root));
    if inside {
        Ok(path)
    } else {
        Err(Error::invalid("NZAP only shares files it saved itself."))
    }
}

/// Hand a file to the user: the share sheet on phones, the file manager on
/// desktop. `path` must already have passed [`owned_file`].
pub async fn reveal(app: &AppHandle, path: &Path) -> Result<()> {
    #[cfg(mobile)]
    {
        use tauri_plugin_nzap_mobile::NzapMobileExt;
        let name = safe_file_name(&path.file_name().unwrap_or_default().to_string_lossy(), "file");
        // Stage a link (or copy) under the FileProvider's `share/` root.
        let staged = unique_path(&share_dir(app).await?, &name);
        if tokio::fs::hard_link(path, &staged).await.is_err() {
            tokio::fs::copy(path, &staged).await?;
        }
        app.nzap_mobile()
            .share_file(&staged.to_string_lossy(), &name, mime_type(&name))
            .await
            .map_err(|error| Error::Io(error.to_string()))
    }
    #[cfg(desktop)]
    {
        use tauri_plugin_opener::OpenerExt;
        app.opener().reveal_item_in_dir(path).map_err(|error| Error::internal(error.to_string()))
    }
}

/// The diagnostics log: shared on phones, its folder opened on desktop.
pub async fn open_logs(app: &AppHandle) -> Result<()> {
    let dir = app.path().app_log_dir().map_err(|error| Error::Io(error.to_string()))?;
    tokio::fs::create_dir_all(&dir).await?;
    #[cfg(mobile)]
    {
        let log = dir.join(format!("{LOG_FILE_NAME}.log"));
        if !log.is_file() {
            return Err(Error::not_found("There is no log yet."));
        }
        reveal(app, &log).await
    }
    #[cfg(desktop)]
    {
        use tauri_plugin_opener::OpenerExt;
        app.opener()
            .open_path(dir.to_string_lossy(), None::<&str>)
            .map_err(|error| Error::internal(error.to_string()))
    }
}

/// Open the Google consent page for a sign-in.
pub async fn open_auth_url(app: &AppHandle, url: &str) -> Result<()> {
    #[cfg(mobile)]
    {
        use tauri_plugin_nzap_mobile::NzapMobileExt;
        app.nzap_mobile()
            .open_auth_url(url)
            .await
            .map_err(|error| Error::internal(format!("Could not open the sign-in page: {error}")))
    }
    #[cfg(desktop)]
    {
        open_url(app, url)
    }
}

/// Open an `https://` link outside the app.
pub fn open_url(app: &AppHandle, url: &str) -> Result<()> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| Error::internal(format!("Could not open the browser: {error}")))
}

/// Match the system bars to the app theme (Android; a no-op elsewhere).
pub async fn set_system_bars(app: &AppHandle, dark: bool) {
    #[cfg(mobile)]
    {
        use tauri_plugin_nzap_mobile::NzapMobileExt;
        if let Err(error) = app.nzap_mobile().set_system_bars(dark).await {
            log::debug!("System bars: {error}");
        }
    }
    #[cfg(desktop)]
    let _ = (app, dark);
}

/// Whether runtimes should be kept alive while the app is in the background:
/// keep-alive on, "keep alive in the background" (the desktop's
/// close-to-tray setting) on, and at least one runtime.
pub fn background_wanted(keep_alive: bool, in_background: bool, runtimes: usize) -> usize {
    if keep_alive && in_background {
        runtimes
    } else {
        0
    }
}

/// Bring background keep-alive in line with the settings and runtimes now.
pub fn sync_background(app: &AppHandle) {
    if cfg!(desktop) {
        return;
    }
    let handle = app.clone();
    tauri::async_runtime::spawn(async move { sync_background_now(&handle).await });
}

#[cfg(desktop)]
async fn sync_background_now(_app: &AppHandle) {}

#[cfg(mobile)]
async fn sync_background_now(app: &AppHandle) {
    use tauri_plugin_nzap_mobile::{KeepAlive, NzapMobileExt};
    let Some(state) = app.try_state::<crate::state::AppState>() else {
        return;
    };
    let settings = state.engine.settings.get();
    let count = background_wanted(
        settings.keep_alive,
        settings.close_to_tray,
        state.engine.sessions.names().len(),
    );
    if !state.background_changed(count) {
        return;
    }
    let wanted = if count > 0 { KeepAlive::running(count) } else { KeepAlive::stopped() };
    if let Err(error) = app.nzap_mobile().set_keep_alive(&wanted).await {
        // Android refuses to start it from the background; retry later.
        log::info!("Background keep-alive: {error}");
        state.background_changed(usize::MAX);
    }
}

async fn background_loop(app: AppHandle) {
    let mut ticker = tokio::time::interval(std::time::Duration::from_secs(BACKGROUND_SYNC_SECONDS));
    loop {
        ticker.tick().await;
        sync_background_now(&app).await;
    }
}

#[cfg(target_os = "android")]
mod android {
    use std::collections::BTreeMap;
    use std::sync::{Arc, Mutex};

    use nzap_core::secrets::{SecretStore, StorageKind};
    use nzap_core::{Error, Result};
    use tauri::{AppHandle, Manager};
    use tauri_plugin_nzap_mobile::NzapMobileExt;

    /// The store, reachable from [`load_secrets`].
    pub struct Secrets(pub Arc<KeystoreSecrets>);

    /// Secrets encrypted by the Kotlin side with an Android Keystore key.
    /// Reads come from a cache filled once at startup ([`load_secrets`]);
    /// writes go straight through (they block on the UI thread, so they
    /// only ever run on engine tasks, never on the main thread).
    pub struct KeystoreSecrets {
        app: AppHandle,
        cache: Mutex<Option<BTreeMap<String, String>>>,
    }

    impl KeystoreSecrets {
        pub fn new(app: AppHandle) -> Self {
            Self { app, cache: Mutex::new(None) }
        }

        fn cache(&self) -> std::sync::MutexGuard<'_, Option<BTreeMap<String, String>>> {
            self.cache.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
        }
    }

    impl SecretStore for KeystoreSecrets {
        fn get(&self, key: &str) -> Result<Option<String>> {
            Ok(self.cache().as_ref().and_then(|map| map.get(key).cloned()))
        }

        fn set(&self, key: &str, value: &str) -> Result<()> {
            self.app
                .nzap_mobile()
                .secret_set(key, value)
                .map_err(|error| Error::Io(format!("Secure storage: {error}")))?;
            self.cache().get_or_insert_with(BTreeMap::new).insert(key.to_owned(), value.to_owned());
            Ok(())
        }

        fn delete(&self, key: &str) -> Result<()> {
            self.app
                .nzap_mobile()
                .secret_delete(key)
                .map_err(|error| Error::Io(format!("Secure storage: {error}")))?;
            if let Some(map) = self.cache().as_mut() {
                map.remove(key);
            }
            Ok(())
        }

        fn kind(&self) -> StorageKind {
            StorageKind::Keychain
        }
    }

    /// Decrypt everything once, then let the engine pick up the connection.
    pub async fn load_secrets(app: &AppHandle) {
        let Some(secrets) = app.try_state::<Secrets>() else {
            return;
        };
        let store = secrets.0.clone();
        match app.nzap_mobile().secrets_load().await {
            Ok(values) => *store.cache() = Some(values),
            Err(error) => {
                log::warn!("Could not read the secure store: {error}");
                store.cache().get_or_insert_with(BTreeMap::new);
            }
        }
        if let Some(state) = app.try_state::<crate::state::AppState>() {
            state.engine.auth.reload_secrets().await;
        }
    }
}

#[cfg(desktop)]
mod desktop {
    use nzap_core::{Error, Result};
    use tauri::AppHandle;
    use tauri_plugin_dialog::DialogExt;

    pub async fn save_bytes(
        app: &AppHandle,
        name: &str,
        filter: Option<(&str, &[&str])>,
        bytes: Vec<u8>,
    ) -> Result<Option<String>> {
        let (tx, rx) = tokio::sync::oneshot::channel();
        let mut dialog = app.dialog().file().set_file_name(name);
        if let Some((label, extensions)) = filter {
            dialog = dialog.add_filter(label, extensions);
        }
        dialog.save_file(move |path| {
            let _ = tx.send(path);
        });
        let Some(path) = rx.await.ok().flatten() else {
            return Ok(None);
        };
        let path =
            path.into_path().map_err(|error| Error::Io(format!("Unsupported path: {error}")))?;
        tokio::fs::write(&path, bytes).await?;
        Ok(Some(path.to_string_lossy().into_owned()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_names_are_single_safe_segments() {
        assert_eq!(safe_file_name("results/model.pt", "x"), "model.pt");
        assert_eq!(safe_file_name(r"C:\a\b.txt", "x"), "b.txt");
        assert_eq!(safe_file_name("a:b?c*.ipynb", "x"), "a_b_c_.ipynb");
        assert_eq!(safe_file_name("../..", "fallback"), "fallback");
        assert_eq!(safe_file_name("", "fallback"), "fallback");
        assert_eq!(safe_file_name("line\nbreak", "x"), "line_break");
        assert_eq!(safe_file_name(&"a".repeat(300), "x").len(), 120);
    }

    #[test]
    fn unique_paths_never_overwrite() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(unique_path(dir.path(), "a.txt"), dir.path().join("a.txt"));
        std::fs::write(dir.path().join("a.txt"), "").unwrap();
        assert_eq!(unique_path(dir.path(), "a.txt"), dir.path().join("a (2).txt"));
        std::fs::write(dir.path().join("a (2).txt"), "").unwrap();
        assert_eq!(unique_path(dir.path(), "a.txt"), dir.path().join("a (3).txt"));
        std::fs::write(dir.path().join("Makefile"), "").unwrap();
        assert_eq!(unique_path(dir.path(), "Makefile"), dir.path().join("Makefile (2)"));
    }

    #[test]
    fn mime_types_follow_the_extension() {
        assert_eq!(mime_type("run.ipynb"), "application/x-ipynb+json");
        assert_eq!(mime_type("NOTES.MD"), "text/markdown");
        assert_eq!(mime_type("history.jsonl"), "application/jsonl");
        assert_eq!(mime_type("model.pt"), "application/octet-stream");
        assert_eq!(mime_type("Makefile"), "application/octet-stream");
    }

    #[test]
    fn background_keep_alive_needs_both_settings_and_a_runtime() {
        assert_eq!(background_wanted(true, true, 2), 2);
        assert_eq!(background_wanted(true, true, 0), 0);
        assert_eq!(background_wanted(false, true, 2), 0);
        assert_eq!(background_wanted(true, false, 2), 0);
    }

    #[test]
    fn only_phones_return_to_the_app_after_sign_in() {
        assert_eq!(auth_return_url().is_some(), cfg!(mobile));
        assert_eq!(use_engine_keychain(), cfg!(target_os = "ios"));
    }
}

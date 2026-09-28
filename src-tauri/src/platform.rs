//! Everything that differs between the phone and the desktop development
//! build lives here, behind one small API the commands use:
//!
//! | Need                    | Android / iOS                              | desktop (dev)          |
//! | ----------------------- | ------------------------------------------ | ---------------------- |
//! | where secrets live      | app-private file (Keystore/Keychain next)  | 0600 file              |
//! | saving a file           | app-private `exports/` folder              | native save dialog     |
//! | the sign-in browser     | system browser                             | system browser         |
//!
//! File paths never come from the webview: saving always goes through a
//! location the platform (or the user, in a dialog) chose.

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

/// The secret store the engine should use, or `None` for its default choice.
pub fn secret_store(_app: &AppHandle) -> Option<Arc<dyn SecretStore>> {
    None
}

/// Whether the loopback page should hand the browser back to the app.
pub fn auth_return_url() -> Option<String> {
    cfg!(mobile).then(|| AUTH_RETURN_URL.to_owned())
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

/// Save `bytes` as `name`. `Ok(None)` when the user cancelled.
///
/// Phones keep the file in the app's `exports/` folder for now, returning
/// its path for the UI to show; the desktop build asks with a save dialog.
pub async fn save_bytes(
    app: &AppHandle,
    name: &str,
    filter: Option<(&str, &[&str])>,
    bytes: Vec<u8>,
) -> Result<Option<String>> {
    let name = safe_file_name(name, "download");
    #[cfg(mobile)]
    {
        let _ = filter;
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|error| Error::Io(format!("No app data folder: {error}")))?
            .join("exports");
        tokio::fs::create_dir_all(&dir).await?;
        let path = unique_path(&dir, &name);
        tokio::fs::write(&path, bytes).await?;
        Ok(Some(path.to_string_lossy().into_owned()))
    }
    #[cfg(desktop)]
    {
        desktop::save_bytes(app, &name, filter, bytes).await
    }
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

/// Hand a file to the user: the share sheet on phones (next phase), the
/// file manager on desktop.
pub async fn reveal(app: &AppHandle, path: &Path) -> Result<()> {
    #[cfg(mobile)]
    {
        let _ = (app, path);
        Err(Error::invalid("Sharing files is not available yet."))
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
        reveal(app, &dir.join(format!("{LOG_FILE_NAME}.log"))).await
    }
    #[cfg(desktop)]
    {
        use tauri_plugin_opener::OpenerExt;
        app.opener()
            .open_path(dir.to_string_lossy(), None::<&str>)
            .map_err(|error| Error::internal(error.to_string()))
    }
}

/// Start or stop background keep-alive to match the settings and the
/// runtimes that are connected (Android foreground service, next phase).
pub fn sync_background(_app: &AppHandle, _state: &crate::state::AppState) {}

/// Open the Google consent page for a sign-in.
pub fn open_auth_url(app: &AppHandle, url: &str) -> Result<()> {
    open_url(app, url)
}

/// Open an `https://` link outside the app.
pub fn open_url(app: &AppHandle, url: &str) -> Result<()> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| Error::internal(format!("Could not open the browser: {error}")))
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
    fn only_phones_return_to_the_app_after_sign_in() {
        assert_eq!(auth_return_url().is_some(), cfg!(mobile));
    }
}

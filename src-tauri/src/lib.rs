//! The NZAP mobile shell.
//!
//! A thin adapter between the webview and `nzap-core`: the same IPC commands
//! and streaming channels as the NZAP Engine desktop shell, plus the mobile
//! platform integration in [`platform`]. The engine itself lives in
//! `crates/nzap-core` so it can be tested without a device.

mod commands;
pub mod platform;
mod state;

use std::path::{Path, PathBuf};

use nzap_core::auth::OAuthClient;
use nzap_core::config::Endpoints;
use nzap_core::paths::AppPaths;
use nzap_core::settings::SettingsPatch;
use nzap_core::{Engine, EngineOptions};
use tauri::{AppHandle, Manager, RunEvent};

use crate::state::AppState;

/// Development and test builds read `NZAP_*` overrides (mock Google,
/// isolated data directory, logged instead of opened URLs). Release builds
/// ignore them.
fn dev_env(name: &str) -> Option<String> {
    if cfg!(debug_assertions) {
        std::env::var(name).ok().filter(|value| !value.is_empty())
    } else {
        None
    }
}

fn build_state(app: &AppHandle) -> Result<AppState, Box<dyn std::error::Error>> {
    let paths = match dev_env("NZAP_DATA_DIR") {
        Some(root) => AppPaths::under(Path::new(&root)),
        None => AppPaths {
            data_dir: app.path().app_data_dir()?,
            config_dir: app.path().app_config_dir()?,
            cache_dir: app.path().app_cache_dir()?,
        },
    };
    let endpoints = if cfg!(debug_assertions) {
        Endpoints::default().with_overrides(dev_env)
    } else {
        Endpoints::default()
    };
    let oauth_client = std::env::var("NZAP_OAUTH_CLIENT_JSON").ok().and_then(|json| {
        OAuthClient::from_json(&json)
            .map_err(|error| log::warn!("NZAP_OAUTH_CLIENT_JSON: {error}"))
            .ok()
    });
    let first_launch = !paths.settings_file().exists();
    let engine = Engine::new(EngineOptions {
        paths,
        endpoints,
        // Android: the Keystore store below; iOS: the Keychain through
        // nzap-core; desktop (dev): a 0600 file.
        use_keychain: platform::use_engine_keychain(),
        oauth_client,
        secret_store: platform::secret_store(app),
        return_url: platform::auth_return_url(),
    })?;
    // Phones keep runtimes alive in the background unless the user opts out
    // (the setting is the desktop's close-to-tray).
    if first_launch && cfg!(mobile) {
        engine
            .update_settings(SettingsPatch { close_to_tray: Some(true), ..Default::default() })?;
    }
    Ok(AppState::new(engine, dev_env("NZAP_E2E_OPEN_LOG").map(PathBuf::from)))
}

fn log_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    use tauri_plugin_log::{RotationStrategy, Target, TargetKind};
    tauri_plugin_log::Builder::new()
        .clear_targets()
        // Logcat on Android, the unified log on iOS, stdout on desktop.
        .target(Target::new(TargetKind::Stdout))
        .target(Target::new(TargetKind::LogDir { file_name: Some(platform::LOG_FILE_NAME.into()) }))
        .level(log::LevelFilter::Info)
        // Chatty dependencies stay at warnings.
        .level_for("hyper", log::LevelFilter::Warn)
        .level_for("rustls", log::LevelFilter::Warn)
        .level_for("tungstenite", log::LevelFilter::Warn)
        .max_file_size(2 * 1024 * 1024)
        .rotation_strategy(RotationStrategy::KeepOne)
        .build()
}

/// Build and run the application.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        // First, so the shell can use it during setup.
        .plugin(tauri_plugin_nzap_mobile::init())
        .plugin(log_plugin())
        .plugin(tauri_plugin_opener::init());
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_dialog::init());
    }

    let app = builder
        .on_window_event(|window, event| {
            #[cfg(mobile)]
            match event {
                // Back from the background: re-check runtimes the OS may
                // have let lapse.
                tauri::WindowEvent::Resumed => {
                    if let Some(state) = window.try_state::<AppState>() {
                        let engine = state.engine.clone();
                        tauri::async_runtime::spawn(async move { engine.resume().await });
                    }
                }
                // Going to the background: Android only lets the keep-alive
                // service start while the app is still visible.
                tauri::WindowEvent::Suspended => platform::sync_background(window.app_handle()),
                _ => {}
            }
            #[cfg(desktop)]
            let _ = (window, event);
        })
        .setup(|app| {
            let state = build_state(app.handle())?;
            app.manage(state);
            log::info!(
                "NZAP {} started on {} ({})",
                nzap_core::VERSION,
                std::env::consts::OS,
                std::env::consts::ARCH
            );
            // Secrets (Android), reconnecting runtimes, background keep-alive.
            platform::start(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::app_info,
            commands::app::app_set_theme,
            commands::app::app_minimize,
            commands::app::open_url,
            commands::app::reveal_path,
            commands::app::open_log_dir,
            commands::app::stream_cancel,
            commands::app::config_get,
            commands::app::settings_get,
            commands::app::settings_update,
            commands::app::settings_set_oauth_client,
            commands::auth::auth_status,
            commands::auth::auth_connect,
            commands::auth::auth_cancel,
            commands::auth::auth_begin_remote,
            commands::auth::auth_complete_remote,
            commands::auth::auth_disconnect,
            commands::auth::account_get,
            commands::auth::quota_get,
            commands::sessions::sessions_list,
            commands::sessions::session_create,
            commands::sessions::session_get,
            commands::sessions::session_connect,
            commands::sessions::session_disconnect,
            commands::sessions::session_keepalive,
            commands::sessions::session_restart,
            commands::sessions::session_interrupt,
            commands::sessions::session_stdin,
            commands::sessions::session_drive_authorize,
            commands::sessions::session_stop,
            commands::sessions::session_resources,
            commands::sessions::session_execute,
            commands::sessions::session_automation,
            commands::sessions::session_run_file,
            commands::sessions::job_run,
            commands::sessions::import_notebook_url,
            commands::sessions::assignments_list,
            commands::sessions::assignment_release,
            commands::sessions::assignment_adopt,
            commands::sessions::terminal_open,
            commands::sessions::terminal_send,
            commands::sessions::terminal_close,
            commands::sessions::history_get,
            commands::sessions::history_export,
            commands::sessions::history_clear,
            commands::files::files_list,
            commands::files::files_read,
            commands::files::files_write,
            commands::files::files_mkdir,
            commands::files::files_rename,
            commands::files::files_delete,
            commands::files::files_download,
            commands::files::files_upload_bytes,
            commands::files::save_text_file,
            commands::notebooks::notebooks_list,
            commands::notebooks::notebooks_refresh,
            commands::notebooks::notebook_get,
            commands::notebooks::notebook_create,
            commands::notebooks::notebook_update,
            commands::notebooks::notebook_delete,
            commands::notebooks::notebook_fork,
            commands::notebooks::notebook_export,
            commands::notebooks::notebook_import,
            commands::notebooks::notebook_run,
        ])
        .build(tauri::generate_context!())
        .expect("NZAP failed to start");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            if let Some(state) = handle.try_state::<AppState>() {
                // Runtimes keep running on Google's side; only local work stops.
                state.shutdown();
            }
        }
    });
}

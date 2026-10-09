// The plugin exposes no commands to the webview: only the Rust shell calls
// into the native code, so no capability can grant a page access to it.
const COMMANDS: &[&str] = &[];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).android_path("android").ios_path("ios").build();
}

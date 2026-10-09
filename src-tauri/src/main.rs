// The desktop binary exists for development (`npm run app:dev`) and tests;
// the shipped apps are the Android and iOS builds of the library.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    nzap_app_lib::run();
}

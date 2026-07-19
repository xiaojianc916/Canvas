use tauri::{Manager, Wry};
use tauri_plugin_store::StoreExt;

use super::logging;
use crate::commands;

pub fn build() -> tauri::Builder<Wry> {
    tauri::Builder::<Wry>::default()
        .plugin(logging::plugin().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .setup(|app| {
            #[cfg(debug_assertions)]
            if let Some(win) = app.get_webview_window("main") {
                win.open_devtools();
            }
            let _ = app.store("settings.json");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::opener::opener_show_in_folder,
            commands::opener::opener_open_external,
            commands::plugin::plugin_install,
            commands::plugin::plugin_uninstall,
            commands::plugin::plugin_list,
            commands::plugin::plugin_enable,
            commands::plugin::plugin_disable,
            commands::asset::asset_store,
            commands::asset::asset_load,
            commands::asset::asset_delete,
            commands::asset::asset_list,
            commands::file::file_open,
            commands::file::file_save,
            commands::file::file_save_as,
            commands::file::file_save_draw,
            commands::file::file_read_draw,
            commands::file::file_create_draw,
            commands::file::file_recent_list,
            commands::file::file_close,
            commands::settings::settings_get,
            commands::settings::settings_set,
            commands::settings::settings_reset,
        ])
}

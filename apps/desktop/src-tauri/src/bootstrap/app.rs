use tauri::Wry;
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
        .setup(|app| {
            let _ = app.store("settings.json");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::window::window_create,
            commands::window::window_get,
            commands::window::window_list,
            commands::window::window_show,
            commands::window::window_focus,
            commands::window::window_close,
            commands::window::window_minimize,
            commands::window::window_maximize,
            commands::window::window_set_title,
            commands::window::window_save_state,
            commands::opener::opener_show_in_folder,
            commands::opener::opener_open_external,
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

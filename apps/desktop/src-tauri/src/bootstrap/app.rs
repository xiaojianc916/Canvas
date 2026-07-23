use tauri::Wry;
use tauri_plugin_store::StoreExt;

use super::logging;
use crate::asset_protocol::{
    AssetProtocolRegistry, ASSET_PROTOCOL_SCHEME,
};
use crate::commands;
use crate::commands::document::DocumentRegistry;

pub fn build() -> tauri::Builder<Wry> {
    let asset_protocol = AssetProtocolRegistry::default();
    let protocol_registry = asset_protocol.clone();

    tauri::Builder::<Wry>::default()
        .manage(DocumentRegistry::default())
        .manage(asset_protocol)
        .register_uri_scheme_protocol(
            ASSET_PROTOCOL_SCHEME,
            move |_webview, request| {
                protocol_registry.response(&request)
            },
        )
        .plugin(logging::plugin().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            app.store("settings.json")?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::window::window_get,
            commands::window::window_list,
            commands::window::window_show,
            commands::window::window_focus,
            commands::window::window_close,
            commands::window::window_set_title,
            commands::window::window_save_state,
            commands::document::document_open,
            commands::document::document_save_as,
            commands::document::document_save,
            commands::document::document_close,
            commands::settings::settings_get,
            commands::settings::settings_set,
            commands::settings::settings_reset,
        ])
}

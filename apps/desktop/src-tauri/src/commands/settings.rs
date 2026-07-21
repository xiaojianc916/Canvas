use crate::error::Result;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use tauri::{AppHandle, command};
use tauri_plugin_store::StoreExt;

#[derive(Debug, Deserialize, Serialize, Type, Clone)]
pub struct AppSettings {
    pub theme: String,
    pub language: String,
    pub auto_save: bool,
    pub auto_save_interval: u64,
    pub shortcuts: HashMap<String, String>,
    pub canvas: CanvasSettings,
    pub editor: EditorSettings,
    pub export: ExportSettings,
    pub privacy: PrivacySettings,
}

#[derive(Debug, Deserialize, Serialize, Type, Clone)]
pub struct CanvasSettings {
    pub default_zoom: f64,
    pub show_grid: bool,
    pub snap_to_grid: bool,
    pub grid_size: f64,
    pub show_rulers: bool,
    pub infinite_canvas: bool,
}

#[derive(Debug, Deserialize, Serialize, Type, Clone)]
pub struct EditorSettings {
    pub font_family: String,
    pub font_size: f64,
    pub line_height: f64,
    pub tab_size: u32,
    pub insert_spaces: bool,
    pub word_wrap: bool,
    pub minimap: bool,
}

#[derive(Debug, Deserialize, Serialize, Type, Clone)]
pub struct ExportSettings {
    pub default_format: String,
    pub png_dpi: u32,
    pub pdf_quality: u8,
    pub include_metadata: bool,
}

#[derive(Debug, Deserialize, Serialize, Type, Clone)]
pub struct PrivacySettings {
    pub telemetry: bool,
    pub crash_reporting: bool,
    pub update_check: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "system".into(),
            language: "en".into(),
            auto_save: true,
            auto_save_interval: 30000,
            shortcuts: HashMap::new(),
            canvas: CanvasSettings::default(),
            editor: EditorSettings::default(),
            export: ExportSettings::default(),
            privacy: PrivacySettings::default(),
        }
    }
}

impl Default for CanvasSettings {
    fn default() -> Self {
        Self {
            default_zoom: 1.0,
            show_grid: false,
            snap_to_grid: false,
            grid_size: 20.0,
            show_rulers: false,
            infinite_canvas: true,
        }
    }
}

impl Default for EditorSettings {
    fn default() -> Self {
        Self {
            font_family: "JetBrains Mono, Consolas, monospace".into(),
            font_size: 14.0,
            line_height: 1.5,
            tab_size: 2,
            insert_spaces: true,
            word_wrap: true,
            minimap: false,
        }
    }
}

impl Default for ExportSettings {
    fn default() -> Self {
        Self {
            default_format: "svg".into(),
            png_dpi: 300,
            pdf_quality: 90,
            include_metadata: true,
        }
    }
}

impl Default for PrivacySettings {
    fn default() -> Self {
        Self {
            telemetry: false,
            crash_reporting: true,
            update_check: true,
        }
    }
}

#[command]
pub async fn settings_get(app: AppHandle) -> Result<AppSettings> {
    let store = app.store("settings.json")?;
    let settings: AppSettings = store
        .get("settings")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    Ok(settings)
}

#[command]
pub async fn settings_set(app: AppHandle, settings: AppSettings) -> Result<()> {
    let store = app.store("settings.json")?;
    store.set("settings", serde_json::to_value(&settings)?);
    store.save()?;
    Ok(())
}

#[command]
pub async fn settings_reset(app: AppHandle) -> Result<AppSettings> {
    let defaults = AppSettings::default();
    let store = app.store("settings.json")?;
    store.set("settings", serde_json::to_value(&defaults)?);
    store.save()?;
    Ok(defaults)
}

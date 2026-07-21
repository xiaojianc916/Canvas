use crate::error::Result;
use serde::Deserialize;
use specta::Type;
use tauri::command;

#[derive(Debug, Deserialize, Type)]
pub struct ShowInFolderOptions {
    pub path: String,
}

#[command]
pub async fn opener_show_in_folder(
    _app: tauri::AppHandle,
    options: ShowInFolderOptions,
) -> Result<()> {
    // Delegates to desktop-runtime/native when implemented.
    // For now let the OS handle it via the opener plugin.
    let path = std::path::Path::new(&options.path);
    if let Some(_parent) = path.parent() {
        #[cfg(target_os = "windows")]
        std::process::Command::new("explorer")
            .args(["/select,", &options.path])
            .spawn()?;
        #[cfg(target_os = "macos")]
        std::process::Command::new("open")
            .args(["-R", &options.path])
            .spawn()?;
        #[cfg(target_os = "linux")]
        std::process::Command::new("xdg-open").arg(_parent).spawn()?;
    }
    Ok(())
}

#[derive(Debug, Deserialize, Type)]
pub struct OpenExternalOptions {
    pub url: String,
}

#[command]
pub async fn opener_open_external(
    _app: tauri::AppHandle,
    options: OpenExternalOptions,
) -> Result<()> {
    // Simple scheme check — full URL parsing added when desktop-runtime/native implements this.
    let lower = options.url.to_lowercase();
    if !(lower.starts_with("https://")
        || lower.starts_with("http://")
        || lower.starts_with("mailto:")
        || lower.starts_with("tel:"))
    {
        return Err(crate::Error::Validation(format!(
            "Unsupported or missing URL scheme: {}",
            options.url
        )));
    }
    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/C", "start", "", &options.url])
        .spawn()?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .args([&options.url])
        .spawn()?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .args([&options.url])
        .spawn()?;
    Ok(())
}

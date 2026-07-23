use crate::error::Result;
use serde::Deserialize;
use specta::Type;
use tauri::command;

#[derive(Debug, Deserialize, Type)]
pub struct ShowInFolderOptions {
    pub path: String,
}

#[derive(Debug, Deserialize, Type)]
pub struct OpenExternalOptions {
    pub url: String,
}

/// 此 command 不应在生产版本注册。
///
/// 原实现把 renderer 可控字符串传入 `cmd /C start`、`open` 或
/// `xdg-open`，其中 Windows 的 cmd.exe 会重新解释元字符，形成命令注入面。
///
/// 若未来需要恢复此能力：
/// 1. 不得通过 shell / command interpreter 启动；
/// 2. 使用官方 tauri-plugin-opener 的受限 API；
/// 3. 用结构化 URL parser 做精确 scheme allowlist；
/// 4. 将 command 限制到特定 capability/window。
#[command]
pub async fn opener_show_in_folder(_options: ShowInFolderOptions) -> Result<()> {
    Err(crate::Error::PermissionDenied(
        "opening arbitrary filesystem paths is disabled in this build".into(),
    ))
}

#[command]
pub async fn opener_open_external(_options: OpenExternalOptions) -> Result<()> {
    Err(crate::Error::PermissionDenied(
        "opening external URLs is disabled in this build".into(),
    ))
}

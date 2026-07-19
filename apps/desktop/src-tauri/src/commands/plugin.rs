use crate::error::Result;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{command, AppHandle};

#[derive(Debug, Deserialize, Type)]
pub struct InstallPluginOptions {
    pub package_path: String,
    pub verify_signature: Option<bool>,
}

#[derive(Debug, Serialize, Type)]
pub struct PluginInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub publisher: String,
    pub enabled: bool,
    pub permissions: Vec<String>,
    pub installed_at: String,
}

#[command]
pub async fn plugin_install(app: AppHandle, options: InstallPluginOptions) -> Result<PluginInfo> {
    // TODO: 实现插件安装逻辑
    // 1. 验证签名
    // 2. 解压到插件目录
    // 3. 读取 manifest
    // 4. 存储到 store
    Err(crate::Error::Internal("Not implemented".to_string()))
}

#[command]
pub async fn plugin_uninstall(app: AppHandle, plugin_id: String) -> Result<()> {
    // TODO: 实现插件卸载
    Err(crate::Error::Internal("Not implemented".to_string()))
}

#[command]
pub async fn plugin_list(app: AppHandle) -> Result<Vec<PluginInfo>> {
    // TODO: 读取已安装插件列表
    Ok(vec![])
}

#[command]
pub async fn plugin_enable(app: AppHandle, plugin_id: String) -> Result<()> {
    // TODO: 启用插件
    Err(crate::Error::Internal("Not implemented".to_string()))
}

#[command]
pub async fn plugin_disable(app: AppHandle, plugin_id: String) -> Result<()> {
    // TODO: 禁用插件
    Err(crate::Error::Internal("Not implemented".to_string()))
}
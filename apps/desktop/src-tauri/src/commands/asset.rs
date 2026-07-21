use crate::error::Result;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, command};

#[derive(Debug, Deserialize, Type)]
pub struct AssetStoreOptions {
    pub asset_id: String,
    pub mime_type: String,
    pub data: Vec<u8>,
}

#[derive(Debug, Serialize, Type)]
pub struct AssetInfo {
    pub asset_id: String,
    pub mime_type: String,
    pub size: u64,
    pub hash: String,
    pub created_at: String,
}

#[command]
pub async fn asset_store(app: AppHandle, options: AssetStoreOptions) -> Result<AssetInfo> {
    // TODO: 实现资产存储
    Err(crate::Error::Internal("Not implemented".to_string()))
}

#[command]
pub async fn asset_load(app: AppHandle, asset_id: String) -> Result<Vec<u8>> {
    // TODO: 实现资产加载
    Err(crate::Error::Internal("Not implemented".to_string()))
}

#[command]
pub async fn asset_delete(app: AppHandle, asset_id: String) -> Result<()> {
    // TODO: 实现资产删除
    Err(crate::Error::Internal("Not implemented".to_string()))
}

#[command]
pub async fn asset_list(app: AppHandle) -> Result<Vec<AssetInfo>> {
    // TODO: 列出所有资产
    Ok(vec![])
}

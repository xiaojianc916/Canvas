//! Crash recovery helpers for interrupted Canvas commits.

use crate::Result;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RecoveryAction {
    RemovedTemporary(PathBuf),
    RestoredBackup(PathBuf),
    KeptDestination(PathBuf),
}

pub fn recover_directory(directory: impl AsRef<Path>) -> Result<Vec<RecoveryAction>> {
    let directory = directory.as_ref();
    let mut actions = Vec::new();
    if !directory.exists() {
        return Ok(actions);
    }
    for entry in std::fs::read_dir(directory)? {
        let path = entry?.path();
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        if name.starts_with(".hybrid-canvas-") && name.ends_with(".tmp") {
            std::fs::remove_file(&path)?;
            actions.push(RecoveryAction::RemovedTemporary(path));
        } else if name.ends_with(".draw.backup") {
            let destination = path.with_extension("");
            if destination.exists() {
                std::fs::remove_file(&path)?;
                actions.push(RecoveryAction::KeptDestination(destination));
            } else {
                std::fs::rename(&path, &destination)?;
                actions.push(RecoveryAction::RestoredBackup(destination));
            }
        }
    }
    Ok(actions)
}

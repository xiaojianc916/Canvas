//! Crash recovery helpers for interrupted Canvas commits.

use crate::Result;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RecoveryAction {
    RemovedTemporary(PathBuf),
    RestoredBackup(PathBuf),
    KeptDestination(PathBuf),
}

pub fn recover_directory(
    directory: impl AsRef<Path>,
) -> Result<Vec<RecoveryAction>> {
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

        if name.starts_with(".hybrid-canvas-")
            && name.ends_with(".tmp")
        {
            std::fs::remove_file(&path)?;
            actions.push(
                RecoveryAction::RemovedTemporary(path),
            );
            continue;
        }

        let Some(destination) =
            backup_destination(&path)
        else {
            continue;
        };

        if destination.exists() {
            std::fs::remove_file(&path)?;
            actions.push(
                RecoveryAction::KeptDestination(
                    destination,
                ),
            );
        } else {
            std::fs::rename(&path, &destination)?;
            actions.push(
                RecoveryAction::RestoredBackup(
                    destination,
                ),
            );
        }
    }

    Ok(actions)
}

fn backup_destination(
    backup: &Path,
) -> Option<PathBuf> {
    let name = backup
        .file_name()?
        .to_str()?;

    let destination_name = name
        .strip_prefix('.')?
        .strip_suffix(".backup")?;

    if !destination_name.ends_with(".draw") {
        return None;
    }

    Some(
        backup.with_file_name(
            destination_name,
        ),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_interrupted_temporary_files() {
        let directory = tempfile::tempdir().unwrap();
        let temporary = directory
            .path()
            .join(".hybrid-canvas-test.tmp");

        std::fs::write(&temporary, b"partial").unwrap();

        let actions =
            recover_directory(directory.path()).unwrap();

        assert!(!temporary.exists());
        assert_eq!(
            actions,
            vec![RecoveryAction::RemovedTemporary(
                temporary,
            )]
        );
    }

    #[test]
    fn restores_windows_backup_to_original_name() {
        let directory = tempfile::tempdir().unwrap();
        let backup =
            directory.path().join(".canvas.draw.backup");
        let destination =
            directory.path().join("canvas.draw");

        std::fs::write(&backup, b"previous").unwrap();

        let actions =
            recover_directory(directory.path()).unwrap();

        assert!(!backup.exists());
        assert_eq!(
            std::fs::read(&destination).unwrap(),
            b"previous"
        );
        assert_eq!(
            actions,
            vec![RecoveryAction::RestoredBackup(
                destination,
            )]
        );
    }

    #[test]
    fn keeps_existing_destination() {
        let directory = tempfile::tempdir().unwrap();
        let backup =
            directory.path().join(".canvas.draw.backup");
        let destination =
            directory.path().join("canvas.draw");

        std::fs::write(&backup, b"previous").unwrap();
        std::fs::write(&destination, b"current").unwrap();

        let actions =
            recover_directory(directory.path()).unwrap();

        assert!(!backup.exists());
        assert_eq!(
            std::fs::read(&destination).unwrap(),
            b"current"
        );
        assert_eq!(
            actions,
            vec![RecoveryAction::KeptDestination(
                destination,
            )]
        );
    }
}

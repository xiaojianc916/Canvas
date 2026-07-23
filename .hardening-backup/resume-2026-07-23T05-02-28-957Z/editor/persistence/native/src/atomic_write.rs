//! Crash-safe replacement of a file within its containing directory.

use crate::{Error, Result};
#[cfg(not(windows))]
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};

pub fn atomic_write(path: impl AsRef<Path>, content: &[u8]) -> Result<()> {
    let path = path.as_ref();
    let parent = path
        .parent()
        .ok_or_else(|| Error::Internal("target path has no parent".into()))?;
    std::fs::create_dir_all(parent)?;

    let mut temporary = tempfile::Builder::new()
        .prefix(".hybrid-canvas-")
        .suffix(".tmp")
        .tempfile_in(parent)?;
    temporary.write_all(content)?;
    temporary.as_file().sync_all()?;
    replace_file(temporary.path(), path)?;
    sync_parent(parent)?;
    Ok(())
}

#[cfg(not(windows))]
fn replace_file(source: &Path, destination: &Path) -> Result<()> {
    std::fs::rename(source, destination)?;
    Ok(())
}

#[cfg(windows)]
fn replace_file(source: &Path, destination: &Path) -> Result<()> {
    let backup = backup_path(destination);
    if destination.exists() {
        std::fs::rename(destination, &backup)?;
    }
    match std::fs::rename(source, destination) {
        Ok(()) => {
            let _ = std::fs::remove_file(backup);
            Ok(())
        }
        Err(error) => {
            let _ = std::fs::rename(backup, destination);
            Err(error.into())
        }
    }
}

#[cfg(windows)]
fn backup_path(destination: &Path) -> PathBuf {
    let name = destination
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("canvas.draw");
    destination.with_file_name(format!(".{name}.backup"))
}

fn sync_parent(parent: &Path) -> Result<()> {
    #[cfg(not(windows))]
    File::open(parent)?.sync_all()?;
    #[cfg(windows)]
    let _ = parent;
    Ok(())
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn atomic_write_creates_and_replaces_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("canvas.draw");

        atomic_write(&path, b"first").unwrap();
        assert_eq!(
            std::fs::read(&path).unwrap(),
            b"first"
        );

        atomic_write(&path, b"second").unwrap();
        assert_eq!(
            std::fs::read(&path).unwrap(),
            b"second"
        );
    }

    #[test]
    fn successful_write_leaves_no_temporary_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("canvas.draw");

        atomic_write(&path, b"content").unwrap();

        let temporary_count =
            std::fs::read_dir(directory.path())
                .unwrap()
                .filter_map(std::result::Result::ok)
                .filter(|entry| {
                    entry
                        .file_name()
                        .to_string_lossy()
                        .starts_with(".hybrid-canvas-")
                })
                .count();

        assert_eq!(temporary_count, 0);
    }
}

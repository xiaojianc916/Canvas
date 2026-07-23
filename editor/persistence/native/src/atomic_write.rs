//! Crash-safe replacement of a document file.
//!
//! The persistence contract has one save path on every supported platform:
//!
//! 1. Create a uniquely named temporary file in the destination directory.
//! 2. Write the complete document.
//! 3. Synchronize the temporary file.
//! 4. Rename the temporary file over the destination.
//! 5. Synchronize the containing directory where the platform supports it.
//!
//! Keeping the temporary file in the destination directory guarantees that the
//! replacement stays on one filesystem. If writing or replacement fails, the
//! original destination is left untouched and NamedTempFile removes the
//! temporary file during drop.

use crate::{Error, Result};
#[cfg(unix)]
#[cfg(unix)]\nuse std::fs::File;
use std::io::Write;
use std::path::Path;

const TEMPORARY_FILE_PREFIX: &str = ".hybrid-canvas-";
const TEMPORARY_FILE_SUFFIX: &str = ".tmp";

pub fn atomic_write(path: impl AsRef<Path>, content: &[u8]) -> Result<()> {
    let destination = path.as_ref();
    let parent = destination
        .parent()
        .ok_or_else(|| Error::Internal("target path has no parent directory".into()))?;

    std::fs::create_dir_all(parent)?;

    let mut temporary = tempfile::Builder::new()
        .prefix(TEMPORARY_FILE_PREFIX)
        .suffix(TEMPORARY_FILE_SUFFIX)
        .tempfile_in(parent)?;

    temporary.write_all(content)?;
    temporary.as_file().sync_all()?;

    replace_destination(temporary.path(), destination)?;
    sync_directory(parent)?;

    Ok(())
}

/// Replaces destination with source.
///
/// Both paths are in the same parent directory, therefore they are on the same
/// filesystem. Rust's std::fs::rename is the single cross-platform replacement
/// primitive used by this persistence backend.
fn replace_destination(source: &Path, destination: &Path) -> Result<()> {
    std::fs::rename(source, destination)?;
    Ok(())
}

/// Synchronizes directory metadata after a successful rename where supported.
///
/// Windows does not provide a portable std::fs directory synchronization API.
/// The file itself is already synchronized before replacement. The replacement
/// remains a single operation; no backup/delete/copy fallback is used.
fn sync_directory(directory: &Path) -> Result<()> {
    #[cfg(unix)]
    {
        File::open(directory)?.sync_all()?;
    }

    #[cfg(not(unix))]
    {
        let _ = directory;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary_file_count(directory: &Path) -> usize {
        std::fs::read_dir(directory)
            .expect("temporary directory should be readable")
            .filter_map(std::result::Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with(TEMPORARY_FILE_PREFIX)
            })
            .count()
    }

    #[test]
    fn creates_a_new_document() {
        let directory = tempfile::tempdir().expect("temporary directory should be created");
        let destination = directory.path().join("canvas.draw");

        atomic_write(&destination, b"first version").expect("first write should succeed");

        assert_eq!(
            std::fs::read(&destination).expect("destination should be readable"),
            b"first version",
        );
        assert_eq!(temporary_file_count(directory.path()), 0);
    }

    #[test]
    fn replaces_an_existing_document() {
        let directory = tempfile::tempdir().expect("temporary directory should be created");
        let destination = directory.path().join("canvas.draw");

        std::fs::write(&destination, b"old version").expect("fixture should be written");

        atomic_write(&destination, b"new version").expect("replacement write should succeed");

        assert_eq!(
            std::fs::read(&destination).expect("destination should be readable"),
            b"new version",
        );
        assert_eq!(temporary_file_count(directory.path()), 0);
    }

    #[test]
    fn writes_empty_document_without_leaving_temporary_files() {
        let directory = tempfile::tempdir().expect("temporary directory should be created");
        let destination = directory.path().join("empty.draw");

        atomic_write(&destination, b"").expect("empty write should succeed");

        assert_eq!(
            std::fs::read(&destination).expect("destination should be readable"),
            b"",
        );
        assert_eq!(temporary_file_count(directory.path()), 0);
    }

    #[test]
    fn fails_when_destination_parent_is_a_file() {
        let directory = tempfile::tempdir().expect("temporary directory should be created");
        let parent_file = directory.path().join("not-a-directory");

        std::fs::write(&parent_file, b"fixture").expect("fixture should be written");

        let destination = parent_file.join("canvas.draw");
        let result = atomic_write(&destination, b"content");

        assert!(result.is_err());
        assert_eq!(
            std::fs::read(&parent_file).expect("parent fixture should remain readable"),
            b"fixture",
        );
    }
}

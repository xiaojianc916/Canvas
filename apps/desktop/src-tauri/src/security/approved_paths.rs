use crate::{Error, Result};
use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use std::sync::RwLock;

/// Stores exact paths explicitly selected through a native file dialog.
///
/// Renderer-provided paths are never trusted on their own. A path must first
/// be approved by file_open or file_save during the current application
/// process.
#[derive(Default)]
pub struct ApprovedPathRegistry {
    paths: RwLock<HashSet<PathBuf>>,
}

impl ApprovedPathRegistry {
    pub fn approve(&self, path: &Path) -> Result<PathBuf> {
        let normalized = normalize_path(path)?;
        let mut paths = self.paths.write().map_err(|_| {
            Error::Internal(
                "approved path registry write lock poisoned".into(),
            )
        })?;

        paths.insert(normalized.clone());
        Ok(normalized)
    }

    pub fn require(&self, path: &Path) -> Result<PathBuf> {
        let normalized = normalize_path(path)?;
        let paths = self.paths.read().map_err(|_| {
            Error::Internal(
                "approved path registry read lock poisoned".into(),
            )
        })?;

        if paths.contains(&normalized) {
            return Ok(normalized);
        }

        Err(Error::PermissionDenied(format!(
            "path was not approved by a native file dialog: {}",
            normalized.display()
        )))
    }
}

fn normalize_path(path: &Path) -> Result<PathBuf> {
    if path.as_os_str().is_empty() {
        return Err(Error::Validation(
            "file path cannot be empty".into(),
        ));
    }

    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()?.join(path)
    };

    if absolute.exists() {
        return Ok(absolute.canonicalize()?);
    }

    let mut normalized = PathBuf::new();

    for component in absolute.components() {
        match component {
            Component::Prefix(prefix) => {
                normalized.push(prefix.as_os_str());
            }
            Component::RootDir => {
                normalized.push(component.as_os_str());
            }
            Component::CurDir => {}
            Component::ParentDir => {
                if !normalized.pop() {
                    return Err(Error::Validation(
                        "file path escapes its root".into(),
                    ));
                }
            }
            Component::Normal(value) => {
                normalized.push(value);
            }
        }
    }

    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unapproved_paths() {
        let directory = tempfile::tempdir().unwrap();
        let registry = ApprovedPathRegistry::default();
        let path = directory.path().join("canvas.draw");

        let error = registry.require(&path).unwrap_err();

        assert!(matches!(error, Error::PermissionDenied(_)));
    }

    #[test]
    fn accepts_the_exact_approved_path() {
        let directory = tempfile::tempdir().unwrap();
        let registry = ApprovedPathRegistry::default();
        let path = directory.path().join("canvas.draw");

        registry.approve(&path).unwrap();

        assert_eq!(
            registry.require(&path).unwrap(),
            path
        );
    }

    #[test]
    fn does_not_authorize_sibling_paths() {
        let directory = tempfile::tempdir().unwrap();
        let registry = ApprovedPathRegistry::default();
        let approved = directory.path().join("one.draw");
        let sibling = directory.path().join("two.draw");

        registry.approve(&approved).unwrap();

        assert!(matches!(
            registry.require(&sibling),
            Err(Error::PermissionDenied(_))
        ));
    }

    #[test]
    fn normalizes_relative_segments() {
        let directory = tempfile::tempdir().unwrap();
        let registry = ApprovedPathRegistry::default();
        let path = directory
            .path()
            .join("folder")
            .join("..")
            .join("canvas.draw");

        registry.approve(&path).unwrap();

        assert_eq!(
            registry.require(&path).unwrap(),
            directory.path().join("canvas.draw")
        );
    }
}

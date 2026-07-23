use crate::{Error, Result};
use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use std::sync::RwLock;

/// Stores exact paths explicitly selected through a native file dialog.
///
/// Renderer-provided paths are never trusted on their own. A path must first
/// be approved by file_open or file_save during the current application
/// process.
///
/// For an existing target, the registry stores its canonical path. For a new
/// target, it stores the canonical existing parent directory plus the target
/// file name. This makes a later parent-directory symlink replacement visible
/// when `require` resolves the path again.
#[derive(Debug, Default)]
pub struct ApprovedPathRegistry {
    paths: RwLock<HashSet<PathBuf>>,
}

impl ApprovedPathRegistry {
    pub fn approve(&self, path: &Path) -> Result<PathBuf> {
        let resolved = resolve_approved_path(path)?;
        let mut paths = self
            .paths
            .write()
            .map_err(|_| Error::Internal("approved path registry write lock poisoned".into()))?;

        paths.insert(resolved.clone());
        Ok(resolved)
    }

    pub fn require(&self, path: &Path) -> Result<PathBuf> {
        let resolved = resolve_approved_path(path)?;
        let paths = self
            .paths
            .read()
            .map_err(|_| Error::Internal("approved path registry read lock poisoned".into()))?;

        if paths.contains(&resolved) {
            return Ok(resolved);
        }

        Err(Error::PermissionDenied(
            "path was not approved by a native file dialog".into(),
        ))
    }
}

/// Resolves a path without trusting lexical parent components.
///
/// Existing paths are canonicalized in full. New files cannot be canonicalized
/// directly, so their nearest existing parent is canonicalized and the requested
/// file name is appended afterwards. This preserves the distinction between:
///
/// - `/safe/new.draw`
/// - `/safe-link/new.draw`, where `safe-link` points elsewhere.
///
/// A parent replacement between dialog approval and a later command invocation
/// changes the resolved value and is rejected by `ApprovedPathRegistry::require`.
fn resolve_approved_path(path: &Path) -> Result<PathBuf> {
    let absolute = normalize_absolute_path(path)?;

    if absolute.exists() {
        return Ok(absolute.canonicalize()?);
    }

    let parent = absolute
        .parent()
        .ok_or_else(|| Error::Validation("file path has no parent directory".into()))?;

    let file_name = absolute
        .file_name()
        .ok_or_else(|| Error::Validation("file path must name a file".into()))?;

    let canonical_parent = parent.canonicalize().map_err(|error| {
        Error::Validation(format!(
            "file parent directory must exist and be accessible: {error}"
        ))
    })?;

    Ok(canonical_parent.join(file_name))
}

fn normalize_absolute_path(path: &Path) -> Result<PathBuf> {
    if path.as_os_str().is_empty() {
        return Err(Error::Validation("file path cannot be empty".into()));
    }

    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()?.join(path)
    };

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
                    return Err(Error::Validation("file path escapes its root".into()));
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

        assert_eq!(registry.require(&path).unwrap(), path);
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
    fn resolves_relative_segments_before_approval() {
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

    #[cfg(unix)]
    #[test]
    fn rejects_new_file_when_parent_symlink_target_changes() {
        use std::os::unix::fs::symlink;

        let directory = tempfile::tempdir().unwrap();
        let first_target = directory.path().join("first");
        let second_target = directory.path().join("second");
        let link = directory.path().join("selected-directory");

        std::fs::create_dir(&first_target).unwrap();
        std::fs::create_dir(&second_target).unwrap();
        symlink(&first_target, &link).unwrap();

        let registry = ApprovedPathRegistry::default();
        let selected_path = link.join("canvas.draw");

        registry.approve(&selected_path).unwrap();

        std::fs::remove_file(&link).unwrap();
        symlink(&second_target, &link).unwrap();

        let error = registry.require(&selected_path).unwrap_err();

        assert!(matches!(error, Error::PermissionDenied(_)));
        assert!(!second_target.join("canvas.draw").exists());
    }

    #[test]
    fn canonicalizes_existing_file_targets() {
        let directory = tempfile::tempdir().unwrap();
        let nested = directory.path().join("nested");
        std::fs::create_dir(&nested).unwrap();

        let file = nested.join("canvas.draw");
        std::fs::write(&file, b"content").unwrap();

        let registry = ApprovedPathRegistry::default();
        registry.approve(&file).unwrap();

        assert_eq!(
            registry.require(&file).unwrap(),
            file.canonicalize().unwrap()
        );
    }
}

pub enum Error {
    NotFound(String),
    Integrity(String),
    Io(std::io::Error),
    Internal(String),
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::NotFound(e) => write!(f, "not found: {e}"),
            Error::Integrity(e) => write!(f, "integrity: {e}"),
            Error::Io(e) => write!(f, "IO: {e}"),
            Error::Internal(e) => write!(f, "internal: {e}"),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Error::Io(e) => Some(e),
            _ => None,
        }
    }
}

pub type Result<T> = std::result::Result<T, Error>;

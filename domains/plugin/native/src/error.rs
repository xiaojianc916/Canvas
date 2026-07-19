pub enum Error {
    InvalidPackage(String),
    Signature(String),
    Integrity(String),
    Trust(String),
    Io(std::io::Error),
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::InvalidPackage(e) => write!(f, "invalid package: {e}"),
            Error::Signature(e) => write!(f, "signature: {e}"),
            Error::Integrity(e) => write!(f, "integrity: {e}"),
            Error::Trust(e) => write!(f, "trust: {e}"),
            Error::Io(e) => write!(f, "IO: {e}"),
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

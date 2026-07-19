#[derive(Debug)]
pub enum Error {
    Io(std::io::Error),
    LockConflict(String),
    CorruptedContainer(String),
    Recovery(String),
    Internal(String),
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::Io(e) => write!(f, "IO: {e}"),
            Error::LockConflict(e) => write!(f, "lock conflict: {e}"),
            Error::CorruptedContainer(e) => write!(f, "corrupted container: {e}"),
            Error::Recovery(e) => write!(f, "recovery: {e}"),
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
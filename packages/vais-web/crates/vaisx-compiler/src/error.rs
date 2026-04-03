//! Error types for the VaisX compiler.

/// Errors that can occur during VaisX compilation.
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum CompileError {
    /// A parse error propagated from the parser.
    #[error("parse error: {0}")]
    ParseError(#[from] vaisx_parser::ParseError),

    /// A reactive variable was referenced but not declared.
    #[error("undefined reactive variable `{name}` at byte {offset}")]
    UndefinedVariable { name: String, offset: usize },

    /// A circular dependency was detected among derived variables.
    #[error("circular dependency detected: {cycle}")]
    CircularDependency { cycle: String },

    /// A `$state` variable was declared with an invalid initializer.
    #[error("invalid state initializer for `{name}`: {reason}")]
    InvalidStateInit { name: String, reason: String },

    /// A `$derived` expression references a non-reactive variable.
    #[error("derived `{name}` references non-reactive variable `{referenced}`")]
    NonReactiveDependency { name: String, referenced: String },

    /// Template references an undefined variable or function.
    #[error("template references undefined identifier `{name}` at byte {offset}")]
    UndefinedTemplateRef { name: String, offset: usize },

    /// A component prop type mismatch or missing required prop.
    #[error("prop error for `{prop}` on component `{component}`: {reason}")]
    PropError {
        component: String,
        prop: String,
        reason: String,
    },

    /// Code generation error.
    #[error("codegen error: {message}")]
    CodegenError { message: String },

    /// General compilation error.
    #[error("{message} at byte {offset}")]
    General { message: String, offset: usize },
}

impl CompileError {
    /// Returns the byte offset where this error occurred, if available.
    pub fn offset(&self) -> Option<usize> {
        match self {
            Self::ParseError(e) => Some(e.offset()),
            Self::UndefinedVariable { offset, .. } => Some(*offset),
            Self::CircularDependency { .. } => None,
            Self::InvalidStateInit { .. } => None,
            Self::NonReactiveDependency { .. } => None,
            Self::UndefinedTemplateRef { offset, .. } => Some(*offset),
            Self::PropError { .. } => None,
            Self::CodegenError { .. } => None,
            Self::General { offset, .. } => Some(*offset),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compile_error_display() {
        let err = CompileError::UndefinedVariable {
            name: "count".to_string(),
            offset: 42,
        };
        assert_eq!(
            err.to_string(),
            "undefined reactive variable `count` at byte 42"
        );
    }

    #[test]
    fn compile_error_offset() {
        let err = CompileError::UndefinedVariable {
            name: "x".to_string(),
            offset: 10,
        };
        assert_eq!(err.offset(), Some(10));

        let err = CompileError::CircularDependency {
            cycle: "a -> b -> a".to_string(),
        };
        assert_eq!(err.offset(), None);
    }

    #[test]
    fn compile_error_from_parse_error() {
        let parse_err = vaisx_parser::ParseError::UnexpectedEof(100);
        let compile_err: CompileError = parse_err.into();
        assert_eq!(compile_err.offset(), Some(100));
        assert!(compile_err.to_string().contains("parse error"));
    }
}

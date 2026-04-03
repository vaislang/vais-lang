//! # vaisx-compiler
//!
//! Reactivity compiler for `.vaisx` files.
//!
//! ## Pipeline
//!
//! ```text
//! VaisxFile AST (from vaisx-parser)
//!     |
//!     +-- analysis:   Reactive variable extraction & dependency graph building
//!     +-- codegen:    JS code generation from dependency graph
//!     |
//!     v
//! Compiled JS output
//! ```
//!
//! ## Usage
//!
//! ```ignore
//! use vaisx_compiler::{compile, CompileOptions};
//!
//! let source = r#"<script>
//!   count := $state(0)
//! </script>
//! <template>
//!   <button @click={increment}>{count}</button>
//! </template>"#;
//!
//! let result = compile(source, CompileOptions::default())?;
//! println!("{}", result.js);
//! ```

pub mod analyze;
pub mod codegen_js;
pub mod error;
pub mod ir;

pub use analyze::analyze;
pub use error::CompileError;
pub use ir::{
    BindingKind, ComponentIR, DependencyGraph, DerivedVar, EffectVar, EventIR, FunctionIR,
    PropsIR, PropFieldIR, ReactiveVar, TemplateBinding,
};

/// Options for the compiler.
#[derive(Debug, Clone)]
pub struct CompileOptions {
    /// Component name (if not provided, defaults to `"Component"`).
    pub component_name: Option<String>,
    /// Whether to generate source maps.
    pub source_map: bool,
    /// Whether to generate development-mode code (extra validation, HMR hooks).
    pub dev_mode: bool,
}

impl Default for CompileOptions {
    fn default() -> Self {
        Self {
            component_name: None,
            source_map: false,
            dev_mode: false,
        }
    }
}

/// The result of compiling a `.vaisx` file.
#[derive(Debug, Clone)]
pub struct CompileResult {
    /// The generated JavaScript code.
    pub js: String,
    /// Optional source map (if `CompileOptions::source_map` was true).
    pub source_map: Option<String>,
    /// The component IR (for inspection/debugging).
    pub ir: ComponentIR,
    /// Warnings produced during compilation (non-fatal).
    pub warnings: Vec<String>,
}

/// Compile a `.vaisx` source string into JavaScript.
///
/// This is the main entry point for the compiler. It parses the source,
/// analyzes reactive dependencies, and generates JS code.
pub fn compile(source: &str, options: CompileOptions) -> Result<CompileResult, CompileError> {
    // Step 1: Parse the .vaisx source
    let file = vaisx_parser::parse(source)?;

    let component_name = options
        .component_name
        .unwrap_or_else(|| "Component".to_string());

    // Step 2: Build the component IR (analysis phase)
    let ir = analyze::analyze(&file, &component_name)?;

    // Step 3: Generate JS code
    let js = codegen_js::generate_js(&ir, &file);

    Ok(CompileResult {
        js,
        source_map: None,
        ir,
        warnings: vec![],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compile_empty_source() {
        let result = compile("", CompileOptions::default()).unwrap();
        assert_eq!(result.ir.name, "Component");
        assert!(!result.ir.has_reactivity);
    }

    #[test]
    fn compile_with_state_has_reactivity() {
        let source = r#"<script>
  count := $state(0)
</script>"#;
        let result = compile(source, CompileOptions::default()).unwrap();
        assert!(result.ir.has_reactivity);
        assert!(result.ir.dependency_graph.state_vars.contains_key("count"));
    }

    #[test]
    fn compile_with_custom_name() {
        let options = CompileOptions {
            component_name: Some("Counter".to_string()),
            ..Default::default()
        };
        let result = compile("", options).unwrap();
        assert_eq!(result.ir.name, "Counter");
    }

    #[test]
    fn compile_with_props() {
        let source = r#"<script>
  P {
    user: User
    showAvatar: bool = true
  }
</script>"#;
        let result = compile(source, CompileOptions::default()).unwrap();
        let props = result.ir.props.unwrap();
        assert_eq!(props.fields.len(), 2);
        assert_eq!(props.fields[0].name, "user");
        assert_eq!(props.fields[1].name, "showAvatar");
        assert_eq!(props.fields[1].default_value, Some("true".to_string()));
    }

    #[test]
    fn compile_with_events() {
        let source = r#"<script>
  P {
    user: User
    emit select(user: User)
  }
</script>"#;
        let result = compile(source, CompileOptions::default()).unwrap();
        assert_eq!(result.ir.events.len(), 1);
        assert_eq!(result.ir.events[0].name, "select");
    }

    #[test]
    fn compile_invalid_source_returns_error() {
        let source = "<script>count := $state(0)</script>\n<script>x := 1</script>";
        let result = compile(source, CompileOptions::default());
        assert!(result.is_err());
    }

    #[test]
    fn compile_options_default() {
        let opts = CompileOptions::default();
        assert!(opts.component_name.is_none());
        assert!(!opts.source_map);
        assert!(!opts.dev_mode);
    }
}

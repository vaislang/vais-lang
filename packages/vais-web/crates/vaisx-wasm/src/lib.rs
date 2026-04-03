//! # vaisx-wasm
//!
//! WASM bindings for the VaisX parser and compiler.
//!
//! Exposes [`parse`] and [`compile`] as `wasm-bindgen` functions callable
//! from JavaScript / Node.js.
//!
//! ## JS Usage
//!
//! ```js
//! const { parse, compile } = require("vaisx-wasm");
//!
//! // Parse only — returns JSON AST
//! const ast = parse(source);
//!
//! // Compile — returns JSON { js, warnings }
//! const result = compile(source, { componentName: "Counter", devMode: false });
//! ```

use wasm_bindgen::prelude::*;

/// Parse a `.vaisx` source string and return the AST as a JSON string.
///
/// Returns a JSON object with shape:
/// ```json
/// {
///   "ok": true,
///   "ast": { "script": ..., "template": ..., "styles": [...] }
/// }
/// ```
/// On error:
/// ```json
/// {
///   "ok": false,
///   "error": "error message",
///   "offset": 42
/// }
/// ```
#[wasm_bindgen]
pub fn parse(source: &str) -> String {
    match vaisx_parser::parse(source) {
        Ok(_file) => {
            // Serialize a simplified representation of the AST.
            let ast = serialize_file(&_file);
            format!(r#"{{"ok":true,"ast":{}}}"#, ast)
        }
        Err(e) => {
            let offset = e.offset();
            let msg = e.to_string().replace('\\', "\\\\").replace('"', "\\\"");
            format!(r#"{{"ok":false,"error":"{}","offset":{}}}"#, msg, offset)
        }
    }
}

/// Parse a `.vaisx` source string with error recovery.
///
/// Always returns a (possibly partial) AST along with any errors.
///
/// Returns JSON:
/// ```json
/// {
///   "ast": { ... },
///   "errors": [{ "message": "...", "offset": 42 }, ...]
/// }
/// ```
#[wasm_bindgen(js_name = "parseWithRecovery")]
pub fn parse_with_recovery(source: &str) -> String {
    let (file, errors) = vaisx_parser::parse_with_recovery(source);
    let ast = serialize_file(&file);
    let errors_json: Vec<String> = errors
        .iter()
        .map(|e| {
            let msg = e.to_string().replace('\\', "\\\\").replace('"', "\\\"");
            format!(r#"{{"message":"{}","offset":{}}}"#, msg, e.offset())
        })
        .collect();
    format!(
        r#"{{"ast":{},"errors":[{}]}}"#,
        ast,
        errors_json.join(",")
    )
}

/// Compile a `.vaisx` source string into JavaScript.
///
/// `options_json` is an optional JSON string with shape:
/// ```json
/// {
///   "componentName": "Counter",
///   "sourceMap": false,
///   "devMode": false
/// }
/// ```
///
/// Returns JSON:
/// ```json
/// {
///   "ok": true,
///   "js": "compiled JS code...",
///   "sourceMap": null,
///   "warnings": []
/// }
/// ```
/// On error:
/// ```json
/// {
///   "ok": false,
///   "error": "error message",
///   "offset": null
/// }
/// ```
#[wasm_bindgen]
pub fn compile(source: &str, options_json: Option<String>) -> String {
    let options = parse_compile_options(options_json);

    match vaisx_compiler::compile(source, options) {
        Ok(result) => {
            let js_escaped = json_escape(&result.js);
            let source_map = match &result.source_map {
                Some(sm) => format!(r#""{}""#, json_escape(sm)),
                None => "null".to_string(),
            };
            let warnings: Vec<String> = result
                .warnings
                .iter()
                .map(|w| format!(r#""{}""#, json_escape(w)))
                .collect();
            format!(
                r#"{{"ok":true,"js":"{}","sourceMap":{},"warnings":[{}]}}"#,
                js_escaped,
                source_map,
                warnings.join(",")
            )
        }
        Err(e) => {
            let offset = match e.offset() {
                Some(o) => o.to_string(),
                None => "null".to_string(),
            };
            let msg = json_escape(&e.to_string());
            format!(r#"{{"ok":false,"error":"{}","offset":{}}}"#, msg, offset)
        }
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn parse_compile_options(json: Option<String>) -> vaisx_compiler::CompileOptions {
    let mut opts = vaisx_compiler::CompileOptions::default();

    if let Some(json_str) = json {
        // Minimal JSON parsing — avoid pulling in a full serde pipeline for three fields.
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&json_str) {
            if let Some(name) = val.get("componentName").and_then(|v| v.as_str()) {
                opts.component_name = Some(name.to_string());
            }
            if let Some(sm) = val.get("sourceMap").and_then(|v| v.as_bool()) {
                opts.source_map = sm;
            }
            if let Some(dev) = val.get("devMode").and_then(|v| v.as_bool()) {
                opts.dev_mode = dev;
            }
        }
    }

    opts
}

fn json_escape(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

/// Serialize a VaisxFile to a simplified JSON representation.
fn serialize_file(file: &vaisx_parser::VaisxFile) -> String {
    let script = match &file.script {
        Some(s) => {
            let ctx = match s.node.context {
                vaisx_parser::ScriptContext::Auto => "auto",
                vaisx_parser::ScriptContext::Client => "client",
                vaisx_parser::ScriptContext::Server => "server",
            };
            let desugared = match &s.node.desugared_source {
                Some(d) => format!(r#""{}""#, json_escape(d)),
                None => "null".to_string(),
            };

            let props = match &s.node.props {
                Some(p) => {
                    let fields: Vec<String> = p
                        .node
                        .fields
                        .iter()
                        .map(|f| {
                            let default = match &f.node.default_value {
                                Some(d) => format!(r#""{}""#, json_escape(d)),
                                None => "null".to_string(),
                            };
                            format!(
                                r#"{{"name":"{}","type":"{}","default":{}}}"#,
                                json_escape(&f.node.name),
                                json_escape(&f.node.type_annotation),
                                default
                            )
                        })
                        .collect();
                    format!("[{}]", fields.join(","))
                }
                None => "null".to_string(),
            };

            let events: Vec<String> = s
                .node
                .events
                .iter()
                .map(|e| {
                    format!(
                        r#"{{"name":"{}","params":"{}"}}"#,
                        json_escape(&e.node.name),
                        json_escape(&e.node.params)
                    )
                })
                .collect();

            format!(
                r#"{{"context":"{}","rawSource":"{}","desugaredSource":{},"props":{},"events":[{}]}}"#,
                ctx,
                json_escape(&s.node.raw_source),
                desugared,
                props,
                events.join(",")
            )
        }
        None => "null".to_string(),
    };

    let template = match &file.template {
        Some(t) => {
            let child_count = t.node.children.len();
            // Provide a summary — full AST serialization can be added later.
            format!(r#"{{"childCount":{}}}"#, child_count)
        }
        None => "null".to_string(),
    };

    let styles: Vec<String> = file
        .styles
        .iter()
        .map(|s| {
            format!(
                r#"{{"isGlobal":{},"rawCss":"{}","ruleCount":{}}}"#,
                s.node.is_global,
                json_escape(&s.node.raw_css),
                s.node.rules.len()
            )
        })
        .collect();

    format!(
        r#"{{"script":{},"template":{},"styles":[{}]}}"#,
        script,
        template,
        styles.join(",")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_empty_source() {
        let result = parse("");
        assert!(result.contains(r#""ok":true"#));
        assert!(result.contains(r#""script":null"#));
        assert!(result.contains(r#""template":null"#));
    }

    #[test]
    fn parse_valid_source() {
        let source = r#"<script>
  count := $state(0)
</script>
<template>
  <button>{count}</button>
</template>"#;
        let result = parse(source);
        assert!(result.contains(r#""ok":true"#));
        assert!(result.contains(r#""context":"auto""#));
    }

    #[test]
    fn parse_invalid_source_returns_error() {
        let source = "<script>a</script>\n<script>b</script>";
        let result = parse(source);
        assert!(result.contains(r#""ok":false"#));
        assert!(result.contains(r#""error":"#));
    }

    #[test]
    fn parse_with_recovery_returns_errors() {
        let source = "<script>a</script>\n<script>b</script>";
        let result = parse_with_recovery(source);
        assert!(result.contains(r#""errors":["#));
        assert!(result.contains(r#""ast":"#));
    }

    #[test]
    fn compile_empty_source() {
        let result = compile("", None);
        assert!(result.contains(r#""ok":true"#));
        assert!(result.contains(r#""js":"#));
    }

    #[test]
    fn compile_with_options() {
        let options = r#"{"componentName":"Counter","devMode":false}"#;
        let result = compile("", Some(options.to_string()));
        assert!(result.contains(r#""ok":true"#));
    }

    #[test]
    fn compile_invalid_source() {
        let source = "<script>a</script>\n<script>b</script>";
        let result = compile(source, None);
        assert!(result.contains(r#""ok":false"#));
    }

    #[test]
    fn json_escape_special_chars() {
        assert_eq!(json_escape("hello\nworld"), "hello\\nworld");
        assert_eq!(json_escape(r#"say "hi""#), r#"say \"hi\""#);
        assert_eq!(json_escape("a\\b"), "a\\\\b");
    }

    #[test]
    fn parse_compile_options_none() {
        let opts = parse_compile_options(None);
        assert!(opts.component_name.is_none());
        assert!(!opts.source_map);
        assert!(!opts.dev_mode);
    }

    #[test]
    fn parse_compile_options_with_values() {
        let json = r#"{"componentName":"App","sourceMap":true,"devMode":true}"#;
        let opts = parse_compile_options(Some(json.to_string()));
        assert_eq!(opts.component_name, Some("App".to_string()));
        assert!(opts.source_map);
        assert!(opts.dev_mode);
    }
}

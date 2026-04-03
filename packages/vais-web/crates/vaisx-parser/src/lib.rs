//! # vaisx-parser
//!
//! Parser for `.vaisx` files — the VaisX single-file component format.
//!
//! ## Pipeline
//!
//! ```text
//! .vaisx source
//!     |
//!     +-- lexer.rs:     Block separation (<script>, <template>, <style>)
//!     +-- desugar.rs:   Script block desugar ($state -> __vx_state, etc.)
//!     +-- template.rs:  Template block parser (HTML + VaisX directives)
//!     +-- style.rs:     Style block parser (CSS)
//!     |
//!     v
//! VaisxFile AST
//! ```
//!
//! ## Usage
//!
//! ```ignore
//! use vaisx_parser::{parse, parse_with_recovery, VaisxFile};
//!
//! // Strict parsing — returns Err on first error
//! let file = parse(source)?;
//!
//! // Error-recovery parsing — returns partial AST + errors
//! let (file, errors) = parse_with_recovery(source);
//! ```

pub mod ast;
pub mod desugar;
pub mod lexer;
pub mod style;
pub mod template;

pub use ast::*;

/// Parse a `.vaisx` source string into a [`VaisxFile`] AST.
///
/// Returns `Err` on the first parse error encountered.
pub fn parse(source: &str) -> Result<VaisxFile, ParseError> {
    let (file, errors) = parse_with_recovery(source);
    if let Some(err) = errors.into_iter().next() {
        return Err(err);
    }
    Ok(file)
}

/// Parse a `.vaisx` source string with error recovery.
///
/// Returns a (possibly partial) [`VaisxFile`] AST together with
/// all parse errors encountered. The AST is as complete as possible
/// even when errors are present.
pub fn parse_with_recovery(source: &str) -> (VaisxFile, Vec<ParseError>) {
    let mut errors = Vec::new();

    // Step 1: Separate blocks
    let (blocks, block_errors) = lexer::separate_blocks(source);
    errors.extend(block_errors);

    // Step 2: Process script block (desugar)
    let script = blocks.script.map(|raw| {
        let context = match &raw.kind {
            lexer::BlockKind::Script { context } => *context,
            _ => ScriptContext::Auto,
        };

        // Run desugar pass
        let desugar_result = desugar::desugar(&raw.content, raw.inner_span.start);

        errors.extend(desugar_result.errors);

        Spanned::new(
            ScriptBlock {
                context,
                raw_source: raw.content,
                desugared_source: Some(desugar_result.source),
                props: desugar_result.props,
                events: desugar_result.events,
            },
            raw.outer_span,
        )
    });

    // Step 3: Parse template block
    let template = blocks.template.map(|raw| {
        let (children, template_errors) =
            template::parse_template(&raw.content, raw.inner_span.start);
        errors.extend(template_errors);

        Spanned::new(TemplateBlock { children }, raw.outer_span)
    });

    // Step 4: Parse style blocks
    let styles = blocks
        .styles
        .into_iter()
        .map(|raw| {
            let is_global = matches!(raw.kind, lexer::BlockKind::Style { is_global: true });

            let (rules, css_errors) = style::parse_css(&raw.content, raw.inner_span.start);
            errors.extend(css_errors);

            Spanned::new(
                StyleBlock {
                    is_global,
                    raw_css: raw.content,
                    rules,
                },
                raw.outer_span,
            )
        })
        .collect();

    let file = VaisxFile {
        script,
        template,
        styles,
    };

    (file, errors)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_empty_source() {
        let (file, errors) = parse_with_recovery("");
        assert!(errors.is_empty());
        assert!(file.script.is_none());
        assert!(file.template.is_none());
        assert!(file.styles.is_empty());
    }

    #[test]
    fn parse_strict_empty_source() {
        let file = parse("").unwrap();
        assert!(file.script.is_none());
        assert!(file.template.is_none());
        assert!(file.styles.is_empty());
    }

    #[test]
    fn parse_full_vaisx_file() {
        let source = r#"<script>
  count := $state(0)
  F increment() { count += 1 }
</script>

<template>
  <button @click={increment}>{count}</button>
</template>

<style>
  button { color: blue; }
</style>"#;
        let (file, errors) = parse_with_recovery(source);
        assert!(errors.is_empty(), "errors: {:?}", errors);

        // Script block — desugared
        let script = file.script.unwrap();
        assert_eq!(script.node.context, ScriptContext::Auto);
        assert!(script.node.raw_source.contains("$state(0)"));
        let desugared = script.node.desugared_source.as_ref().unwrap();
        assert!(desugared.contains("__vx_state(0)"));
        assert!(!desugared.contains("$state"));

        // Template block — parsed
        let tmpl = file.template.unwrap();
        assert!(!tmpl.node.children.is_empty());
        // Should have a button element
        let has_button = tmpl.node.children.iter().any(|n| {
            matches!(&n.node, TemplateNode::Element(el) if el.tag == "button")
        });
        assert!(has_button, "template should contain a button element");

        // Style block — parsed
        assert_eq!(file.styles.len(), 1);
        assert!(!file.styles[0].node.is_global);
        assert!(!file.styles[0].node.rules.is_empty());
        match &file.styles[0].node.rules[0].node {
            CssRule::Style(rule) => {
                assert_eq!(rule.selectors, vec!["button"]);
                assert_eq!(rule.declarations[0].property, "color");
                assert_eq!(rule.declarations[0].value, "blue");
            }
            _ => panic!("expected Style rule"),
        }
    }

    #[test]
    fn parse_script_with_desugar() {
        let source = r#"<script>
  count := $state(0)
  doubled := $derived(count * 2)
  $effect {
    console_log(count)
  }
</script>"#;
        let file = parse(source).unwrap();
        let script = file.script.unwrap();
        let desugared = script.node.desugared_source.unwrap();
        assert!(desugared.contains("__vx_state(0)"));
        assert!(desugared.contains("__vx_derived(|| { count * 2 })"));
        assert!(desugared.contains("__vx_effect(||"));
    }

    #[test]
    fn parse_script_with_props() {
        let source = r#"<script>
  P {
    user: User
    showAvatar: bool = true
    emit select(user: User)
  }
</script>"#;
        let file = parse(source).unwrap();
        let script = file.script.unwrap();
        let desugared = script.node.desugared_source.unwrap();
        assert!(desugared.contains("S __VxProps__"));
        assert!(!desugared.contains("P {"));

        // Props extracted
        let props = script.node.props.unwrap().node;
        assert_eq!(props.fields.len(), 2);
        assert_eq!(props.fields[0].node.name, "user");
        assert_eq!(props.fields[1].node.name, "showAvatar");
        assert_eq!(
            props.fields[1].node.default_value,
            Some("true".to_string())
        );

        // Events extracted
        assert!(script.node.events.len() >= 1);
        assert_eq!(script.node.events[0].node.name, "select");
    }

    #[test]
    fn parse_template_with_directives() {
        let source = r#"<template>
  @if count > 10 {
    <p>High</p>
  } @else {
    <p>Low</p>
  }
</template>"#;
        let file = parse(source).unwrap();
        let tmpl = file.template.unwrap();
        let has_if = tmpl.node.children.iter().any(|n| {
            matches!(&n.node, TemplateNode::IfBlock(_))
        });
        assert!(has_if, "template should contain an @if block");
    }

    #[test]
    fn parse_template_each() {
        let source = r#"<template>
  @each items -> item {
    <li>{item}</li>
  }
</template>"#;
        let file = parse(source).unwrap();
        let tmpl = file.template.unwrap();
        let has_each = tmpl.node.children.iter().any(|n| {
            matches!(&n.node, TemplateNode::EachBlock(_))
        });
        assert!(has_each, "template should contain an @each block");
    }

    #[test]
    fn parse_style_with_media_query() {
        let source = r#"<style>
  h1 { color: blue; }
  @media (max-width: 768px) {
    h1 { font-size: 14px; }
  }
</style>"#;
        let file = parse(source).unwrap();
        assert_eq!(file.styles.len(), 1);
        let rules = &file.styles[0].node.rules;
        assert_eq!(rules.len(), 2);
        match &rules[1].node {
            CssRule::AtRule(at) => {
                assert_eq!(at.name, "media");
            }
            _ => panic!("expected AtRule"),
        }
    }

    #[test]
    fn parse_script_context_client() {
        let source = r#"<script context="client">
  count := $state(0)
</script>"#;
        let file = parse(source).unwrap();
        assert_eq!(file.script.unwrap().node.context, ScriptContext::Client);
    }

    #[test]
    fn parse_script_context_server() {
        let source = r#"<script context="server">
  F load() { }
</script>"#;
        let file = parse(source).unwrap();
        assert_eq!(file.script.unwrap().node.context, ScriptContext::Server);
    }

    #[test]
    fn parse_global_style() {
        let source = r#"<style global>
  body { margin: 0; }
</style>"#;
        let file = parse(source).unwrap();
        assert_eq!(file.styles.len(), 1);
        assert!(file.styles[0].node.is_global);
    }

    #[test]
    fn parse_multiple_styles() {
        let source = r#"<style>h1 { color: blue; }</style>
<style global>body { margin: 0; }</style>"#;
        let file = parse(source).unwrap();
        assert_eq!(file.styles.len(), 2);
        assert!(!file.styles[0].node.is_global);
        assert!(file.styles[1].node.is_global);
    }

    #[test]
    fn parse_duplicate_script_error() {
        let source = "<script>a</script>\n<script>b</script>";
        let (file, errors) = parse_with_recovery(source);
        assert_eq!(errors.len(), 1);
        assert_eq!(file.script.unwrap().node.raw_source, "a");
    }

    #[test]
    fn parse_blocks_any_order() {
        let source = r#"<style>s { color: red; }</style>
<template>t</template>
<script>x := 1</script>"#;
        let file = parse(source).unwrap();
        assert!(file.script.is_some());
        assert!(file.template.is_some());
        assert_eq!(file.styles.len(), 1);
    }

    #[test]
    fn ast_span_construction() {
        let span = 0..10;
        let spanned = Spanned::new("hello", span.clone());
        assert_eq!(spanned.node, "hello");
        assert_eq!(spanned.span, span);
    }

    #[test]
    fn expr_construction() {
        let expr = Expr::new("count * 2", 5..14);
        assert_eq!(expr.raw, "count * 2");
        assert_eq!(expr.span, 5..14);
    }

    #[test]
    fn parse_error_offset() {
        let err = ParseError::UnclosedTag {
            tag: "script".to_string(),
            offset: 42,
        };
        assert_eq!(err.offset(), 42);
    }
}

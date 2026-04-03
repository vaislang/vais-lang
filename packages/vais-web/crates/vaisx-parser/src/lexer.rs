//! Block separation lexer for `.vaisx` files.
//!
//! Scans the source text and extracts `<script>`, `<template>`, and `<style>`
//! blocks as raw source strings with span information.
//!
//! All three blocks are optional. Order in the source is irrelevant.
//! Multiple `<style>` blocks are allowed (scoped + global).
//! At most one `<script>` and one `<template>` block is allowed.

use crate::ast::{ParseError, ScriptContext, Span};

/// A raw block extracted from the `.vaisx` source.
#[derive(Debug, Clone, PartialEq)]
pub struct RawBlock {
    /// The block kind.
    pub kind: BlockKind,
    /// Span of the entire block including tags (e.g., `<script>...</script>`).
    pub outer_span: Span,
    /// Span of the inner content only (between opening and closing tags).
    pub inner_span: Span,
    /// The inner content as a string slice range.
    pub content: String,
}

/// The kind of block.
#[derive(Debug, Clone, PartialEq)]
pub enum BlockKind {
    Script { context: ScriptContext },
    Template,
    Style { is_global: bool, is_scoped: bool },
}

/// Result of block separation.
#[derive(Debug, Clone, PartialEq)]
pub struct BlockSeparation {
    pub script: Option<RawBlock>,
    pub template: Option<RawBlock>,
    pub styles: Vec<RawBlock>,
}

/// Separate a `.vaisx` source into raw blocks.
///
/// Returns the block separation result and any errors encountered.
/// Uses error recovery: continues parsing even after errors.
pub fn separate_blocks(source: &str) -> (BlockSeparation, Vec<ParseError>) {
    let mut errors = Vec::new();
    let mut script: Option<RawBlock> = None;
    let mut template: Option<RawBlock> = None;
    let mut styles: Vec<RawBlock> = Vec::new();

    let bytes = source.as_bytes();
    let len = bytes.len();
    let mut pos = 0;

    while pos < len {
        // Skip whitespace and comments between blocks
        pos = skip_whitespace_and_comments(source, pos);
        if pos >= len {
            break;
        }

        // Look for opening tag
        if bytes[pos] != b'<' {
            // Skip non-tag content (could be comments or stray text)
            pos += 1;
            continue;
        }

        // Try to match a known block tag
        if let Some((block, new_pos)) = try_parse_block(source, pos) {
            match &block.kind {
                BlockKind::Script { .. } => {
                    if let Some(existing) = &script {
                        errors.push(ParseError::DuplicateBlock {
                            block: "script".to_string(),
                            offset: block.outer_span.start,
                            first_offset: existing.outer_span.start,
                        });
                    } else {
                        script = Some(block);
                    }
                }
                BlockKind::Template => {
                    if let Some(existing) = &template {
                        errors.push(ParseError::DuplicateBlock {
                            block: "template".to_string(),
                            offset: block.outer_span.start,
                            first_offset: existing.outer_span.start,
                        });
                    } else {
                        template = Some(block);
                    }
                }
                BlockKind::Style { .. } => {
                    styles.push(block);
                }
            }
            pos = new_pos;
        } else {
            // Not a recognized block tag — skip this character
            pos += 1;
        }
    }

    (BlockSeparation { script, template, styles }, errors)
}

/// Skip whitespace (spaces, tabs, newlines).
fn skip_whitespace_and_comments(source: &str, mut pos: usize) -> usize {
    let bytes = source.as_bytes();
    while pos < bytes.len() {
        if bytes[pos].is_ascii_whitespace() {
            pos += 1;
        } else if source[pos..].starts_with("<!--") {
            // Skip HTML comment
            if let Some(end) = source[pos..].find("-->") {
                pos += end + 3;
            } else {
                // Unclosed comment — skip to end
                return bytes.len();
            }
        } else {
            break;
        }
    }
    pos
}

/// Try to parse a block starting at `pos`.
/// Returns the parsed block and the position after the closing tag.
fn try_parse_block(source: &str, pos: usize) -> Option<(RawBlock, usize)> {
    let rest = &source[pos..];

    // Check for known opening tags
    if let Some(result) = try_parse_script_block(source, pos, rest) {
        return Some(result);
    }
    if let Some(result) = try_parse_template_block(source, pos, rest) {
        return Some(result);
    }
    if let Some(result) = try_parse_style_block(source, pos, rest) {
        return Some(result);
    }

    None
}

/// Try to parse a `<script ...>` block.
fn try_parse_script_block(source: &str, pos: usize, rest: &str) -> Option<(RawBlock, usize)> {
    // Match <script> or <script ...>
    let lower = rest.to_ascii_lowercase();
    if !lower.starts_with("<script") {
        return None;
    }

    let after_tag = &rest[7..]; // After "<script"
    // Must be followed by '>' or whitespace (for attributes)
    if !after_tag.starts_with('>') && !after_tag.starts_with(char::is_whitespace) {
        return None;
    }

    // Find the end of the opening tag
    let open_tag_end = rest.find('>')? + 1; // +1 to include '>'

    // Parse attributes from the opening tag
    let attrs_str = &rest[7..open_tag_end - 1].trim(); // between "<script" and ">"
    let context = parse_script_context(attrs_str);

    let content_start = pos + open_tag_end;

    // Find </script>
    let closing_tag = "</script>";
    let close_pos = find_closing_tag(source, content_start, closing_tag)?;

    let content = source[content_start..close_pos].to_string();
    let outer_end = close_pos + closing_tag.len();

    Some((
        RawBlock {
            kind: BlockKind::Script { context },
            outer_span: pos..outer_end,
            inner_span: content_start..close_pos,
            content,
        },
        outer_end,
    ))
}

/// Try to parse a `<template>` block.
fn try_parse_template_block(source: &str, pos: usize, rest: &str) -> Option<(RawBlock, usize)> {
    let lower = rest.to_ascii_lowercase();
    if !lower.starts_with("<template") {
        return None;
    }

    let after_tag = &rest[9..]; // After "<template"
    if !after_tag.starts_with('>') && !after_tag.starts_with(char::is_whitespace) {
        return None;
    }

    let open_tag_end = rest.find('>')? + 1;
    let content_start = pos + open_tag_end;

    let closing_tag = "</template>";
    let close_pos = find_closing_tag(source, content_start, closing_tag)?;

    let content = source[content_start..close_pos].to_string();
    let outer_end = close_pos + closing_tag.len();

    Some((
        RawBlock {
            kind: BlockKind::Template,
            outer_span: pos..outer_end,
            inner_span: content_start..close_pos,
            content,
        },
        outer_end,
    ))
}

/// Try to parse a `<style ...>` block.
fn try_parse_style_block(source: &str, pos: usize, rest: &str) -> Option<(RawBlock, usize)> {
    let lower = rest.to_ascii_lowercase();
    if !lower.starts_with("<style") {
        return None;
    }

    let after_tag = &rest[6..]; // After "<style"
    if !after_tag.starts_with('>') && !after_tag.starts_with(char::is_whitespace) {
        return None;
    }

    let open_tag_end = rest.find('>')? + 1;

    // Parse attributes for "global" and "scoped"
    let attrs_str = &rest[6..open_tag_end - 1].trim();
    let is_global = attrs_str.contains("global");
    let is_scoped = attrs_str.contains("scoped");

    let content_start = pos + open_tag_end;

    let closing_tag = "</style>";
    let close_pos = find_closing_tag(source, content_start, closing_tag)?;

    let content = source[content_start..close_pos].to_string();
    let outer_end = close_pos + closing_tag.len();

    Some((
        RawBlock {
            kind: BlockKind::Style { is_global, is_scoped },
            outer_span: pos..outer_end,
            inner_span: content_start..close_pos,
            content,
        },
        outer_end,
    ))
}

/// Parse the `context` attribute from a script tag's attributes.
fn parse_script_context(attrs: &str) -> ScriptContext {
    // Look for context="client" or context="server"
    if let Some(ctx_pos) = attrs.find("context") {
        let after_ctx = &attrs[ctx_pos + 7..].trim_start();
        if let Some(after_eq) = after_ctx.strip_prefix('=') {
            let after_eq = after_eq.trim_start();
            let value = if after_eq.starts_with('"') {
                after_eq[1..].split('"').next().unwrap_or("")
            } else if after_eq.starts_with('\'') {
                after_eq[1..].split('\'').next().unwrap_or("")
            } else {
                after_eq.split_whitespace().next().unwrap_or("")
            };
            return match value {
                "client" => ScriptContext::Client,
                "server" => ScriptContext::Server,
                _ => ScriptContext::Auto,
            };
        }
    }
    ScriptContext::Auto
}

/// Find a closing tag (case-insensitive) starting from `start`.
/// Handles nested occurrences by finding the outermost closing tag.
fn find_closing_tag(source: &str, start: usize, closing_tag: &str) -> Option<usize> {
    let lower_source = source[start..].to_ascii_lowercase();
    let lower_tag = closing_tag.to_ascii_lowercase();
    lower_source.find(&lower_tag).map(|offset| start + offset)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn separate_empty() {
        let (result, errors) = separate_blocks("");
        assert!(errors.is_empty());
        assert!(result.script.is_none());
        assert!(result.template.is_none());
        assert!(result.styles.is_empty());
    }

    #[test]
    fn separate_script_only() {
        let source = r#"<script>
  count := $state(0)
</script>"#;
        let (result, errors) = separate_blocks(source);
        assert!(errors.is_empty());
        let script = result.script.unwrap();
        assert!(matches!(
            script.kind,
            BlockKind::Script {
                context: ScriptContext::Auto
            }
        ));
        assert!(script.content.contains("count := $state(0)"));
        assert!(result.template.is_none());
        assert!(result.styles.is_empty());
    }

    #[test]
    fn separate_all_blocks() {
        let source = r#"<script>
  count := $state(0)
</script>

<template>
  <h1>{count}</h1>
</template>

<style>
  h1 { color: blue; }
</style>"#;
        let (result, errors) = separate_blocks(source);
        assert!(errors.is_empty());
        assert!(result.script.is_some());
        assert!(result.template.is_some());
        assert_eq!(result.styles.len(), 1);
        assert!(result.template.unwrap().content.contains("<h1>{count}</h1>"));
        assert!(result.styles[0].content.contains("color: blue"));
    }

    #[test]
    fn separate_blocks_any_order() {
        let source = r#"<style>
  h1 { color: red; }
</style>

<template>
  <h1>Hello</h1>
</template>

<script>
  name := "world"
</script>"#;
        let (result, errors) = separate_blocks(source);
        assert!(errors.is_empty());
        assert!(result.script.is_some());
        assert!(result.template.is_some());
        assert_eq!(result.styles.len(), 1);
    }

    #[test]
    fn separate_multiple_styles() {
        let source = r#"<style>
  h1 { color: blue; }
</style>

<style global>
  body { margin: 0; }
</style>"#;
        let (result, errors) = separate_blocks(source);
        assert!(errors.is_empty());
        assert_eq!(result.styles.len(), 2);
        assert!(matches!(
            result.styles[0].kind,
            BlockKind::Style { is_global: false, .. }
        ));
        assert!(matches!(
            result.styles[1].kind,
            BlockKind::Style { is_global: true, .. }
        ));
    }

    #[test]
    fn separate_script_with_context() {
        let source = r#"<script context="client">
  count := $state(0)
</script>"#;
        let (result, errors) = separate_blocks(source);
        assert!(errors.is_empty());
        let script = result.script.unwrap();
        assert!(matches!(
            script.kind,
            BlockKind::Script {
                context: ScriptContext::Client
            }
        ));
    }

    #[test]
    fn separate_script_server_context() {
        let source = r#"<script context="server">
  F load() { }
</script>"#;
        let (result, errors) = separate_blocks(source);
        assert!(errors.is_empty());
        let script = result.script.unwrap();
        assert!(matches!(
            script.kind,
            BlockKind::Script {
                context: ScriptContext::Server
            }
        ));
    }

    #[test]
    fn duplicate_script_error() {
        let source = r#"<script>first</script>
<script>second</script>"#;
        let (result, errors) = separate_blocks(source);
        assert_eq!(errors.len(), 1);
        assert!(matches!(errors[0], ParseError::DuplicateBlock { .. }));
        // First script is kept
        assert!(result.script.is_some());
        assert!(result.script.unwrap().content.contains("first"));
    }

    #[test]
    fn duplicate_template_error() {
        let source = r#"<template>first</template>
<template>second</template>"#;
        let (result, errors) = separate_blocks(source);
        assert_eq!(errors.len(), 1);
        assert!(matches!(errors[0], ParseError::DuplicateBlock { .. }));
        assert!(result.template.is_some());
    }

    #[test]
    fn span_information() {
        let source = "<script>hello</script>";
        let (result, _) = separate_blocks(source);
        let script = result.script.unwrap();
        assert_eq!(script.outer_span, 0..22);
        assert_eq!(script.inner_span, 8..13);
        assert_eq!(script.content, "hello");
    }

    #[test]
    fn whitespace_between_blocks() {
        let source = "  \n  <script>x</script>  \n  <template>y</template>  \n  ";
        let (result, errors) = separate_blocks(source);
        assert!(errors.is_empty());
        assert_eq!(result.script.unwrap().content, "x");
        assert_eq!(result.template.unwrap().content, "y");
    }

    #[test]
    fn html_comments_between_blocks() {
        let source = "<!-- comment --><script>x</script><!-- another --><template>y</template>";
        let (result, errors) = separate_blocks(source);
        assert!(errors.is_empty());
        assert_eq!(result.script.unwrap().content, "x");
        assert_eq!(result.template.unwrap().content, "y");
    }

    #[test]
    fn template_only() {
        let source = "<template><div>Hello</div></template>";
        let (result, errors) = separate_blocks(source);
        assert!(errors.is_empty());
        assert!(result.script.is_none());
        assert!(result.template.is_some());
        assert_eq!(result.template.unwrap().content, "<div>Hello</div>");
    }
}

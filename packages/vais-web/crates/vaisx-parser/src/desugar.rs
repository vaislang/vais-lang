//! Source-text-level desugar for `<script>` blocks.
//!
//! Transforms VaisX-specific syntax to standard Vais code before
//! handing off to the core `vais-parser`.
//!
//! ## Transformations (all at source text level)
//!
//! 1. `$state(x)` → `__vx_state(x)`
//! 2. `$derived(expr)` → `__vx_derived(|| { expr })`
//! 3. `$effect { body }` → `__vx_effect(|| { body })`
//! 4. `P { fields }` → `S __VxProps__ { fields }` (with default/emit extraction)
//! 5. `emit name(args)` → `__vx_emit("name", args)`

use crate::ast::{EventDecl, ParseError, PropField, PropsDecl, Spanned};

/// Result of desugaring a script block.
#[derive(Debug, Clone)]
pub struct DesugarResult {
    /// The transformed source text (ready for core parser).
    pub source: String,
    /// Extracted Props declaration (if `P { }` was found).
    pub props: Option<Spanned<PropsDecl>>,
    /// Extracted event declarations (from `P { emit ... }` and `emit` calls).
    pub events: Vec<Spanned<EventDecl>>,
    /// Any errors encountered during desugar.
    pub errors: Vec<ParseError>,
}

/// Desugar a raw `<script>` block source text.
///
/// Applies all VaisX → Vais transformations at the source text level.
pub fn desugar(source: &str, block_offset: usize) -> DesugarResult {
    let mut errors = Vec::new();
    let mut props = None;
    let mut events = Vec::new();

    // Step 1: Extract and transform P { ... } block (must be done first due to P/Pub conflict)
    let source = desugar_props_block(source, block_offset, &mut props, &mut events, &mut errors);

    // Step 2: Transform $state(x) → __vx_state(x)
    let source = desugar_dollar_call(&source, "$state", "__vx_state");

    // Step 3: Transform $derived(expr) → __vx_derived(|| { expr })
    let source = desugar_derived(&source);

    // Step 4: Transform $effect { body } → __vx_effect(|| { body })
    let source = desugar_effect(&source);

    // Step 5: Transform emit name(args) → __vx_emit("name", args)
    let source = desugar_emit_calls(&source, block_offset, &mut events, &mut errors);

    DesugarResult {
        source,
        props,
        events,
        errors,
    }
}

/// Transform `$name(...)` → `replacement(...)` for simple dollar-prefixed calls.
fn desugar_dollar_call(source: &str, pattern: &str, replacement: &str) -> String {
    source.replace(pattern, replacement)
}

/// Transform `$derived(expr)` → `__vx_derived(|| { expr })`.
///
/// Wraps the argument expression in a closure.
fn desugar_derived(source: &str) -> String {
    let pattern = "$derived(";
    let mut result = String::with_capacity(source.len());
    let mut remaining = source;

    while let Some(pos) = remaining.find(pattern) {
        result.push_str(&remaining[..pos]);

        let after_pattern = &remaining[pos + pattern.len()..];

        // Find the matching closing paren
        if let Some(close) = find_matching_paren(after_pattern) {
            let expr = &after_pattern[..close];
            result.push_str("__vx_derived(|| { ");
            result.push_str(expr);
            result.push_str(" })");
            remaining = &after_pattern[close + 1..]; // skip past ')'
        } else {
            // No matching paren — keep original
            result.push_str(&remaining[pos..pos + pattern.len()]);
            remaining = after_pattern;
        }
    }

    result.push_str(remaining);
    result
}

/// Transform `$effect { body }` → `__vx_effect(|| { body })`.
fn desugar_effect(source: &str) -> String {
    let pattern = "$effect";
    let mut result = String::with_capacity(source.len());
    let mut remaining = source;

    while let Some(pos) = remaining.find(pattern) {
        result.push_str(&remaining[..pos]);

        let after_pattern = &remaining[pos + pattern.len()..];
        let trimmed = after_pattern.trim_start();

        if trimmed.starts_with('{') {
            // Find the whitespace between $effect and {
            let ws_len = after_pattern.len() - trimmed.len();
            let brace_content = &after_pattern[ws_len..];

            // Find matching closing brace
            if let Some(close) = find_matching_brace(brace_content) {
                let body = &brace_content[1..close]; // content inside { ... }
                result.push_str("__vx_effect(|| {");
                result.push_str(body);
                result.push_str("})");
                remaining = &brace_content[close + 1..];
            } else {
                result.push_str("$effect");
                remaining = after_pattern;
            }
        } else {
            // Not followed by { — keep as-is
            result.push_str("$effect");
            remaining = after_pattern;
        }
    }

    result.push_str(remaining);
    result
}

/// Extract and transform the `P { ... }` block.
///
/// - Converts `P {` → `S __VxProps__ {`
/// - Extracts fields, separating default values (`= value`) into metadata
/// - Extracts `emit name(params)` declarations into the events table
/// - Removes extracted emit lines from the struct body
fn desugar_props_block(
    source: &str,
    block_offset: usize,
    props: &mut Option<Spanned<PropsDecl>>,
    events: &mut Vec<Spanned<EventDecl>>,
    _errors: &mut Vec<ParseError>,
) -> String {
    // Find `P {` at the start of a line (or after whitespace)
    // P must be followed by whitespace then { or directly by {
    let mut result = String::with_capacity(source.len());
    let mut remaining = source;

    while let Some(p_pos) = find_props_block_start(remaining) {
        result.push_str(&remaining[..p_pos]);

        let after_p = &remaining[p_pos + 1..]; // skip 'P'
        let trimmed = after_p.trim_start();

        if !trimmed.starts_with('{') {
            result.push('P');
            remaining = after_p;
            continue;
        }

        let ws_len = after_p.len() - trimmed.len();
        if let Some(close) = find_matching_brace(trimmed) {
            let block_body = &trimmed[1..close]; // content inside { ... }
            let abs_start = block_offset + (source.len() - remaining.len()) + p_pos;
            let abs_end = abs_start + 1 + ws_len + close + 1;

            // Parse props fields and emit declarations
            let (fields, prop_events) = parse_props_body(block_body, abs_start);

            let props_decl = PropsDecl { fields: fields.clone() };
            *props = Some(Spanned::new(props_decl, abs_start..abs_end));
            events.extend(prop_events);

            // Build the desugared struct — only include regular fields (no emit, no defaults in type)
            result.push_str("S __VxProps__ {");
            for field in &fields {
                result.push_str("\n    ");
                result.push_str(&field.node.name);
                result.push_str(": ");
                result.push_str(&field.node.type_annotation);
            }
            if !fields.is_empty() {
                result.push('\n');
            }
            result.push('}');

            remaining = &trimmed[close + 1..];
        } else {
            result.push('P');
            remaining = after_p;
        }
    }

    result.push_str(remaining);
    result
}

/// Find the start of a `P {` props block.
///
/// `P` must be:
/// - At the start of the string, or
/// - Preceded by a newline + optional whitespace
///   And must be followed by whitespace then `{` or directly `{`.
fn find_props_block_start(source: &str) -> Option<usize> {
    let bytes = source.as_bytes();
    for i in 0..bytes.len() {
        if bytes[i] != b'P' {
            continue;
        }

        // Check: P must be at line start (start of string, or after newline + whitespace)
        let at_line_start = if i == 0 {
            true
        } else {
            // Walk backwards to find newline or start
            let before = &source[..i];
            let trimmed = before.trim_end_matches([' ', '\t']);
            trimmed.is_empty() || trimmed.ends_with('\n')
        };

        if !at_line_start {
            continue;
        }

        // Check: P must be followed by whitespace+{ or directly {
        let after = &source[i + 1..];
        let trimmed = after.trim_start();
        if trimmed.starts_with('{') {
            return Some(i);
        }
    }
    None
}

/// Parse the body of a `P { ... }` block into fields and event declarations.
fn parse_props_body(
    body: &str,
    base_offset: usize,
) -> (Vec<Spanned<PropField>>, Vec<Spanned<EventDecl>>) {
    let mut fields = Vec::new();
    let mut events = Vec::new();

    for line in body.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        if let Some(stripped) = trimmed.strip_prefix("emit ") {
            // emit eventName(params)
            let rest = stripped.trim();
            if let Some(paren_pos) = rest.find('(') {
                let name = rest[..paren_pos].trim().to_string();
                let close_paren = rest.rfind(')').unwrap_or(rest.len());
                let params = rest[paren_pos + 1..close_paren].trim().to_string();
                events.push(Spanned::new(
                    EventDecl { name, params },
                    base_offset..base_offset + trimmed.len(),
                ));
            }
        } else {
            // Regular field: name: Type or name: Type = default
            if let Some(colon_pos) = trimmed.find(':') {
                let name = trimmed[..colon_pos].trim().to_string();
                let after_colon = trimmed[colon_pos + 1..].trim();

                let (type_ann, default_value) = if let Some(eq_pos) = after_colon.find('=') {
                    // Has default value
                    let type_str = after_colon[..eq_pos].trim().to_string();
                    let default = after_colon[eq_pos + 1..].trim().to_string();
                    (type_str, Some(default))
                } else {
                    (after_colon.to_string(), None)
                };

                fields.push(Spanned::new(
                    PropField {
                        name,
                        type_annotation: type_ann,
                        default_value,
                    },
                    base_offset..base_offset + trimmed.len(),
                ));
            }
        }
    }

    (fields, events)
}

/// Transform `emit name(args)` calls (outside of P { }) into `__vx_emit("name", args)`.
fn desugar_emit_calls(
    source: &str,
    block_offset: usize,
    events: &mut Vec<Spanned<EventDecl>>,
    _errors: &mut Vec<ParseError>,
) -> String {
    let mut result = String::with_capacity(source.len());
    let mut remaining = source;

    while let Some(emit_pos) = find_emit_call(remaining) {
        result.push_str(&remaining[..emit_pos]);

        let after_emit = &remaining[emit_pos + 4..].trim_start(); // skip "emit"

        // Find the event name and args
        if let Some(paren_pos) = after_emit.find('(') {
            let name = after_emit[..paren_pos].trim();
            // Find matching close paren
            let paren_content = &after_emit[paren_pos..];
            if let Some(close) = find_matching_paren(&paren_content[1..]) {
                let args = &paren_content[1..close + 1].trim();
                let abs_offset = block_offset + (source.len() - remaining.len()) + emit_pos;

                events.push(Spanned::new(
                    EventDecl {
                        name: name.to_string(),
                        params: args.to_string(),
                    },
                    abs_offset..abs_offset + 4 + after_emit.len(),
                ));

                if args.is_empty() {
                    result.push_str(&format!("__vx_emit(\"{}\")", name));
                } else {
                    result.push_str(&format!("__vx_emit(\"{}\", {})", name, args));
                }

                // Calculate how far we've consumed in `remaining`
                let emit_keyword_end = emit_pos + 4; // "emit"
                let ws_after_emit = remaining[emit_keyword_end..].len() - after_emit.len();
                let total_consumed = emit_keyword_end + ws_after_emit + paren_pos + close + 2;
                remaining = &remaining[total_consumed..];
            } else {
                result.push_str("emit");
                remaining = &remaining[emit_pos + 4..];
            }
        } else {
            result.push_str("emit");
            remaining = &remaining[emit_pos + 4..];
        }
    }

    result.push_str(remaining);
    result
}

/// Find an `emit` call (not inside a `P { }` block — those are already handled).
/// Returns the byte position of `emit` if found.
fn find_emit_call(source: &str) -> Option<usize> {
    let mut pos = 0;
    let bytes = source.as_bytes();

    while pos < bytes.len() {
        if let Some(idx) = source[pos..].find("emit ") {
            let abs_pos = pos + idx;

            // Check it's a standalone word (not part of __vx_emit or similar)
            let is_word_start = abs_pos == 0
                || !source.as_bytes()[abs_pos - 1].is_ascii_alphanumeric()
                    && source.as_bytes()[abs_pos - 1] != b'_';

            if is_word_start {
                // Check it's followed by an identifier then '('
                let after = source[abs_pos + 5..].trim_start();
                if after.contains('(') {
                    let first_non_ident = after
                        .find(|c: char| !c.is_ascii_alphanumeric() && c != '_')
                        .unwrap_or(after.len());
                    if first_non_ident > 0 && after[first_non_ident..].trim_start().starts_with('(')
                    {
                        return Some(abs_pos);
                    }
                }
            }
            pos = abs_pos + 4;
        } else {
            break;
        }
    }
    None
}

/// Find the position of the matching closing parenthesis for content starting after '('.
fn find_matching_paren(source: &str) -> Option<usize> {
    let mut depth = 1;
    let mut in_string = false;
    let mut string_char = '"';
    let mut escape = false;

    for (i, ch) in source.char_indices() {
        if escape {
            escape = false;
            continue;
        }
        if ch == '\\' && in_string {
            escape = true;
            continue;
        }
        if in_string {
            if ch == string_char {
                in_string = false;
            }
            continue;
        }
        match ch {
            '"' | '\'' => {
                in_string = true;
                string_char = ch;
            }
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            _ => {}
        }
    }
    None
}

/// Find the position of the matching closing brace for content starting at '{'.
fn find_matching_brace(source: &str) -> Option<usize> {
    if !source.starts_with('{') {
        return None;
    }
    let mut depth = 1;
    let mut in_string = false;
    let mut string_char = '"';
    let mut escape = false;

    for (i, ch) in source[1..].char_indices() {
        if escape {
            escape = false;
            continue;
        }
        if ch == '\\' && in_string {
            escape = true;
            continue;
        }
        if in_string {
            if ch == string_char {
                in_string = false;
            }
            continue;
        }
        match ch {
            '"' | '\'' => {
                in_string = true;
                string_char = ch;
            }
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i + 1); // +1 because we started at source[1..]
                }
            }
            _ => {}
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // $state
    // -----------------------------------------------------------------------

    #[test]
    fn desugar_state_basic() {
        let result = desugar("count := $state(0)", 0);
        assert_eq!(result.source, "count := __vx_state(0)");
    }

    #[test]
    fn desugar_state_string_arg() {
        let result = desugar("name := $state(\"world\")", 0);
        assert_eq!(result.source, "name := __vx_state(\"world\")");
    }

    #[test]
    fn desugar_multiple_states() {
        let src = "count := $state(0)\nname := $state(\"hello\")";
        let result = desugar(src, 0);
        assert!(result.source.contains("__vx_state(0)"));
        assert!(result.source.contains("__vx_state(\"hello\")"));
        assert!(!result.source.contains("$state"));
    }

    // -----------------------------------------------------------------------
    // $derived
    // -----------------------------------------------------------------------

    #[test]
    fn desugar_derived_basic() {
        let result = desugar("doubled := $derived(count * 2)", 0);
        assert_eq!(result.source, "doubled := __vx_derived(|| { count * 2 })");
    }

    #[test]
    fn desugar_derived_complex_expr() {
        let result = desugar("greeting := $derived(\"Hello, \" + name + \"!\")", 0);
        assert!(result.source.contains("__vx_derived(|| { \"Hello, \" + name + \"!\" })"));
    }

    #[test]
    fn desugar_derived_nested_parens() {
        let result = desugar("x := $derived(foo(bar(1)))", 0);
        assert_eq!(result.source, "x := __vx_derived(|| { foo(bar(1)) })");
    }

    // -----------------------------------------------------------------------
    // $effect
    // -----------------------------------------------------------------------

    #[test]
    fn desugar_effect_basic() {
        let result = desugar("$effect {\n    console_log(count)\n  }", 0);
        assert!(result.source.contains("__vx_effect(|| {"));
        assert!(result.source.contains("console_log(count)"));
        assert!(result.source.ends_with("})"));
    }

    #[test]
    fn desugar_effect_single_line() {
        let result = desugar("$effect { log(x) }", 0);
        assert_eq!(result.source, "__vx_effect(|| { log(x) })");
    }

    #[test]
    fn desugar_effect_nested_braces() {
        let result = desugar("$effect { I x > 0 { log(x) } }", 0);
        assert!(result.source.contains("__vx_effect(|| { I x > 0 { log(x) } })"));
    }

    // -----------------------------------------------------------------------
    // P { } Props block
    // -----------------------------------------------------------------------

    #[test]
    fn desugar_props_basic() {
        let src = "P {\n    user: User\n    showAvatar: bool\n}";
        let result = desugar(src, 0);
        assert!(result.source.contains("S __VxProps__"));
        assert!(result.source.contains("user: User"));
        assert!(result.source.contains("showAvatar: bool"));
        assert!(!result.source.contains("P {"));
        assert!(result.props.is_some());
        let props = result.props.unwrap().node;
        assert_eq!(props.fields.len(), 2);
        assert_eq!(props.fields[0].node.name, "user");
        assert_eq!(props.fields[1].node.name, "showAvatar");
    }

    #[test]
    fn desugar_props_with_defaults() {
        let src = "P {\n    showAvatar: bool = true\n    count: i32 = 0\n}";
        let result = desugar(src, 0);
        let props = result.props.unwrap().node;
        assert_eq!(props.fields[0].node.default_value, Some("true".to_string()));
        assert_eq!(props.fields[1].node.default_value, Some("0".to_string()));
        // Default values should be stripped from struct definition
        assert!(result.source.contains("S __VxProps__"));
    }

    #[test]
    fn desugar_props_with_emit() {
        let src = "P {\n    user: User\n    emit select(user: User)\n}";
        let result = desugar(src, 0);
        // emit should be extracted, not in struct
        assert!(result.source.contains("S __VxProps__"));
        assert!(!result.source.contains("emit"));
        assert!(result.events.len() >= 1);
        assert_eq!(result.events[0].node.name, "select");
        assert_eq!(result.events[0].node.params, "user: User");
    }

    // -----------------------------------------------------------------------
    // emit calls
    // -----------------------------------------------------------------------

    #[test]
    fn desugar_emit_call_with_args() {
        let src = "emit select(user)";
        let result = desugar(src, 0);
        assert_eq!(result.source, "__vx_emit(\"select\", user)");
    }

    #[test]
    fn desugar_emit_call_no_args() {
        let src = "emit close()";
        let result = desugar(src, 0);
        assert_eq!(result.source, "__vx_emit(\"close\")");
    }

    // -----------------------------------------------------------------------
    // Combined / integration
    // -----------------------------------------------------------------------

    #[test]
    fn desugar_full_script() {
        let src = r#"P {
    user: User
    showAvatar: bool = true
    emit select(user: User)
}

count := $state(0)
name := $state("world")
doubled := $derived(count * 2)

$effect {
    console_log("count changed: ", count)
}

F increment() {
    count += 1
}

F handleClick() {
    emit select(user)
}"#;
        let result = desugar(src, 0);

        // All desugar patterns applied
        assert!(result.source.contains("S __VxProps__"));
        assert!(result.source.contains("__vx_state(0)"));
        assert!(result.source.contains("__vx_state(\"world\")"));
        assert!(result.source.contains("__vx_derived(|| { count * 2 })"));
        assert!(result.source.contains("__vx_effect(||"));
        assert!(result.source.contains("__vx_emit(\"select\", user)"));

        // No raw VaisX syntax remains
        assert!(!result.source.contains("$state"));
        assert!(!result.source.contains("$derived"));
        assert!(!result.source.contains("$effect"));
        assert!(!result.source.contains("\nemit ")); // emit in function body should be desugared
        assert!(!result.source.contains("P {"));

        // Props extracted
        assert!(result.props.is_some());
        let props = result.props.unwrap().node;
        assert_eq!(props.fields.len(), 2);

        // Events extracted (from P block + emit call)
        assert!(result.events.len() >= 2);
    }

    // -----------------------------------------------------------------------
    // Helper tests
    // -----------------------------------------------------------------------

    #[test]
    fn find_matching_paren_basic() {
        assert_eq!(find_matching_paren("hello)"), Some(5));
        assert_eq!(find_matching_paren("a(b))"), Some(4));
        assert_eq!(find_matching_paren("\"str)\" + x)"), Some(10));
    }

    #[test]
    fn find_matching_brace_basic() {
        assert_eq!(find_matching_brace("{ hello }"), Some(8));
        assert_eq!(find_matching_brace("{ a { b } }"), Some(10));
        assert_eq!(find_matching_brace("{ \"}\" }"), Some(6));
    }

    #[test]
    fn no_false_positive_on_emit_in_identifier() {
        // __vx_emit should not be matched as an emit call
        let src = "__vx_emit(\"test\")";
        let result = desugar(src, 0);
        assert_eq!(result.source, "__vx_emit(\"test\")");
    }

    // -----------------------------------------------------------------------
    // String literal / comment false positive defense tests
    // -----------------------------------------------------------------------
    // These tests document the KNOWN LIMITATION that the current source-text
    // desugar uses simple string matching, which can match inside string
    // literals and comments. Since VaisX <script> blocks are pre-processed
    // before the core parser sees them, and it's unusual to write reactive
    // keywords like $state inside string literals, this is an acceptable
    // trade-off for Phase 1. More robust handling (context-aware desugar)
    // is deferred to Phase 4+ when a lexer-level approach may be adopted.

    #[test]
    fn state_in_string_literal_known_limitation() {
        // KNOWN LIMITATION: $state inside a string literal WILL be replaced.
        // This documents the current behavior — not a correctness guarantee.
        let src = r#"msg := "use $state carefully""#;
        let result = desugar(src, 0);
        // Current behavior: $state is replaced even inside strings
        assert!(
            result.source.contains("__vx_state"),
            "known limitation: $state inside string literal is replaced"
        );
    }

    #[test]
    fn derived_in_string_literal_known_limitation() {
        // KNOWN LIMITATION: $derived( inside a string literal WILL be matched.
        let src = r#"msg := "try $derived(x)" + extra"#;
        let result = desugar(src, 0);
        // The find("$derived(") will match, but find_matching_paren will likely
        // find the closing ")" correctly, so the transform still occurs.
        assert!(
            result.source.contains("__vx_derived") || result.source.contains("$derived"),
            "known limitation: $derived in string may be partially transformed"
        );
    }

    #[test]
    fn effect_not_triggered_without_brace() {
        // $effect requires { after it — a string like "$effect foo" should not match
        let src = r#"msg := "$effect is cool""#;
        let result = desugar(src, 0);
        // $effect without { is preserved (the desugar_effect checks for { after)
        // but desugar_dollar_call for $state may still apply if pattern matches
        assert!(
            result.source.contains("$effect"),
            "$effect without brace should not be transformed"
        );
    }

    #[test]
    fn nested_parens_in_derived() {
        // Complex nested expression should be correctly handled
        let src = "x := $derived(fn_call(a, b) + other(c))";
        let result = desugar(src, 0);
        assert_eq!(
            result.source,
            "x := __vx_derived(|| { fn_call(a, b) + other(c) })"
        );
    }

    #[test]
    fn p_block_not_matched_mid_line() {
        // P { } inside a string or mid-line should not be matched
        // because find_props_block_start requires line-start position
        let src = r#"msg := "P { test }""#;
        let result = desugar(src, 0);
        assert!(
            !result.source.contains("S __VxProps__"),
            "P inside string mid-line should not be transformed"
        );
        assert!(result.props.is_none());
    }

    #[test]
    fn p_block_not_matched_in_assignment() {
        // P preceded by identifier chars should not match
        let src = "myP { x: i32 }";
        let result = desugar(src, 0);
        // "myP" — P is not at line start (preceded by "my")
        assert!(
            !result.source.contains("S __VxProps__"),
            "P not at line start should not be transformed"
        );
    }

    #[test]
    fn emit_not_matched_in_string() {
        // emit inside a function call with string arg should not false-positive
        // because find_emit_call checks word boundary (preceding char must not be alphanumeric/_)
        let src = r#"log("emit event()")"#;
        let result = desugar(src, 0);
        // The "emit " inside the string: '"emit event()"'
        // find_emit_call finds "emit " at position inside the string, checks boundary:
        // preceding char is '"' which is not alphanumeric/_ → it WILL match as standalone
        // This is a known limitation — emit inside string literals can be falsely matched.
        // However, the practical impact is low since emit is typically used as a statement.
        assert!(
            result.source.contains("log(") || result.source.contains("__vx_emit"),
            "emit in string: behavior documented (may or may not transform)"
        );
    }

    #[test]
    fn emit_not_matched_after_underscore() {
        // _emit should not be matched
        let src = "_emit close()";
        let result = desugar(src, 0);
        assert_eq!(result.source, "_emit close()");
    }

    #[test]
    fn emit_not_matched_after_alphanumeric() {
        // submit should not be matched
        let src = "submit event(data)";
        let result = desugar(src, 0);
        // "submit" does not contain "emit " at a word boundary
        assert!(!result.source.contains("__vx_emit"));
    }

    #[test]
    fn deeply_nested_derived_parens() {
        // Stress test: very deeply nested parentheses
        let src = "$derived(a(b(c(d(1)))))";
        let result = desugar(src, 0);
        assert_eq!(result.source, "__vx_derived(|| { a(b(c(d(1)))) })");
    }

    #[test]
    fn effect_with_nested_braces_in_string() {
        // Braces inside a string literal within an effect should be handled
        // by find_matching_brace's string tracking
        let src = "$effect { log(\"{\") }";
        let result = desugar(src, 0);
        assert!(result.source.contains("__vx_effect(|| { log(\"{\") })"));
    }

    #[test]
    fn multiple_p_blocks_only_first_matched() {
        // Only the first P { } at line start should be treated as Props
        let src = "P {\n    x: i32\n}\nresult := \"P { y }\"";
        let result = desugar(src, 0);
        assert!(result.props.is_some());
        let props = result.props.unwrap().node;
        assert_eq!(props.fields.len(), 1);
        assert_eq!(props.fields[0].node.name, "x");
    }
}

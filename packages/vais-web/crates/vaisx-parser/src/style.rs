//! CSS parser for `<style>` blocks in `.vaisx` files.
//!
//! Parses raw CSS into a list of [`CssRule`] nodes.
//! Supports:
//! - Style rules: `selector { property: value; }`
//! - At-rules: `@media (query) { ... }`, `@keyframes name { ... }`
//! - Comments: `/* ... */`
//! - Nested rules (within at-rules)
//!
//! ## CSS Scoping
//!
//! When `<style scoped>` is used, [`scope_css_rules`] can be called to add
//! `[data-v-{hash}]` attribute selectors to every non-global selector.
//! `:global(selector)` wraps bypass scoping entirely.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use crate::ast::*;

/// Parse raw CSS source into a list of CSS rules.
pub fn parse_css(source: &str, base_offset: usize) -> (Vec<Spanned<CssRule>>, Vec<ParseError>) {
    let mut parser = CssParser::new(source, base_offset);
    let rules = parser.parse_rules();
    (rules, parser.errors)
}

// ---------------------------------------------------------------------------
// CSS Scoping
// ---------------------------------------------------------------------------

/// Compute an 8-character hex hash from a component filename (or any string).
///
/// Uses the standard library's [`DefaultHasher`] — no external crates required.
///
/// # Example
/// ```ignore
/// let hash = compute_scope_hash("MyButton.vaisx");
/// assert_eq!(hash.len(), 8);
/// ```
pub fn compute_scope_hash(component_name: &str) -> String {
    let mut hasher = DefaultHasher::new();
    component_name.hash(&mut hasher);
    let hash = hasher.finish();
    // Take the lower 32 bits and format as 8 hex digits.
    format!("{:08x}", hash as u32)
}

/// Scope a list of CSS rules by injecting `[data-v-{hash}]` into every selector.
///
/// Rules wrapped in `:global(...)` are emitted as-is (the wrapper is stripped).
/// `@media` / other at-rules have their nested rules scoped recursively.
///
/// # Example
/// ```ignore
/// // Input:  ".btn { color: red; }"
/// // Output: ".btn[data-v-a1b2c3d4] { color: red; }"
/// ```
pub fn scope_css_rules(rules: &[Spanned<CssRule>], hash: &str) -> Vec<Spanned<CssRule>> {
    rules
        .iter()
        .map(|spanned| {
            let scoped_node = scope_rule(&spanned.node, hash);
            Spanned::new(scoped_node, spanned.span.clone())
        })
        .collect()
}

/// Scope a single [`CssRule`].
fn scope_rule(rule: &CssRule, hash: &str) -> CssRule {
    match rule {
        CssRule::Style(style_rule) => {
            let scoped_selectors = style_rule
                .selectors
                .iter()
                .map(|sel| scope_selector(sel, hash))
                .collect();
            CssRule::Style(StyleRule {
                selectors: scoped_selectors,
                declarations: style_rule.declarations.clone(),
            })
        }
        CssRule::AtRule(at_rule) => {
            // Recurse into nested rules (e.g., @media blocks).
            // @keyframes rules should NOT be scoped — their inner rules are
            // percentage/from/to tokens, not element selectors.
            let nested = if at_rule.name == "keyframes"
                || at_rule.name.starts_with("-webkit-keyframes")
                || at_rule.name.starts_with("-moz-keyframes")
            {
                at_rule.rules.clone()
            } else {
                scope_css_rules(&at_rule.rules, hash)
            };
            CssRule::AtRule(AtRule {
                name: at_rule.name.clone(),
                prelude: at_rule.prelude.clone(),
                rules: nested,
            })
        }
        CssRule::Comment(c) => CssRule::Comment(c.clone()),
    }
}

/// Scope a single CSS selector string.
///
/// Handles:
/// - `:global(inner)` — strip the `:global()` wrapper and emit `inner` unchanged.
/// - Everything else — append `[data-v-{hash}]` after the last simple selector part.
fn scope_selector(selector: &str, hash: &str) -> String {
    let trimmed = selector.trim();

    // Full `:global(...)` — emit the inner selector unchanged.
    if let Some(inner) = extract_global(trimmed) {
        return inner.trim().to_string();
    }

    // Selector that contains `:global(...)` sub-expressions inline.
    if trimmed.contains(":global(") {
        return scope_selector_with_inline_global(trimmed, hash);
    }

    // Normal selector — append the scope attribute after the last token.
    append_scope_attr(trimmed, hash)
}

/// If `selector` is exactly `:global(inner)`, return `Some(inner)`.
fn extract_global(selector: &str) -> Option<&str> {
    let s = selector.trim();
    if s.starts_with(":global(") && s.ends_with(')') {
        let inner = &s[":global(".len()..s.len() - 1];
        return Some(inner);
    }
    None
}

/// Handle selectors that contain `:global(...)` sub-expressions mixed with
/// scoped parts, e.g. `.parent :global(.child)`.
fn scope_selector_with_inline_global(selector: &str, hash: &str) -> String {
    let attr = format!("[data-v-{}]", hash);
    let mut result = String::with_capacity(selector.len() + attr.len() + 4);
    let mut rest = selector;

    while !rest.is_empty() {
        if let Some(global_start) = rest.find(":global(") {
            // Scope the part before `:global(`
            let before = &rest[..global_start];
            if !before.trim().is_empty() {
                result.push_str(&append_scope_attr(before.trim(), hash));
                result.push(' ');
            }

            // Find matching closing paren
            let after_open = &rest[global_start + ":global(".len()..];
            let mut depth = 1usize;
            let mut end = 0;
            for (i, ch) in after_open.char_indices() {
                match ch {
                    '(' => depth += 1,
                    ')' => {
                        depth -= 1;
                        if depth == 0 {
                            end = i;
                            break;
                        }
                    }
                    _ => {}
                }
            }
            let inner = &after_open[..end];
            result.push_str(inner.trim());
            rest = &after_open[end + 1..];
        } else {
            // No more :global() — scope the remainder
            if !rest.trim().is_empty() {
                result.push_str(&append_scope_attr(rest.trim(), hash));
            }
            break;
        }
    }

    result
}

/// Append `[data-v-{hash}]` to a simple (non-`:global`) selector.
///
/// The attribute is inserted **before** any pseudo-element (`::before`,
/// `::after`, `::placeholder`, etc.) so the resulting rule stays valid.
fn append_scope_attr(selector: &str, hash: &str) -> String {
    let attr = format!("[data-v-{}]", hash);

    // Check for pseudo-elements (:: prefix) — insert scope attr before them.
    if let Some(pos) = find_pseudo_element_pos(selector) {
        let mut result = String::with_capacity(selector.len() + attr.len());
        result.push_str(&selector[..pos]);
        result.push_str(&attr);
        result.push_str(&selector[pos..]);
        return result;
    }

    // Default: append at the end.
    format!("{}{}", selector, attr)
}

/// Find the byte position of the first `::` pseudo-element in `selector`.
/// Returns `None` if no pseudo-element is present.
fn find_pseudo_element_pos(selector: &str) -> Option<usize> {
    let bytes = selector.as_bytes();
    let len = bytes.len();
    let mut i = 0;
    while i + 1 < len {
        if bytes[i] == b':' && bytes[i + 1] == b':' {
            return Some(i);
        }
        i += 1;
    }
    None
}

struct CssParser<'a> {
    source: &'a str,
    pos: usize,
    base_offset: usize,
    errors: Vec<ParseError>,
}

impl<'a> CssParser<'a> {
    fn new(source: &'a str, base_offset: usize) -> Self {
        Self {
            source,
            pos: 0,
            base_offset,
            errors: Vec::new(),
        }
    }

    fn remaining(&self) -> &'a str {
        &self.source[self.pos..]
    }

    fn abs_pos(&self) -> usize {
        self.base_offset + self.pos
    }

    fn at_end(&self) -> bool {
        self.pos >= self.source.len()
    }

    fn peek(&self) -> Option<char> {
        self.remaining().chars().next()
    }

    fn advance(&mut self, n: usize) {
        self.pos = (self.pos + n).min(self.source.len());
    }

    fn skip_whitespace(&mut self) {
        while !self.at_end() && self.peek().is_some_and(|c| c.is_whitespace()) {
            self.advance(1);
        }
    }

    /// Parse top-level rules.
    fn parse_rules(&mut self) -> Vec<Spanned<CssRule>> {
        let mut rules = Vec::new();

        loop {
            self.skip_whitespace();
            if self.at_end() {
                break;
            }

            // Check for closing brace (when parsing nested rules)
            if self.remaining().starts_with('}') {
                break;
            }

            if let Some(rule) = self.parse_rule() {
                rules.push(rule);
            }
        }

        rules
    }

    /// Parse a single CSS rule.
    fn parse_rule(&mut self) -> Option<Spanned<CssRule>> {
        self.skip_whitespace();
        if self.at_end() {
            return None;
        }

        // CSS comment
        if self.remaining().starts_with("/*") {
            return self.parse_comment();
        }

        // At-rule
        if self.remaining().starts_with('@') {
            return self.parse_at_rule();
        }

        // Style rule
        self.parse_style_rule()
    }

    /// Parse a CSS comment: `/* ... */`.
    fn parse_comment(&mut self) -> Option<Spanned<CssRule>> {
        let start = self.abs_pos();
        self.advance(2); // skip /*

        if let Some(end) = self.remaining().find("*/") {
            let content = self.remaining()[..end].to_string();
            self.advance(end + 2); // skip content + */
            Some(Spanned::new(
                CssRule::Comment(content),
                start..self.abs_pos(),
            ))
        } else {
            let content = self.remaining().to_string();
            self.pos = self.source.len();
            self.errors.push(ParseError::CssError {
                offset: start,
                message: "unclosed comment".to_string(),
            });
            Some(Spanned::new(
                CssRule::Comment(content),
                start..self.abs_pos(),
            ))
        }
    }

    /// Parse a CSS at-rule: `@name prelude { nested-rules }` or `@name prelude;`.
    fn parse_at_rule(&mut self) -> Option<Spanned<CssRule>> {
        let start = self.abs_pos();
        self.advance(1); // skip @

        // Parse at-rule name
        let name_start = self.pos;
        while !self.at_end()
            && self
                .peek()
                .is_some_and(|c| c.is_ascii_alphanumeric() || c == '-')
        {
            self.advance(1);
        }
        let name = self.source[name_start..self.pos].to_string();

        self.skip_whitespace();

        // Parse prelude (everything until { or ;)
        let prelude_start = self.pos;
        while !self.at_end() && self.peek() != Some('{') && self.peek() != Some(';') {
            self.advance(1);
        }
        let prelude = self.source[prelude_start..self.pos].trim().to_string();

        // Block at-rule (e.g., @media, @keyframes)
        if self.remaining().starts_with('{') {
            self.advance(1); // skip {
            let nested = self.parse_rules();
            self.skip_whitespace();
            if self.remaining().starts_with('}') {
                self.advance(1); // skip }
            }

            Some(Spanned::new(
                CssRule::AtRule(AtRule {
                    name,
                    prelude,
                    rules: nested,
                }),
                start..self.abs_pos(),
            ))
        } else {
            // Statement at-rule (e.g., @import, @charset)
            if self.remaining().starts_with(';') {
                self.advance(1);
            }
            Some(Spanned::new(
                CssRule::AtRule(AtRule {
                    name,
                    prelude,
                    rules: vec![],
                }),
                start..self.abs_pos(),
            ))
        }
    }

    /// Parse a CSS style rule: `selectors { declarations }`.
    fn parse_style_rule(&mut self) -> Option<Spanned<CssRule>> {
        let start = self.abs_pos();

        // Parse selectors (everything until {)
        let sel_start = self.pos;
        while !self.at_end() && self.peek() != Some('{') {
            self.advance(1);
        }

        let selectors_str = self.source[sel_start..self.pos].trim();
        if selectors_str.is_empty() {
            if !self.at_end() {
                self.advance(1); // skip stray character
            }
            return None;
        }

        let selectors: Vec<String> = selectors_str
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        // Parse declaration block
        if !self.remaining().starts_with('{') {
            self.errors.push(ParseError::CssError {
                offset: self.abs_pos(),
                message: "expected '{' after selectors".to_string(),
            });
            return None;
        }
        self.advance(1); // skip {

        let declarations = self.parse_declarations();

        self.skip_whitespace();
        if self.remaining().starts_with('}') {
            self.advance(1); // skip }
        }

        Some(Spanned::new(
            CssRule::Style(StyleRule {
                selectors,
                declarations,
            }),
            start..self.abs_pos(),
        ))
    }

    /// Parse CSS declarations inside a rule block.
    fn parse_declarations(&mut self) -> Vec<CssDeclaration> {
        let mut declarations = Vec::new();

        loop {
            self.skip_whitespace();
            // Skip comments within declarations
            while self.remaining().starts_with("/*") {
                if let Some(end) = self.remaining().find("*/") {
                    self.advance(end + 2);
                    self.skip_whitespace();
                } else {
                    self.pos = self.source.len();
                    return declarations;
                }
            }

            if self.at_end() || self.remaining().starts_with('}') {
                break;
            }

            // Parse property name
            let prop_start = self.pos;
            while !self.at_end() && self.peek() != Some(':') && self.peek() != Some('}') {
                self.advance(1);
            }
            let property = self.source[prop_start..self.pos].trim().to_string();

            if property.is_empty() || !self.remaining().starts_with(':') {
                // Skip to next ; or }
                while !self.at_end() && self.peek() != Some(';') && self.peek() != Some('}') {
                    self.advance(1);
                }
                if self.remaining().starts_with(';') {
                    self.advance(1);
                }
                continue;
            }

            self.advance(1); // skip :
            self.skip_whitespace();

            // Parse value (until ; or })
            let val_start = self.pos;
            while !self.at_end() && self.peek() != Some(';') && self.peek() != Some('}') {
                self.advance(1);
            }
            let value = self.source[val_start..self.pos].trim().to_string();

            if self.remaining().starts_with(';') {
                self.advance(1); // skip ;
            }

            declarations.push(CssDeclaration { property, value });
        }

        declarations
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(source: &str) -> (Vec<Spanned<CssRule>>, Vec<ParseError>) {
        parse_css(source, 0)
    }

    // -----------------------------------------------------------------------
    // Scoping helpers
    // -----------------------------------------------------------------------

    #[test]
    fn scope_hash_is_8_chars() {
        let hash = compute_scope_hash("MyButton.vaisx");
        assert_eq!(hash.len(), 8, "hash should be exactly 8 hex chars");
    }

    #[test]
    fn scope_hash_deterministic() {
        let h1 = compute_scope_hash("Counter.vaisx");
        let h2 = compute_scope_hash("Counter.vaisx");
        assert_eq!(h1, h2, "same filename should produce same hash");
    }

    #[test]
    fn scope_hash_different_names() {
        let h1 = compute_scope_hash("Counter.vaisx");
        let h2 = compute_scope_hash("Button.vaisx");
        assert_ne!(h1, h2, "different names should produce different hashes");
    }

    #[test]
    fn scope_simple_selector() {
        let (rules, _) = parse("h1 { color: blue; }");
        let hash = "a1b2c3d4";
        let scoped = scope_css_rules(&rules, hash);
        match &scoped[0].node {
            CssRule::Style(rule) => {
                assert_eq!(rule.selectors, vec!["h1[data-v-a1b2c3d4]"]);
            }
            _ => panic!("expected Style rule"),
        }
    }

    #[test]
    fn scope_class_selector() {
        let (rules, _) = parse(".warning { color: red; }");
        let hash = "deadbeef";
        let scoped = scope_css_rules(&rules, hash);
        match &scoped[0].node {
            CssRule::Style(rule) => {
                assert_eq!(rule.selectors, vec![".warning[data-v-deadbeef]"]);
            }
            _ => panic!("expected Style rule"),
        }
    }

    #[test]
    fn scope_multiple_selectors() {
        let (rules, _) = parse("h1, h2, .title { color: blue; }");
        let hash = "12345678";
        let scoped = scope_css_rules(&rules, hash);
        match &scoped[0].node {
            CssRule::Style(rule) => {
                assert_eq!(
                    rule.selectors,
                    vec![
                        "h1[data-v-12345678]",
                        "h2[data-v-12345678]",
                        ".title[data-v-12345678]"
                    ]
                );
            }
            _ => panic!("expected Style rule"),
        }
    }

    #[test]
    fn scope_global_modifier_bypass() {
        let (rules, _) = parse(":global(body) { margin: 0; }");
        let hash = "a1b2c3d4";
        let scoped = scope_css_rules(&rules, hash);
        match &scoped[0].node {
            CssRule::Style(rule) => {
                // :global() wrapper stripped, selector unchanged
                assert_eq!(rule.selectors, vec!["body"]);
            }
            _ => panic!("expected Style rule"),
        }
    }

    #[test]
    fn scope_global_modifier_with_class() {
        let (rules, _) = parse(":global(.reset) { padding: 0; }");
        let hash = "a1b2c3d4";
        let scoped = scope_css_rules(&rules, hash);
        match &scoped[0].node {
            CssRule::Style(rule) => {
                assert_eq!(rule.selectors, vec![".reset"]);
            }
            _ => panic!("expected Style rule"),
        }
    }

    #[test]
    fn scope_pseudo_element_before_append() {
        let (rules, _) = parse("p::before { content: ''; }");
        let hash = "a1b2c3d4";
        let scoped = scope_css_rules(&rules, hash);
        match &scoped[0].node {
            CssRule::Style(rule) => {
                // Scope attr inserted before ::before pseudo-element
                assert_eq!(rule.selectors, vec!["p[data-v-a1b2c3d4]::before"]);
            }
            _ => panic!("expected Style rule"),
        }
    }

    #[test]
    fn scope_media_query_recurses() {
        let (rules, _) = parse("@media (max-width: 768px) { .container { width: 100%; } }");
        let hash = "a1b2c3d4";
        let scoped = scope_css_rules(&rules, hash);
        match &scoped[0].node {
            CssRule::AtRule(at) => {
                assert_eq!(at.name, "media");
                match &at.rules[0].node {
                    CssRule::Style(rule) => {
                        assert_eq!(rule.selectors, vec![".container[data-v-a1b2c3d4]"]);
                    }
                    _ => panic!("expected Style rule inside @media"),
                }
            }
            _ => panic!("expected AtRule"),
        }
    }

    #[test]
    fn scope_keyframes_not_scoped() {
        let src = "@keyframes fade { 0% { opacity: 0; } 100% { opacity: 1; } }";
        let (rules, _) = parse(src);
        let hash = "a1b2c3d4";
        let scoped = scope_css_rules(&rules, hash);
        match &scoped[0].node {
            CssRule::AtRule(at) => {
                assert_eq!(at.name, "keyframes");
                // Keyframe selectors (0%, 100%) must NOT get the data-v attr
                match &at.rules[0].node {
                    CssRule::Style(rule) => {
                        assert_eq!(rule.selectors, vec!["0%"]);
                    }
                    _ => panic!("expected Style rule inside @keyframes"),
                }
            }
            _ => panic!("expected AtRule"),
        }
    }

    #[test]
    fn scope_comment_preserved() {
        let (rules, _) = parse("/* comment */\nh1 { color: blue; }");
        let hash = "a1b2c3d4";
        let scoped = scope_css_rules(&rules, hash);
        match &scoped[0].node {
            CssRule::Comment(c) => assert_eq!(c, " comment "),
            _ => panic!("expected Comment"),
        }
        match &scoped[1].node {
            CssRule::Style(rule) => {
                assert_eq!(rule.selectors, vec!["h1[data-v-a1b2c3d4]"]);
            }
            _ => panic!("expected Style"),
        }
    }

    #[test]
    fn parse_simple_rule() {
        let (rules, errors) = parse("h1 { color: blue; }");
        assert!(errors.is_empty());
        assert_eq!(rules.len(), 1);
        match &rules[0].node {
            CssRule::Style(rule) => {
                assert_eq!(rule.selectors, vec!["h1"]);
                assert_eq!(rule.declarations.len(), 1);
                assert_eq!(rule.declarations[0].property, "color");
                assert_eq!(rule.declarations[0].value, "blue");
            }
            _ => panic!("expected Style rule"),
        }
    }

    #[test]
    fn parse_multiple_declarations() {
        let (rules, errors) = parse("p { color: red; font-size: 16px; margin: 0; }");
        assert!(errors.is_empty());
        match &rules[0].node {
            CssRule::Style(rule) => {
                assert_eq!(rule.declarations.len(), 3);
                assert_eq!(rule.declarations[0].property, "color");
                assert_eq!(rule.declarations[1].property, "font-size");
                assert_eq!(rule.declarations[2].property, "margin");
            }
            _ => panic!("expected Style rule"),
        }
    }

    #[test]
    fn parse_multiple_selectors() {
        let (rules, errors) = parse("h1, h2, h3 { color: blue; }");
        assert!(errors.is_empty());
        match &rules[0].node {
            CssRule::Style(rule) => {
                assert_eq!(rule.selectors, vec!["h1", "h2", "h3"]);
            }
            _ => panic!("expected Style rule"),
        }
    }

    #[test]
    fn parse_class_selector() {
        let (rules, errors) = parse(".warning { color: red; }");
        assert!(errors.is_empty());
        match &rules[0].node {
            CssRule::Style(rule) => {
                assert_eq!(rule.selectors, vec![".warning"]);
            }
            _ => panic!("expected Style rule"),
        }
    }

    #[test]
    fn parse_multiple_rules() {
        let (rules, errors) = parse("h1 { color: blue; }\n.warning { color: red; }");
        assert!(errors.is_empty());
        assert_eq!(rules.len(), 2);
    }

    #[test]
    fn parse_media_query() {
        let (rules, errors) =
            parse("@media (max-width: 768px) { .container { width: 100%; } }");
        assert!(errors.is_empty());
        assert_eq!(rules.len(), 1);
        match &rules[0].node {
            CssRule::AtRule(rule) => {
                assert_eq!(rule.name, "media");
                assert_eq!(rule.prelude, "(max-width: 768px)");
                assert_eq!(rule.rules.len(), 1);
            }
            _ => panic!("expected AtRule"),
        }
    }

    #[test]
    fn parse_keyframes() {
        let src = "@keyframes fade { 0% { opacity: 0; } 100% { opacity: 1; } }";
        let (rules, errors) = parse(src);
        assert!(errors.is_empty());
        match &rules[0].node {
            CssRule::AtRule(rule) => {
                assert_eq!(rule.name, "keyframes");
                assert_eq!(rule.prelude, "fade");
                assert_eq!(rule.rules.len(), 2);
            }
            _ => panic!("expected AtRule"),
        }
    }

    #[test]
    fn parse_import_statement() {
        let (rules, errors) = parse("@import url('reset.css');");
        assert!(errors.is_empty());
        match &rules[0].node {
            CssRule::AtRule(rule) => {
                assert_eq!(rule.name, "import");
                assert_eq!(rule.prelude, "url('reset.css')");
                assert!(rule.rules.is_empty());
            }
            _ => panic!("expected AtRule"),
        }
    }

    #[test]
    fn parse_css_comment() {
        let (rules, errors) = parse("/* comment */\nh1 { color: blue; }");
        assert!(errors.is_empty());
        assert_eq!(rules.len(), 2);
        match &rules[0].node {
            CssRule::Comment(c) => assert_eq!(c, " comment "),
            _ => panic!("expected Comment"),
        }
    }

    #[test]
    fn parse_empty_css() {
        let (rules, errors) = parse("");
        assert!(errors.is_empty());
        assert!(rules.is_empty());
    }

    #[test]
    fn parse_whitespace_only() {
        let (rules, errors) = parse("   \n  \n  ");
        assert!(errors.is_empty());
        assert!(rules.is_empty());
    }

    #[test]
    fn parse_complex_selector() {
        let (rules, errors) = parse("div > p.active:hover { background: #fff; }");
        assert!(errors.is_empty());
        match &rules[0].node {
            CssRule::Style(rule) => {
                assert_eq!(rule.selectors, vec!["div > p.active:hover"]);
                assert_eq!(rule.declarations[0].value, "#fff");
            }
            _ => panic!("expected Style rule"),
        }
    }

    #[test]
    fn parse_declaration_without_semicolon_before_close() {
        // Last declaration without trailing semicolon
        let (rules, errors) = parse("h1 { color: blue }");
        assert!(errors.is_empty());
        match &rules[0].node {
            CssRule::Style(rule) => {
                assert_eq!(rule.declarations.len(), 1);
                assert_eq!(rule.declarations[0].property, "color");
                assert_eq!(rule.declarations[0].value, "blue");
            }
            _ => panic!("expected Style rule"),
        }
    }
}

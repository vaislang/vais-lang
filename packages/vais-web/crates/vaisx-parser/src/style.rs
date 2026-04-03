//! CSS parser for `<style>` blocks in `.vaisx` files.
//!
//! Parses raw CSS into a list of [`CssRule`] nodes.
//! Supports:
//! - Style rules: `selector { property: value; }`
//! - At-rules: `@media (query) { ... }`, `@keyframes name { ... }`
//! - Comments: `/* ... */`
//! - Nested rules (within at-rules)

use crate::ast::*;

/// Parse raw CSS source into a list of CSS rules.
pub fn parse_css(source: &str, base_offset: usize) -> (Vec<Spanned<CssRule>>, Vec<ParseError>) {
    let mut parser = CssParser::new(source, base_offset);
    let rules = parser.parse_rules();
    (rules, parser.errors)
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
        while !self.at_end() && self.peek().map_or(false, |c| c.is_whitespace()) {
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
                .map_or(false, |c| c.is_ascii_alphanumeric() || c == '-')
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

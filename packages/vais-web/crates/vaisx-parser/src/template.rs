//! Template block parser for `.vaisx` files.
//!
//! Parses the content of `<template>` blocks into a tree of [`TemplateNode`]s.
//!
//! Supports:
//! - HTML elements (opening, closing, self-closing)
//! - Text content
//! - Expression interpolation: `{expr}`
//! - Event bindings: `@click={handler}`
//! - Two-way bindings: `:value={name}`
//! - Conditionals: `@if cond { ... } @elif cond { ... } @else { ... }`
//! - List rendering: `@each items -> item, index { ... }`
//! - Await blocks: `@await expr { loading => ..., ok(v) => ..., err(e) => ... }`
//! - Named slots: `<:header>...</:header>`
//! - Components (uppercase first letter)
//! - HTML comments: `<!-- ... -->`

use crate::ast::*;

/// Parse template content into a list of template nodes.
pub fn parse_template(source: &str, base_offset: usize) -> (Vec<Spanned<TemplateNode>>, Vec<ParseError>) {
    let mut parser = TemplateParser::new(source, base_offset);
    let nodes = parser.parse_children(None);
    (nodes, parser.errors)
}

struct TemplateParser<'a> {
    source: &'a str,
    pos: usize,
    base_offset: usize,
    errors: Vec<ParseError>,
}

impl<'a> TemplateParser<'a> {
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
        self.pos += n;
    }

    fn skip_whitespace(&mut self) {
        let rest = self.remaining();
        let trimmed = rest.trim_start();
        self.pos += rest.len() - trimmed.len();
    }

    /// Parse children until we hit a closing tag for `parent_tag` or end of input.
    fn parse_children(&mut self, parent_tag: Option<&str>) -> Vec<Spanned<TemplateNode>> {
        let mut children = Vec::new();

        while !self.at_end() {
            // Check for closing tag
            if let Some(tag) = parent_tag
                && self.remaining().starts_with("</") {
                    // Check if this is the matching closing tag
                    let close_check = &self.remaining()[2..];
                    let close_tag = close_check
                        .split(|c: char| c == '>' || c.is_whitespace())
                        .next()
                        .unwrap_or("");
                    if close_tag.eq_ignore_ascii_case(tag) || close_tag == tag {
                        break;
                    }
                    // Named slot closing: </:name>
                    if close_tag.starts_with(':') && parent_tag.is_some_and(|t| t.starts_with(':')) {
                        break;
                    }
                }

            // Check for end of directive block
            if parent_tag.is_none() {
                // top-level — parse everything
            }

            if let Some(node) = self.parse_node() {
                children.push(node);
            }
        }

        children
    }

    /// Parse a single template node.
    fn parse_node(&mut self) -> Option<Spanned<TemplateNode>> {
        if self.at_end() {
            return None;
        }

        // HTML comment
        if self.remaining().starts_with("<!--") {
            return self.parse_comment();
        }

        // Closing tag — handled by parent
        if self.remaining().starts_with("</") {
            return None;
        }

        // VaisX directives: @if, @elif, @else, @each, @await
        if self.remaining().starts_with("@if ") || self.remaining().starts_with("@if(") {
            return self.parse_if_block();
        }
        if self.remaining().starts_with("@each ") {
            return self.parse_each_block();
        }
        if self.remaining().starts_with("@await ") {
            return self.parse_await_block();
        }

        // Element or component: <tag ...>
        if self.remaining().starts_with('<') {
            // Named slot: <:name>
            if self.remaining().starts_with("<:") {
                return self.parse_slot_element();
            }
            return self.parse_element();
        }

        // Expression interpolation: {expr}
        if self.remaining().starts_with('{') {
            return self.parse_interpolation();
        }

        // Text content
        self.parse_text()
    }

    /// Parse an HTML comment: `<!-- ... -->`
    fn parse_comment(&mut self) -> Option<Spanned<TemplateNode>> {
        let start = self.abs_pos();
        self.advance(4); // skip <!--

        if let Some(end_pos) = self.remaining().find("-->") {
            let content = self.remaining()[..end_pos].to_string();
            self.advance(end_pos + 3); // skip content + -->
            Some(Spanned::new(
                TemplateNode::Comment(content),
                start..self.abs_pos(),
            ))
        } else {
            let content = self.remaining().to_string();
            self.pos = self.source.len();
            self.errors.push(ParseError::UnclosedTag {
                tag: "comment".to_string(),
                offset: start,
            });
            Some(Spanned::new(
                TemplateNode::Comment(content),
                start..self.abs_pos(),
            ))
        }
    }

    /// Parse an HTML/component element.
    fn parse_element(&mut self) -> Option<Spanned<TemplateNode>> {
        let start = self.abs_pos();
        self.advance(1); // skip <

        // Parse tag name
        let tag_start = self.pos;
        while !self.at_end() && !self.peek().is_none_or(|c| c.is_whitespace() || c == '>' || c == '/') {
            self.advance(1);
        }
        let tag = self.source[tag_start..self.pos].to_string();

        if tag.is_empty() {
            self.errors.push(ParseError::Expected {
                expected: "tag name".to_string(),
                found: self.peek().map_or("EOF".to_string(), |c| c.to_string()),
                offset: self.abs_pos(),
            });
            return None;
        }

        let is_component = tag.chars().next().is_some_and(|c| c.is_uppercase());

        // Parse attributes
        let attributes = self.parse_attributes();

        self.skip_whitespace();

        // Self-closing tag: ... />
        if self.remaining().starts_with("/>") {
            self.advance(2);
            return Some(Spanned::new(
                TemplateNode::Element(Element {
                    tag,
                    is_component,
                    attributes,
                    children: vec![],
                    self_closing: true,
                }),
                start..self.abs_pos(),
            ));
        }

        // Close opening tag: >
        if self.remaining().starts_with('>') {
            self.advance(1);
        } else {
            self.errors.push(ParseError::Expected {
                expected: "'>' or '/>'".to_string(),
                found: self.peek().map_or("EOF".to_string(), |c| c.to_string()),
                offset: self.abs_pos(),
            });
        }

        // Void elements (no closing tag needed)
        let void_elements = [
            "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
            "param", "source", "track", "wbr",
        ];
        if void_elements.contains(&tag.to_lowercase().as_str()) {
            return Some(Spanned::new(
                TemplateNode::Element(Element {
                    tag,
                    is_component,
                    attributes,
                    children: vec![],
                    self_closing: true,
                }),
                start..self.abs_pos(),
            ));
        }

        // Parse children
        let children = self.parse_children(Some(&tag));

        // Parse closing tag
        if self.remaining().starts_with("</") {
            self.advance(2); // skip </
            // Read closing tag name
            let close_start = self.pos;
            while !self.at_end() && self.peek().is_some_and(|c| c != '>') {
                self.advance(1);
            }
            let close_tag = self.source[close_start..self.pos].trim();
            if close_tag != tag {
                self.errors.push(ParseError::MismatchedTag {
                    expected: tag.clone(),
                    found: close_tag.to_string(),
                    offset: self.abs_pos(),
                });
            }
            if self.remaining().starts_with('>') {
                self.advance(1);
            }
        } else if !self.at_end() {
            self.errors.push(ParseError::UnclosedTag {
                tag: tag.clone(),
                offset: start,
            });
        }

        Some(Spanned::new(
            TemplateNode::Element(Element {
                tag,
                is_component,
                attributes,
                children,
                self_closing: false,
            }),
            start..self.abs_pos(),
        ))
    }

    /// Parse a named slot element: `<:name>...</:name>`
    fn parse_slot_element(&mut self) -> Option<Spanned<TemplateNode>> {
        // Treat slot as a regular element with tag name ":name"
        self.parse_element()
    }

    /// Parse attributes on an element.
    fn parse_attributes(&mut self) -> Vec<Spanned<Attribute>> {
        let mut attrs = Vec::new();

        loop {
            self.skip_whitespace();

            if self.at_end() || self.remaining().starts_with('>') || self.remaining().starts_with("/>") {
                break;
            }

            let start = self.abs_pos();

            // Event binding: @name={handler}
            if self.remaining().starts_with('@')
                && let Some(attr) = self.parse_event_attr() {
                    attrs.push(Spanned::new(attr, start..self.abs_pos()));
                    continue;
                }

            // Two-way binding: :name={expr}
            if self.remaining().starts_with(':')
                && let Some(attr) = self.parse_bind_attr() {
                    attrs.push(Spanned::new(attr, start..self.abs_pos()));
                    continue;
                }

            // Shorthand or spread: {name} or {...expr}
            if self.remaining().starts_with('{') {
                if self.remaining().starts_with("{...") {
                    if let Some(attr) = self.parse_spread_attr() {
                        attrs.push(Spanned::new(attr, start..self.abs_pos()));
                        continue;
                    }
                } else if let Some(attr) = self.parse_shorthand_attr() {
                    attrs.push(Spanned::new(attr, start..self.abs_pos()));
                    continue;
                }
            }

            // Static or dynamic attribute: name="value" or name={expr}
            if let Some(attr) = self.parse_regular_attr() {
                attrs.push(Spanned::new(attr, start..self.abs_pos()));
            } else {
                // Skip unknown character
                self.advance(1);
            }
        }

        attrs
    }

    /// Parse `@name={handler}` or `@name|modifier={handler}`.
    fn parse_event_attr(&mut self) -> Option<Attribute> {
        self.advance(1); // skip @

        // Parse event name
        let name_start = self.pos;
        while !self.at_end()
            && self.peek().is_some_and(|c| {
                c.is_ascii_alphanumeric() || c == '_' || c == '-'
            })
        {
            self.advance(1);
        }
        let name = self.source[name_start..self.pos].to_string();

        // Parse modifiers: |modifier1|modifier2
        let mut modifiers = Vec::new();
        while self.remaining().starts_with('|') {
            self.advance(1);
            let mod_start = self.pos;
            while !self.at_end()
                && self
                    .peek()
                    .is_some_and(|c| c.is_ascii_alphanumeric() || c == '_')
            {
                self.advance(1);
            }
            modifiers.push(self.source[mod_start..self.pos].to_string());
        }

        // Parse handler: ={handler}
        if !self.remaining().starts_with('=') {
            return None;
        }
        self.advance(1); // skip =

        let handler = self.parse_expr_value()?;

        Some(Attribute::Event(EventBinding {
            name,
            modifiers,
            handler,
        }))
    }

    /// Parse `:name={expr}`.
    fn parse_bind_attr(&mut self) -> Option<Attribute> {
        self.advance(1); // skip :

        let name_start = self.pos;
        while !self.at_end()
            && self.peek().is_some_and(|c| {
                c.is_ascii_alphanumeric() || c == '_' || c == '-'
            })
        {
            self.advance(1);
        }
        let property = self.source[name_start..self.pos].to_string();

        if !self.remaining().starts_with('=') {
            return None;
        }
        self.advance(1);

        let expr = self.parse_expr_value()?;

        Some(Attribute::Bind(BindDirective { property, expr }))
    }

    /// Parse `{name}` shorthand attribute.
    fn parse_shorthand_attr(&mut self) -> Option<Attribute> {
        self.advance(1); // skip {
        let start = self.pos;
        let end = self.remaining().find('}')?;
        let name = self.source[start..start + end].trim().to_string();
        self.advance(end + 1); // skip past }
        Some(Attribute::Shorthand { name })
    }

    /// Parse `{...expr}` spread attribute.
    fn parse_spread_attr(&mut self) -> Option<Attribute> {
        self.advance(4); // skip {...
        let start = self.abs_pos();
        let expr_start = self.pos;

        let mut depth = 1;
        while !self.at_end() && depth > 0 {
            match self.peek() {
                Some('{') => depth += 1,
                Some('}') => depth -= 1,
                _ => {}
            }
            if depth > 0 {
                self.advance(1);
            }
        }

        let raw = self.source[expr_start..self.pos].trim().to_string();
        if self.remaining().starts_with('}') {
            self.advance(1);
        }

        Some(Attribute::Spread {
            expr: Expr::new(raw, start..self.abs_pos()),
        })
    }

    /// Parse a regular attribute: `name="value"` or `name={expr}`.
    fn parse_regular_attr(&mut self) -> Option<Attribute> {
        let name_start = self.pos;
        while !self.at_end()
            && self.peek().is_some_and(|c| {
                c.is_ascii_alphanumeric() || c == '_' || c == '-'
            })
        {
            self.advance(1);
        }
        let name = self.source[name_start..self.pos].to_string();
        if name.is_empty() {
            return None;
        }

        self.skip_whitespace();

        // Boolean attribute (no value)
        if !self.remaining().starts_with('=') {
            return Some(Attribute::Static {
                name,
                value: String::new(),
            });
        }

        self.advance(1); // skip =
        self.skip_whitespace();

        // Dynamic value: {expr}
        if self.remaining().starts_with('{') {
            let expr = self.parse_expr_value()?;
            return Some(Attribute::Dynamic { name, value: expr });
        }

        // Static value: "..." or '...'
        if self.remaining().starts_with('"') || self.remaining().starts_with('\'') {
            let quote = self.peek().unwrap();
            self.advance(1);
            let val_start = self.pos;
            while !self.at_end() && self.peek() != Some(quote) {
                self.advance(1);
            }
            let value = self.source[val_start..self.pos].to_string();
            if !self.at_end() {
                self.advance(1); // skip closing quote
            }
            return Some(Attribute::Static { name, value });
        }

        // Unquoted value (up to whitespace or >)
        let val_start = self.pos;
        while !self.at_end()
            && self
                .peek()
                .is_some_and(|c| !c.is_whitespace() && c != '>' && c != '/')
        {
            self.advance(1);
        }
        let value = self.source[val_start..self.pos].to_string();
        Some(Attribute::Static { name, value })
    }

    /// Parse an expression value in `{...}` brackets.
    fn parse_expr_value(&mut self) -> Option<Expr> {
        if !self.remaining().starts_with('{') {
            return None;
        }
        self.advance(1); // skip {
        let start = self.abs_pos();
        let expr_start = self.pos;

        let mut depth = 1;
        while !self.at_end() && depth > 0 {
            match self.peek() {
                Some('{') => depth += 1,
                Some('}') => {
                    depth -= 1;
                    if depth == 0 {
                        break;
                    }
                }
                _ => {}
            }
            self.advance(1);
        }

        let raw = self.source[expr_start..self.pos].trim().to_string();
        let end = self.abs_pos();

        if self.remaining().starts_with('}') {
            self.advance(1); // skip }
        }

        Some(Expr::new(raw, start..end))
    }

    /// Parse expression interpolation: `{expr}`.
    fn parse_interpolation(&mut self) -> Option<Spanned<TemplateNode>> {
        let start = self.abs_pos();
        let expr = self.parse_expr_value()?;
        Some(Spanned::new(
            TemplateNode::ExprInterpolation(ExprInterpolation { expr }),
            start..self.abs_pos(),
        ))
    }

    /// Parse text content (everything until `<`, `{`, or `@`).
    fn parse_text(&mut self) -> Option<Spanned<TemplateNode>> {
        let start = self.abs_pos();
        let text_start = self.pos;

        while !self.at_end() {
            let ch = self.peek().unwrap();
            if ch == '<' || ch == '{' {
                break;
            }
            // @ is a directive only at word boundary with known directives
            if ch == '@' {
                let rest = self.remaining();
                if rest.starts_with("@if ") || rest.starts_with("@if(")
                    || rest.starts_with("@elif ") || rest.starts_with("@elif(")
                    || rest.starts_with("@else ")  || rest.starts_with("@else{")
                    || rest.starts_with("@each ")
                    || rest.starts_with("@await ")
                {
                    break;
                }
            }
            self.advance(1);
        }

        let text = self.source[text_start..self.pos].to_string();
        if text.is_empty() {
            return None;
        }

        Some(Spanned::new(
            TemplateNode::Text(text),
            start..self.abs_pos(),
        ))
    }

    /// Parse `@if condition { ... } @elif condition { ... } @else { ... }`.
    fn parse_if_block(&mut self) -> Option<Spanned<TemplateNode>> {
        let start = self.abs_pos();

        // Parse @if
        self.advance(3); // skip "@if"
        self.skip_whitespace();

        let condition = self.parse_directive_condition()?;
        self.skip_whitespace();

        let consequent = self.parse_directive_body()?;

        // Parse @elif branches
        let mut elifs = Vec::new();
        loop {
            self.skip_whitespace();
            if !self.remaining().starts_with("@elif ") && !self.remaining().starts_with("@elif(") {
                break;
            }
            let elif_start = self.abs_pos();
            self.advance(5); // skip "@elif"
            self.skip_whitespace();

            if let Some(cond) = self.parse_directive_condition() {
                self.skip_whitespace();
                if let Some(body) = self.parse_directive_body() {
                    elifs.push(ElifBranch {
                        condition: cond,
                        body,
                        span: elif_start..self.abs_pos(),
                    });
                }
            }
        }

        // Parse @else
        self.skip_whitespace();
        let alternate = if self.remaining().starts_with("@else") {
            self.advance(5); // skip "@else"
            self.skip_whitespace();
            self.parse_directive_body()
        } else {
            None
        };

        Some(Spanned::new(
            TemplateNode::IfBlock(IfBlock {
                condition,
                consequent,
                elifs,
                alternate,
            }),
            start..self.abs_pos(),
        ))
    }

    /// Parse `@each iterable -> item, index { ... }`.
    fn parse_each_block(&mut self) -> Option<Spanned<TemplateNode>> {
        let start = self.abs_pos();
        self.advance(5); // skip "@each"
        self.skip_whitespace();

        // Parse iterable (up to ->)
        let iter_start = self.pos;
        let arrow_pos = self.remaining().find("->")?;
        let iterable_raw = self.source[iter_start..iter_start + arrow_pos].trim().to_string();
        let iterable = Expr::new(iterable_raw, self.abs_pos()..self.abs_pos() + arrow_pos);
        self.advance(arrow_pos + 2); // skip past ->
        self.skip_whitespace();

        // Parse bindings: item or item, index
        let bind_start = self.pos;
        while !self.at_end() && self.peek().is_some_and(|c| c != '{') {
            self.advance(1);
        }
        let bindings = self.source[bind_start..self.pos].trim();
        let mut parts = bindings.split(',');
        let item_binding = parts.next().unwrap_or("item").trim().to_string();
        let index_binding = parts.next().map(|s| s.trim().to_string());

        self.skip_whitespace();
        let body = self.parse_directive_body()?;

        Some(Spanned::new(
            TemplateNode::EachBlock(EachBlock {
                iterable,
                item_binding,
                index_binding,
                key: None, // key is set via key={expr} attribute on child element
                body,
            }),
            start..self.abs_pos(),
        ))
    }

    /// Parse `@await expr { loading => ..., ok(v) => ..., err(e) => ... }`.
    fn parse_await_block(&mut self) -> Option<Spanned<TemplateNode>> {
        let start = self.abs_pos();
        self.advance(6); // skip "@await"
        self.skip_whitespace();

        // Parse expression (up to {)
        let expr_start = self.pos;
        while !self.at_end() && self.peek() != Some('{') {
            self.advance(1);
        }
        let expr_raw = self.source[expr_start..self.pos].trim().to_string();
        let expr = Expr::new(expr_raw, self.abs_pos()..self.abs_pos());

        self.skip_whitespace();

        // Parse the block body with arms
        if !self.remaining().starts_with('{') {
            return None;
        }
        self.advance(1); // skip {

        let mut loading = None;
        let mut ok_binding = None;
        let mut ok_body = None;
        let mut err_binding = None;
        let mut err_body = None;

        // Parse arms
        loop {
            self.skip_whitespace();
            if self.at_end() || self.remaining().starts_with('}') {
                break;
            }

            if self.remaining().starts_with("loading") {
                self.advance(7);
                self.skip_whitespace();
                if self.remaining().starts_with("=>") {
                    self.advance(2);
                    self.skip_whitespace();
                    loading = self.parse_await_arm_body();
                }
            } else if self.remaining().starts_with("ok(") {
                self.advance(3);
                let bind_start = self.pos;
                while !self.at_end() && self.peek() != Some(')') {
                    self.advance(1);
                }
                ok_binding = Some(self.source[bind_start..self.pos].trim().to_string());
                if !self.at_end() {
                    self.advance(1); // skip )
                }
                self.skip_whitespace();
                if self.remaining().starts_with("=>") {
                    self.advance(2);
                    self.skip_whitespace();
                    ok_body = self.parse_await_arm_body();
                }
            } else if self.remaining().starts_with("err(") {
                self.advance(4);
                let bind_start = self.pos;
                while !self.at_end() && self.peek() != Some(')') {
                    self.advance(1);
                }
                err_binding = Some(self.source[bind_start..self.pos].trim().to_string());
                if !self.at_end() {
                    self.advance(1); // skip )
                }
                self.skip_whitespace();
                if self.remaining().starts_with("=>") {
                    self.advance(2);
                    self.skip_whitespace();
                    err_body = self.parse_await_arm_body();
                }
            } else {
                // Skip unknown content
                self.advance(1);
            }
        }

        if self.remaining().starts_with('}') {
            self.advance(1);
        }

        Some(Spanned::new(
            TemplateNode::AwaitBlock(AwaitBlock {
                expr,
                loading,
                ok_binding,
                ok_body,
                err_binding,
                err_body,
            }),
            start..self.abs_pos(),
        ))
    }

    /// Parse the body of an await arm — either `{ nodes }` or a single element.
    fn parse_await_arm_body(&mut self) -> Option<Vec<Spanned<TemplateNode>>> {
        if self.remaining().starts_with('{') {
            self.parse_directive_body()
        } else if self.remaining().starts_with('<') {
            let node = self.parse_node()?;
            Some(vec![node])
        } else {
            // Single text/expression
            let node = self.parse_node()?;
            Some(vec![node])
        }
    }

    /// Parse a directive condition expression (up to `{`).
    fn parse_directive_condition(&mut self) -> Option<Expr> {
        let start = self.abs_pos();
        let expr_start = self.pos;

        // Read until we hit `{`
        while !self.at_end() && self.peek() != Some('{') {
            self.advance(1);
        }

        let raw = self.source[expr_start..self.pos].trim().to_string();
        if raw.is_empty() {
            self.errors.push(ParseError::Expected {
                expected: "condition expression".to_string(),
                found: "empty".to_string(),
                offset: start,
            });
            return None;
        }

        Some(Expr::new(raw, start..self.abs_pos()))
    }

    /// Parse a directive body: `{ ... }` containing template nodes.
    fn parse_directive_body(&mut self) -> Option<Vec<Spanned<TemplateNode>>> {
        if !self.remaining().starts_with('{') {
            self.errors.push(ParseError::Expected {
                expected: "'{'".to_string(),
                found: self.peek().map_or("EOF".to_string(), |c| c.to_string()),
                offset: self.abs_pos(),
            });
            return None;
        }

        self.advance(1); // skip {

        let mut children = Vec::new();

        // We need to track brace depth while parsing template content
        // But template nodes can contain { } for interpolation
        // So we parse nodes, and track the remaining } for the directive block
        loop {
            self.skip_whitespace();

            if self.at_end() {
                self.errors.push(ParseError::UnclosedTag {
                    tag: "directive block".to_string(),
                    offset: self.abs_pos(),
                });
                break;
            }

            if self.remaining().starts_with('}') {
                self.advance(1);
                break;
            }

            // Check for @elif or @else at this level — they end the block
            if self.remaining().starts_with("@elif ") || self.remaining().starts_with("@elif(")
                || self.remaining().starts_with("@else ") || self.remaining().starts_with("@else{")
            {
                break;
            }

            if let Some(node) = self.parse_node() {
                children.push(node);
            } else {
                // Avoid infinite loop
                if !self.at_end() {
                    self.advance(1);
                }
            }
        }

        Some(children)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(source: &str) -> (Vec<Spanned<TemplateNode>>, Vec<ParseError>) {
        parse_template(source, 0)
    }

    // -----------------------------------------------------------------------
    // Basic elements
    // -----------------------------------------------------------------------

    #[test]
    fn parse_simple_element() {
        let (nodes, errors) = parse("<h1>Hello</h1>");
        assert!(errors.is_empty());
        assert_eq!(nodes.len(), 1);
        match &nodes[0].node {
            TemplateNode::Element(el) => {
                assert_eq!(el.tag, "h1");
                assert!(!el.is_component);
                assert!(!el.self_closing);
                assert_eq!(el.children.len(), 1);
                match &el.children[0].node {
                    TemplateNode::Text(t) => assert_eq!(t, "Hello"),
                    _ => panic!("expected Text"),
                }
            }
            _ => panic!("expected Element"),
        }
    }

    #[test]
    fn parse_self_closing() {
        let (nodes, errors) = parse("<input />");
        assert!(errors.is_empty());
        match &nodes[0].node {
            TemplateNode::Element(el) => {
                assert_eq!(el.tag, "input");
                assert!(el.self_closing);
            }
            _ => panic!("expected Element"),
        }
    }

    #[test]
    fn parse_void_element() {
        let (nodes, errors) = parse("<br>");
        assert!(errors.is_empty());
        match &nodes[0].node {
            TemplateNode::Element(el) => {
                assert_eq!(el.tag, "br");
                assert!(el.self_closing);
            }
            _ => panic!("expected Element"),
        }
    }

    #[test]
    fn parse_nested_elements() {
        let (nodes, errors) = parse("<div><p>text</p></div>");
        assert!(errors.is_empty());
        match &nodes[0].node {
            TemplateNode::Element(el) => {
                assert_eq!(el.tag, "div");
                assert_eq!(el.children.len(), 1);
                match &el.children[0].node {
                    TemplateNode::Element(inner) => {
                        assert_eq!(inner.tag, "p");
                    }
                    _ => panic!("expected inner Element"),
                }
            }
            _ => panic!("expected Element"),
        }
    }

    // -----------------------------------------------------------------------
    // Attributes
    // -----------------------------------------------------------------------

    #[test]
    fn parse_static_attribute() {
        let (nodes, _) = parse("<div class=\"foo\">x</div>");
        match &nodes[0].node {
            TemplateNode::Element(el) => {
                assert_eq!(el.attributes.len(), 1);
                match &el.attributes[0].node {
                    Attribute::Static { name, value } => {
                        assert_eq!(name, "class");
                        assert_eq!(value, "foo");
                    }
                    _ => panic!("expected Static attribute"),
                }
            }
            _ => panic!("expected Element"),
        }
    }

    #[test]
    fn parse_dynamic_attribute() {
        let (nodes, _) = parse("<div class={dynamicClass}>x</div>");
        match &nodes[0].node {
            TemplateNode::Element(el) => {
                match &el.attributes[0].node {
                    Attribute::Dynamic { name, value } => {
                        assert_eq!(name, "class");
                        assert_eq!(value.raw, "dynamicClass");
                    }
                    _ => panic!("expected Dynamic attribute"),
                }
            }
            _ => panic!("expected Element"),
        }
    }

    // -----------------------------------------------------------------------
    // Event binding
    // -----------------------------------------------------------------------

    #[test]
    fn parse_event_binding() {
        let (nodes, _) = parse("<button @click={handler}>x</button>");
        match &nodes[0].node {
            TemplateNode::Element(el) => {
                match &el.attributes[0].node {
                    Attribute::Event(ev) => {
                        assert_eq!(ev.name, "click");
                        assert_eq!(ev.handler.raw, "handler");
                        assert!(ev.modifiers.is_empty());
                    }
                    _ => panic!("expected Event attribute"),
                }
            }
            _ => panic!("expected Element"),
        }
    }

    #[test]
    fn parse_event_with_modifiers() {
        let (nodes, _) = parse("<button @click|preventDefault={handler}>x</button>");
        match &nodes[0].node {
            TemplateNode::Element(el) => {
                match &el.attributes[0].node {
                    Attribute::Event(ev) => {
                        assert_eq!(ev.name, "click");
                        assert_eq!(ev.modifiers, vec!["preventDefault"]);
                    }
                    _ => panic!("expected Event attribute"),
                }
            }
            _ => panic!("expected Element"),
        }
    }

    // -----------------------------------------------------------------------
    // Bind directive
    // -----------------------------------------------------------------------

    #[test]
    fn parse_bind_directive() {
        let (nodes, _) = parse("<input :value={name} />");
        match &nodes[0].node {
            TemplateNode::Element(el) => {
                match &el.attributes[0].node {
                    Attribute::Bind(bind) => {
                        assert_eq!(bind.property, "value");
                        assert_eq!(bind.expr.raw, "name");
                    }
                    _ => panic!("expected Bind attribute"),
                }
            }
            _ => panic!("expected Element"),
        }
    }

    // -----------------------------------------------------------------------
    // Expression interpolation
    // -----------------------------------------------------------------------

    #[test]
    fn parse_interpolation() {
        let (nodes, _) = parse("<p>{count}</p>");
        match &nodes[0].node {
            TemplateNode::Element(el) => {
                match &el.children[0].node {
                    TemplateNode::ExprInterpolation(interp) => {
                        assert_eq!(interp.expr.raw, "count");
                    }
                    _ => panic!("expected ExprInterpolation, got {:?}", el.children[0].node),
                }
            }
            _ => panic!("expected Element"),
        }
    }

    #[test]
    fn parse_text_and_interpolation() {
        let (nodes, _) = parse("<p>Count: {count}</p>");
        match &nodes[0].node {
            TemplateNode::Element(el) => {
                assert_eq!(el.children.len(), 2);
                match &el.children[0].node {
                    TemplateNode::Text(t) => assert_eq!(t, "Count: "),
                    _ => panic!("expected Text"),
                }
                match &el.children[1].node {
                    TemplateNode::ExprInterpolation(interp) => {
                        assert_eq!(interp.expr.raw, "count");
                    }
                    _ => panic!("expected ExprInterpolation"),
                }
            }
            _ => panic!("expected Element"),
        }
    }

    // -----------------------------------------------------------------------
    // @if / @elif / @else
    // -----------------------------------------------------------------------

    #[test]
    fn parse_if_block() {
        let (nodes, errors) = parse("@if count > 10 {\n  <p>High</p>\n}");
        assert!(errors.is_empty(), "errors: {:?}", errors);
        assert_eq!(nodes.len(), 1);
        match &nodes[0].node {
            TemplateNode::IfBlock(block) => {
                assert_eq!(block.condition.raw, "count > 10");
                assert!(!block.consequent.is_empty());
                assert!(block.elifs.is_empty());
                assert!(block.alternate.is_none());
            }
            _ => panic!("expected IfBlock"),
        }
    }

    #[test]
    fn parse_if_elif_else() {
        let src = "@if x > 10 {\n  <p>High</p>\n} @elif x > 5 {\n  <p>Mid</p>\n} @else {\n  <p>Low</p>\n}";
        let (nodes, errors) = parse(src);
        assert!(errors.is_empty(), "errors: {:?}", errors);
        match &nodes[0].node {
            TemplateNode::IfBlock(block) => {
                assert_eq!(block.condition.raw, "x > 10");
                assert_eq!(block.elifs.len(), 1);
                assert_eq!(block.elifs[0].condition.raw, "x > 5");
                assert!(block.alternate.is_some());
            }
            _ => panic!("expected IfBlock"),
        }
    }

    // -----------------------------------------------------------------------
    // @each
    // -----------------------------------------------------------------------

    #[test]
    fn parse_each_block() {
        let (nodes, errors) = parse("@each items -> item, index {\n  <li>{item}</li>\n}");
        assert!(errors.is_empty(), "errors: {:?}", errors);
        match &nodes[0].node {
            TemplateNode::EachBlock(block) => {
                assert_eq!(block.iterable.raw, "items");
                assert_eq!(block.item_binding, "item");
                assert_eq!(block.index_binding, Some("index".to_string()));
                assert!(!block.body.is_empty());
            }
            _ => panic!("expected EachBlock"),
        }
    }

    #[test]
    fn parse_each_no_index() {
        let (nodes, errors) = parse("@each items -> item {\n  <li>{item}</li>\n}");
        assert!(errors.is_empty(), "errors: {:?}", errors);
        match &nodes[0].node {
            TemplateNode::EachBlock(block) => {
                assert_eq!(block.item_binding, "item");
                assert!(block.index_binding.is_none());
            }
            _ => panic!("expected EachBlock"),
        }
    }

    // -----------------------------------------------------------------------
    // @await
    // -----------------------------------------------------------------------

    #[test]
    fn parse_await_block() {
        let src = "@await loadItems() {\n  loading => <p>Loading...</p>\n  ok(items) => {\n    <ul>list</ul>\n  }\n  err(e) => <p>Error</p>\n}";
        let (nodes, errors) = parse(src);
        assert!(errors.is_empty(), "errors: {:?}", errors);
        match &nodes[0].node {
            TemplateNode::AwaitBlock(block) => {
                assert_eq!(block.expr.raw, "loadItems()");
                assert!(block.loading.is_some());
                assert_eq!(block.ok_binding, Some("items".to_string()));
                assert!(block.ok_body.is_some());
                assert_eq!(block.err_binding, Some("e".to_string()));
                assert!(block.err_body.is_some());
            }
            _ => panic!("expected AwaitBlock"),
        }
    }

    // -----------------------------------------------------------------------
    // Components
    // -----------------------------------------------------------------------

    #[test]
    fn parse_component() {
        let (nodes, _) = parse("<Counter initial={5} />");
        match &nodes[0].node {
            TemplateNode::Element(el) => {
                assert_eq!(el.tag, "Counter");
                assert!(el.is_component);
                assert!(el.self_closing);
            }
            _ => panic!("expected Element"),
        }
    }

    // -----------------------------------------------------------------------
    // Comments
    // -----------------------------------------------------------------------

    #[test]
    fn parse_html_comment() {
        let (nodes, errors) = parse("<!-- a comment -->");
        assert!(errors.is_empty());
        match &nodes[0].node {
            TemplateNode::Comment(c) => assert_eq!(c, " a comment "),
            _ => panic!("expected Comment"),
        }
    }

    // -----------------------------------------------------------------------
    // Mixed content
    // -----------------------------------------------------------------------

    #[test]
    fn parse_mixed_content() {
        let src = "<h1>{greeting}</h1>\n<button @click={increment}>+1</button>";
        let (nodes, errors) = parse(src);
        assert!(errors.is_empty(), "errors: {:?}", errors);
        assert_eq!(nodes.len(), 3); // h1, text(\n), button
    }

    // -----------------------------------------------------------------------
    // Component props
    // -----------------------------------------------------------------------

    #[test]
    fn parse_component_with_props() {
        let (nodes, errors) = parse("<UserCard user={currentUser} showAvatar={true} />");
        assert!(errors.is_empty(), "errors: {:?}", errors);
        match &nodes[0].node {
            TemplateNode::Element(el) => {
                assert_eq!(el.tag, "UserCard");
                assert!(el.is_component);
                assert!(el.self_closing);
                assert_eq!(el.attributes.len(), 2);
                match &el.attributes[0].node {
                    Attribute::Dynamic { name, value } => {
                        assert_eq!(name, "user");
                        assert_eq!(value.raw, "currentUser");
                    }
                    _ => panic!("expected Dynamic attribute for user prop"),
                }
                match &el.attributes[1].node {
                    Attribute::Dynamic { name, value } => {
                        assert_eq!(name, "showAvatar");
                        assert_eq!(value.raw, "true");
                    }
                    _ => panic!("expected Dynamic attribute for showAvatar prop"),
                }
            }
            _ => panic!("expected Element"),
        }
    }

    #[test]
    fn parse_component_with_event() {
        let (nodes, errors) = parse("<UserCard user={u} @select={handleSelect} />");
        assert!(errors.is_empty(), "errors: {:?}", errors);
        match &nodes[0].node {
            TemplateNode::Element(el) => {
                assert!(el.is_component);
                assert_eq!(el.attributes.len(), 2);
                match &el.attributes[1].node {
                    Attribute::Event(ev) => {
                        assert_eq!(ev.name, "select");
                        assert_eq!(ev.handler.raw, "handleSelect");
                    }
                    _ => panic!("expected Event attribute"),
                }
            }
            _ => panic!("expected Element"),
        }
    }

    #[test]
    fn parse_component_with_children() {
        let (nodes, errors) = parse("<Layout><h1>Title</h1></Layout>");
        assert!(errors.is_empty(), "errors: {:?}", errors);
        match &nodes[0].node {
            TemplateNode::Element(el) => {
                assert_eq!(el.tag, "Layout");
                assert!(el.is_component);
                assert!(!el.self_closing);
                assert_eq!(el.children.len(), 1);
                match &el.children[0].node {
                    TemplateNode::Element(inner) => assert_eq!(inner.tag, "h1"),
                    _ => panic!("expected h1 child"),
                }
            }
            _ => panic!("expected Element"),
        }
    }

    // -----------------------------------------------------------------------
    // Named slots
    // -----------------------------------------------------------------------

    #[test]
    fn parse_named_slot() {
        let src = "<Layout><:header><h1>Title</h1></:header></Layout>";
        let (nodes, errors) = parse(src);
        assert!(errors.is_empty(), "errors: {:?}", errors);
        match &nodes[0].node {
            TemplateNode::Element(el) => {
                assert_eq!(el.tag, "Layout");
                assert!(el.is_component);
                assert_eq!(el.children.len(), 1);
                match &el.children[0].node {
                    TemplateNode::Element(slot) => {
                        assert_eq!(slot.tag, ":header");
                        assert_eq!(slot.children.len(), 1);
                        match &slot.children[0].node {
                            TemplateNode::Element(h1) => assert_eq!(h1.tag, "h1"),
                            _ => panic!("expected h1 inside slot"),
                        }
                    }
                    _ => panic!("expected slot Element"),
                }
            }
            _ => panic!("expected Layout Element"),
        }
    }

    #[test]
    fn parse_multiple_named_slots() {
        let src = "<Layout><:header><h1>Title</h1></:header><:default><p>Content</p></:default></Layout>";
        let (nodes, errors) = parse(src);
        assert!(errors.is_empty(), "errors: {:?}", errors);
        match &nodes[0].node {
            TemplateNode::Element(el) => {
                assert_eq!(el.tag, "Layout");
                assert_eq!(el.children.len(), 2);
                match &el.children[0].node {
                    TemplateNode::Element(slot) => assert_eq!(slot.tag, ":header"),
                    _ => panic!("expected header slot"),
                }
                match &el.children[1].node {
                    TemplateNode::Element(slot) => assert_eq!(slot.tag, ":default"),
                    _ => panic!("expected default slot"),
                }
            }
            _ => panic!("expected Layout Element"),
        }
    }

    #[test]
    fn parse_component_static_prop() {
        let (nodes, errors) = parse("<Counter initial=\"5\" />");
        assert!(errors.is_empty(), "errors: {:?}", errors);
        match &nodes[0].node {
            TemplateNode::Element(el) => {
                assert!(el.is_component);
                match &el.attributes[0].node {
                    Attribute::Static { name, value } => {
                        assert_eq!(name, "initial");
                        assert_eq!(value, "5");
                    }
                    _ => panic!("expected Static attribute"),
                }
            }
            _ => panic!("expected Element"),
        }
    }

    #[test]
    fn parse_shorthand_prop() {
        let (nodes, errors) = parse("<UserCard {user} />");
        assert!(errors.is_empty(), "errors: {:?}", errors);
        match &nodes[0].node {
            TemplateNode::Element(el) => {
                assert!(el.is_component);
                match &el.attributes[0].node {
                    Attribute::Shorthand { name } => assert_eq!(name, "user"),
                    _ => panic!("expected Shorthand attribute"),
                }
            }
            _ => panic!("expected Element"),
        }
    }

    #[test]
    fn parse_spread_props() {
        let (nodes, errors) = parse("<UserCard {...props} />");
        assert!(errors.is_empty(), "errors: {:?}", errors);
        match &nodes[0].node {
            TemplateNode::Element(el) => {
                assert!(el.is_component);
                match &el.attributes[0].node {
                    Attribute::Spread { expr } => assert_eq!(expr.raw, "props"),
                    _ => panic!("expected Spread attribute"),
                }
            }
            _ => panic!("expected Element"),
        }
    }
}

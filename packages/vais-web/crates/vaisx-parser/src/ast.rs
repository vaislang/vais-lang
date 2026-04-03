//! VaisX AST node definitions.
//!
//! Represents the parsed structure of a `.vaisx` file:
//! - `VaisxFile` — top-level container with script, template, and style blocks
//! - `ScriptBlock` — `<script>` block (raw source + desugar metadata)
//! - `TemplateBlock` — `<template>` block (HTML + VaisX directives)
//! - `StyleBlock` — `<style>` block (scoped/global CSS)

use std::ops::Range;

// ---------------------------------------------------------------------------
// Span & Spanned
// ---------------------------------------------------------------------------

/// Byte offset range in the original source text.
pub type Span = Range<usize>;

/// A node annotated with its source location.
#[derive(Debug, Clone, PartialEq)]
pub struct Spanned<T> {
    pub node: T,
    pub span: Span,
}

impl<T> Spanned<T> {
    pub fn new(node: T, span: Span) -> Self {
        Self { node, span }
    }
}

// ---------------------------------------------------------------------------
// Top-level file
// ---------------------------------------------------------------------------

/// A parsed `.vaisx` file.
///
/// All three blocks are optional. Order in the source is irrelevant.
#[derive(Debug, Clone, PartialEq)]
pub struct VaisxFile {
    /// `<script>` block (at most one).
    pub script: Option<Spanned<ScriptBlock>>,
    /// `<template>` block (at most one).
    pub template: Option<Spanned<TemplateBlock>>,
    /// `<style>` blocks (zero or more — scoped + global).
    pub styles: Vec<Spanned<StyleBlock>>,
}

// ---------------------------------------------------------------------------
// <script> block
// ---------------------------------------------------------------------------

/// The `<script>` block holds raw Vais source that will be desugared
/// before being handed to the core `vais-parser`.
#[derive(Debug, Clone, PartialEq)]
pub struct ScriptBlock {
    /// Script context attribute: `<script>` (auto), `<script context="client">`,
    /// or `<script context="server">`.
    pub context: ScriptContext,
    /// Raw source text inside the `<script>` tags (before desugar).
    pub raw_source: String,
    /// Source text after desugar (`$state` -> `__vx_state`, etc.).
    /// Populated by the desugar pass; `None` until then.
    pub desugared_source: Option<String>,
    /// Props declaration extracted from the `P { }` block (if any).
    pub props: Option<Spanned<PropsDecl>>,
    /// Event emit declarations extracted from `P { }` and `emit` calls.
    pub events: Vec<Spanned<EventDecl>>,
}

/// Script context — determines server vs. client rendering.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ScriptContext {
    /// No explicit context — auto-detected by the compiler.
    #[default]
    Auto,
    /// `<script context="client">` — force client component.
    Client,
    /// `<script context="server">` — force server component.
    Server,
}

/// Props declaration from `P { ... }` block.
#[derive(Debug, Clone, PartialEq)]
pub struct PropsDecl {
    pub fields: Vec<Spanned<PropField>>,
}

/// A single prop field.
#[derive(Debug, Clone, PartialEq)]
pub struct PropField {
    pub name: String,
    pub type_annotation: String,
    /// Optional default value expression (source text).
    pub default_value: Option<String>,
}

/// An event declaration from `emit eventName(params)`.
#[derive(Debug, Clone, PartialEq)]
pub struct EventDecl {
    pub name: String,
    /// Parameter list as raw source text (e.g., `"user: User"`).
    pub params: String,
}

// ---------------------------------------------------------------------------
// <template> block
// ---------------------------------------------------------------------------

/// The `<template>` block — a tree of template nodes.
#[derive(Debug, Clone, PartialEq)]
pub struct TemplateBlock {
    pub children: Vec<Spanned<TemplateNode>>,
}

/// A node in the template tree.
#[derive(Debug, Clone, PartialEq)]
pub enum TemplateNode {
    /// An HTML or component element: `<tag ...>children</tag>`
    Element(Element),
    /// Raw text content.
    Text(String),
    /// Expression interpolation: `{expr}`.
    ExprInterpolation(ExprInterpolation),
    /// `@if` / `@elif` / `@else` conditional rendering.
    IfBlock(IfBlock),
    /// `@each items -> item, index { ... }` list rendering.
    EachBlock(EachBlock),
    /// `@await expr { loading => ..., ok(v) => ..., err(e) => ... }`.
    AwaitBlock(AwaitBlock),
    /// A comment: `<!-- ... -->`.
    Comment(String),
}

/// An HTML element or VaisX component.
#[derive(Debug, Clone, PartialEq)]
pub struct Element {
    /// Tag name (e.g., `"div"`, `"button"`, `"Counter"`, `"UserCard"`).
    pub tag: String,
    /// Whether this is a component (uppercase first letter) vs. HTML element.
    pub is_component: bool,
    /// Static and dynamic attributes.
    pub attributes: Vec<Spanned<Attribute>>,
    /// Child nodes.
    pub children: Vec<Spanned<TemplateNode>>,
    /// Whether this is a self-closing tag: `<img />`.
    pub self_closing: bool,
}

/// An attribute on an element.
#[derive(Debug, Clone, PartialEq)]
pub enum Attribute {
    /// Static attribute: `class="foo"`.
    Static {
        name: String,
        value: String,
    },
    /// Dynamic attribute: `class={expr}`.
    Dynamic {
        name: String,
        value: Expr,
    },
    /// Event binding: `@click={handler}`.
    Event(EventBinding),
    /// Two-way binding: `:value={name}`.
    Bind(BindDirective),
    /// Shorthand: `{name}` equivalent to `name={name}`.
    Shorthand {
        name: String,
    },
    /// Spread: `{...props}`.
    Spread {
        expr: Expr,
    },
}

/// Event binding: `@click={handler}` or `@click|preventDefault={handler}`.
#[derive(Debug, Clone, PartialEq)]
pub struct EventBinding {
    /// Event name (e.g., `"click"`, `"select"`).
    pub name: String,
    /// Modifiers (e.g., `["preventDefault", "stopPropagation"]`).
    pub modifiers: Vec<String>,
    /// Handler expression.
    pub handler: Expr,
}

/// Two-way binding: `:value={name}`.
#[derive(Debug, Clone, PartialEq)]
pub struct BindDirective {
    /// Property name (e.g., `"value"`, `"checked"`).
    pub property: String,
    /// Bound expression.
    pub expr: Expr,
}

/// Expression interpolation: `{count}`, `{count * 2}`.
#[derive(Debug, Clone, PartialEq)]
pub struct ExprInterpolation {
    pub expr: Expr,
}

// ---------------------------------------------------------------------------
// Directives
// ---------------------------------------------------------------------------

/// Conditional rendering: `@if cond { ... } @elif cond { ... } @else { ... }`.
#[derive(Debug, Clone, PartialEq)]
pub struct IfBlock {
    /// The primary `@if` branch.
    pub condition: Expr,
    pub consequent: Vec<Spanned<TemplateNode>>,
    /// Zero or more `@elif` branches.
    pub elifs: Vec<ElifBranch>,
    /// Optional `@else` branch.
    pub alternate: Option<Vec<Spanned<TemplateNode>>>,
}

/// An `@elif` branch.
#[derive(Debug, Clone, PartialEq)]
pub struct ElifBranch {
    pub condition: Expr,
    pub body: Vec<Spanned<TemplateNode>>,
    pub span: Span,
}

/// List rendering: `@each items -> item, index { ... }`.
#[derive(Debug, Clone, PartialEq)]
pub struct EachBlock {
    /// The iterable expression (e.g., `items`).
    pub iterable: Expr,
    /// The item binding name (e.g., `"item"`).
    pub item_binding: String,
    /// Optional index binding name (e.g., `"index"`).
    pub index_binding: Option<String>,
    /// Optional key expression for reconciliation.
    pub key: Option<Expr>,
    /// Loop body.
    pub body: Vec<Spanned<TemplateNode>>,
}

/// Async rendering: `@await expr { loading => ..., ok(v) => ..., err(e) => ... }`.
#[derive(Debug, Clone, PartialEq)]
pub struct AwaitBlock {
    /// The async expression to await.
    pub expr: Expr,
    /// Loading state body.
    pub loading: Option<Vec<Spanned<TemplateNode>>>,
    /// Success body with binding name.
    pub ok_binding: Option<String>,
    pub ok_body: Option<Vec<Spanned<TemplateNode>>>,
    /// Error body with binding name.
    pub err_binding: Option<String>,
    pub err_body: Option<Vec<Spanned<TemplateNode>>>,
}

// ---------------------------------------------------------------------------
// <style> block
// ---------------------------------------------------------------------------

/// A `<style>` block — scoped or global CSS.
#[derive(Debug, Clone, PartialEq)]
pub struct StyleBlock {
    /// Whether this is `<style global>`.
    pub is_global: bool,
    /// Raw CSS source text.
    pub raw_css: String,
    /// Parsed CSS rules (populated by the CSS parser pass).
    pub rules: Vec<Spanned<CssRule>>,
}

/// A CSS rule.
#[derive(Debug, Clone, PartialEq)]
pub enum CssRule {
    /// A style rule: `selector { declarations }`.
    Style(StyleRule),
    /// An at-rule: `@media ...`, `@keyframes ...`, etc.
    AtRule(AtRule),
    /// A CSS comment.
    Comment(String),
}

/// A CSS style rule.
#[derive(Debug, Clone, PartialEq)]
pub struct StyleRule {
    /// Selectors (e.g., `["h1", ".warning"]`).
    pub selectors: Vec<String>,
    /// Declarations (e.g., `[("color", "blue"), ("font-size", "1rem")]`).
    pub declarations: Vec<CssDeclaration>,
}

/// A CSS declaration: `property: value`.
#[derive(Debug, Clone, PartialEq)]
pub struct CssDeclaration {
    pub property: String,
    pub value: String,
}

/// A CSS at-rule.
#[derive(Debug, Clone, PartialEq)]
pub struct AtRule {
    /// At-rule name (e.g., `"media"`, `"keyframes"`).
    pub name: String,
    /// Prelude/query (e.g., `"(max-width: 768px)"`).
    pub prelude: String,
    /// Nested rules (for block at-rules like @media).
    pub rules: Vec<Spanned<CssRule>>,
}

// ---------------------------------------------------------------------------
// Slot
// ---------------------------------------------------------------------------

/// Named slot usage: `<:header>...</:header>`, `<:default>...</:default>`.
#[derive(Debug, Clone, PartialEq)]
pub struct SlotUsage {
    /// Slot name (e.g., `"header"`, `"default"`).
    pub name: String,
    /// Content nodes.
    pub children: Vec<Spanned<TemplateNode>>,
}

/// Slot definition in a component: `<slot name="header" />` or `<slot />`.
#[derive(Debug, Clone, PartialEq)]
pub struct SlotDefinition {
    /// Slot name (`None` for default slot).
    pub name: Option<String>,
    /// Fallback content.
    pub fallback: Vec<Spanned<TemplateNode>>,
}

// ---------------------------------------------------------------------------
// Expression (template-level)
// ---------------------------------------------------------------------------

/// An expression used in template contexts.
///
/// We keep expressions as raw source strings at this stage; the compiler
/// will resolve them against the script AST during analysis.
#[derive(Debug, Clone, PartialEq)]
pub struct Expr {
    /// Raw expression source text (e.g., `"count * 2"`, `"increment"`).
    pub raw: String,
    /// Span within the `.vaisx` source.
    pub span: Span,
}

impl Expr {
    pub fn new(raw: impl Into<String>, span: Span) -> Self {
        Self {
            raw: raw.into(),
            span,
        }
    }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/// Parse error with source location.
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum ParseError {
    #[error("unexpected end of input at byte {0}")]
    UnexpectedEof(usize),

    #[error("expected {expected} at byte {offset}, found {found:?}")]
    Expected {
        expected: String,
        found: String,
        offset: usize,
    },

    #[error("unclosed {tag} tag starting at byte {offset}")]
    UnclosedTag { tag: String, offset: usize },

    #[error("mismatched closing tag: expected </{expected}>, found </{found}> at byte {offset}")]
    MismatchedTag {
        expected: String,
        found: String,
        offset: usize,
    },

    #[error("duplicate {block} block at byte {offset} (first at byte {first_offset})")]
    DuplicateBlock {
        block: String,
        offset: usize,
        first_offset: usize,
    },

    #[error("invalid directive @{name} at byte {offset}: {reason}")]
    InvalidDirective {
        name: String,
        offset: usize,
        reason: String,
    },

    #[error("desugar error at byte {offset}: {message}")]
    DesugarError { offset: usize, message: String },

    #[error("CSS parse error at byte {offset}: {message}")]
    CssError { offset: usize, message: String },

    #[error("{message} at byte {offset}")]
    General { message: String, offset: usize },
}

impl ParseError {
    /// Returns the byte offset where this error occurred.
    pub fn offset(&self) -> usize {
        match self {
            Self::UnexpectedEof(o) => *o,
            Self::Expected { offset, .. } => *offset,
            Self::UnclosedTag { offset, .. } => *offset,
            Self::MismatchedTag { offset, .. } => *offset,
            Self::DuplicateBlock { offset, .. } => *offset,
            Self::InvalidDirective { offset, .. } => *offset,
            Self::DesugarError { offset, .. } => *offset,
            Self::CssError { offset, .. } => *offset,
            Self::General { offset, .. } => *offset,
        }
    }
}

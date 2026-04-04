//! Reactivity analysis — dependency graph builder.
//!
//! Analyzes a parsed `.vaisx` file to extract:
//! 1. Reactive variable declarations (`$state`, `$derived`, `$effect`)
//! 2. Dependency relationships (which state vars does a derived/effect depend on?)
//! 3. Template bindings (which expressions reference reactive variables?)
//! 4. State mutation sites (assignments to state variables)
//!
//! ## Pipeline
//!
//! ```text
//! VaisxFile AST
//!     |
//!     +-- extract_reactive_vars()    — scan desugared source for __vx_state/__vx_derived/__vx_effect
//!     +-- analyze_template()         — walk template tree, collect bindings with dependency info
//!     +-- build_dependency_graph()   — assemble full DependencyGraph
//!     |
//!     v
//! ComponentIR (ready for codegen)
//! ```

use std::collections::HashSet;

use vaisx_parser::{
    Attribute, EachBlock, Element, ExprInterpolation, IfBlock, TemplateNode, VaisxFile,
};

use crate::error::CompileError;
use crate::ir::{
    BindingKind, ComponentIR, DependencyGraph, DerivedVar, EffectVar, EventIR, FunctionIR,
    PropFieldIR, PropsIR, ReactiveVar, TemplateBinding,
};

/// Analyze a parsed `VaisxFile` and build the component IR.
pub fn analyze(file: &VaisxFile, component_name: &str) -> Result<ComponentIR, CompileError> {
    let mut graph = DependencyGraph::new();
    let mut functions = Vec::new();

    // Step 1: Extract reactive variables from the desugared script source
    if let Some(script) = &file.script {
        let source = script
            .node
            .desugared_source
            .as_deref()
            .unwrap_or(&script.node.raw_source);

        let reactive_names = extract_reactive_vars(source, &mut graph)?;
        extract_functions(source, &reactive_names, &mut functions);
    }

    // Collect all reactive variable names for dependency detection
    let reactive_names: HashSet<String> = graph
        .state_vars
        .keys()
        .chain(graph.derived_vars.keys())
        .cloned()
        .collect();

    // Step 2: Analyze template for bindings
    let mut node_counter = 0;
    if let Some(template) = &file.template {
        analyze_template_nodes(&template.node.children, &reactive_names, &mut graph, &mut node_counter);
    }

    // Step 3: Build the component IR
    let has_reactivity =
        !graph.state_vars.is_empty() || !graph.derived_vars.is_empty() || !graph.effects.is_empty();

    let props = file.script.as_ref().and_then(|s| {
        s.node.props.as_ref().map(|p| PropsIR {
            fields: p
                .node
                .fields
                .iter()
                .map(|f| PropFieldIR {
                    name: f.node.name.clone(),
                    type_annotation: f.node.type_annotation.clone(),
                    default_value: f.node.default_value.clone(),
                })
                .collect(),
        })
    });

    let events = file
        .script
        .as_ref()
        .map(|s| {
            s.node
                .events
                .iter()
                .map(|e| EventIR {
                    name: e.node.name.clone(),
                    params: e.node.params.clone(),
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(ComponentIR {
        name: component_name.to_string(),
        dependency_graph: graph,
        props,
        events,
        has_reactivity,
        functions,
    })
}

// ---------------------------------------------------------------------------
// Script analysis: reactive variable extraction
// ---------------------------------------------------------------------------

/// Extract reactive variable declarations from desugared script source.
///
/// Scans for patterns:
/// - `name := __vx_state(init_expr)` -> ReactiveVar
/// - `name := __vx_derived(|| { expr })` -> DerivedVar
/// - `__vx_effect(|| { body })` -> EffectVar
fn extract_reactive_vars(
    source: &str,
    graph: &mut DependencyGraph,
) -> Result<HashSet<String>, CompileError> {
    let mut reactive_names = HashSet::new();
    let mut effect_index = 0;

    // First pass: collect all state and derived names so we can resolve deps
    let lines: Vec<&str> = source.lines().collect();

    // Extract state variables
    for line in &lines {
        let trimmed = line.trim();
        if let Some((name, init)) = parse_state_decl(trimmed) {
            reactive_names.insert(name.clone());
            graph.add_state(ReactiveVar {
                name,
                init_expr: init,
            });
        }
    }

    // Extract derived variables (need state names for dep analysis)
    for line in &lines {
        let trimmed = line.trim();
        if let Some((name, expr)) = parse_derived_decl(trimmed) {
            let deps = find_reactive_refs(&expr, &reactive_names);
            reactive_names.insert(name.clone());
            graph.add_derived(DerivedVar { name, expr, deps });
        }
    }

    // Re-resolve derived deps now that all derived names are known
    let all_reactive: HashSet<String> = reactive_names.clone();
    let derived_keys: Vec<String> = graph.derived_vars.keys().cloned().collect();
    for key in &derived_keys {
        if let Some(derived) = graph.derived_vars.get_mut(key) {
            derived.deps = find_reactive_refs(&derived.expr, &all_reactive);
            // Update dependents map
            let dep_key = format!("derived:{}", derived.name);
            for dep in &derived.deps {
                graph
                    .dependents
                    .entry(dep.clone())
                    .or_default()
                    .insert(dep_key.clone());
            }
        }
    }

    // Extract effects (multi-line — find __vx_effect blocks)
    let mut i = 0;
    let source_bytes = source.as_bytes();
    while i < source.len() {
        if let Some(pos) = source[i..].find("__vx_effect(|| {") {
            let abs_pos = i + pos;
            let after = &source[abs_pos + "__vx_effect(|| {".len()..];
            if let Some(close) = find_matching_close(after, '{', '}') {
                // close is the position of '}' in `after`, but we need to also skip the ')' after it
                let body = &after[..close];
                let deps = find_reactive_refs(body, &all_reactive);
                graph.add_effect(EffectVar {
                    index: effect_index,
                    body: body.trim().to_string(),
                    deps,
                });
                effect_index += 1;
                i = abs_pos + "__vx_effect(|| {".len() + close + 1;
            } else {
                i = abs_pos + 1;
            }
        } else {
            break;
        }
    }

    // Detect state mutation sites: `name += expr`, `name = expr`, `name -= expr` etc.
    // These are tracked so codegen can wrap them in $$update calls
    // (For now, mutation tracking is implicit — any assignment to a state var triggers update)
    let _ = source_bytes; // suppress unused warning

    Ok(reactive_names)
}

/// Parse `name := __vx_state(init_expr)` pattern.
fn parse_state_decl(line: &str) -> Option<(String, String)> {
    let assign_pos = line.find(":=")?;
    let after_assign = line[assign_pos + 2..].trim();

    if !after_assign.starts_with("__vx_state(") {
        return None;
    }

    let name = line[..assign_pos].trim().to_string();
    let inner_start = "__vx_state(".len();
    let inner = &after_assign[inner_start..];

    // Find matching closing paren
    let close = find_matching_close_paren(inner)?;
    let init_expr = inner[..close].trim().to_string();

    Some((name, init_expr))
}

/// Parse `name := __vx_derived(|| { expr })` pattern.
fn parse_derived_decl(line: &str) -> Option<(String, String)> {
    let assign_pos = line.find(":=")?;
    let after_assign = line[assign_pos + 2..].trim();

    if !after_assign.starts_with("__vx_derived(|| { ") {
        return None;
    }

    let name = line[..assign_pos].trim().to_string();

    // Extract the expression between `|| { ` and ` })`
    let inner_start = "__vx_derived(|| { ".len();
    let inner = &after_assign[inner_start..];

    // Find ` })` at the end
    let close = inner.rfind(" })")?;
    let expr = inner[..close].trim().to_string();

    Some((name, expr))
}

/// Find references to reactive variable names in an expression.
///
/// Uses simple identifier boundary detection — a name is referenced if it
/// appears as a standalone identifier (not part of a longer word).
fn find_reactive_refs(expr: &str, reactive_names: &HashSet<String>) -> HashSet<String> {
    let mut refs = HashSet::new();

    for name in reactive_names {
        if is_identifier_referenced(expr, name) {
            refs.insert(name.clone());
        }
    }

    refs
}

/// Check if `name` appears as a standalone identifier in `source`.
///
/// A standalone identifier is not preceded/followed by alphanumeric or underscore chars.
fn is_identifier_referenced(source: &str, name: &str) -> bool {
    let bytes = source.as_bytes();
    let name_bytes = name.as_bytes();
    let name_len = name_bytes.len();

    let mut pos = 0;
    while pos + name_len <= bytes.len() {
        if let Some(idx) = source[pos..].find(name) {
            let abs_pos = pos + idx;
            let before_ok = abs_pos == 0
                || (!bytes[abs_pos - 1].is_ascii_alphanumeric() && bytes[abs_pos - 1] != b'_');
            let after_pos = abs_pos + name_len;
            let after_ok = after_pos >= bytes.len()
                || (!bytes[after_pos].is_ascii_alphanumeric() && bytes[after_pos] != b'_');

            if before_ok && after_ok {
                return true;
            }
            pos = abs_pos + 1;
        } else {
            break;
        }
    }

    false
}

/// Extract non-reactive function declarations from the script.
///
/// Looks for `F name(...) { body }` patterns that are not reactive declarations.
fn extract_functions(
    source: &str,
    reactive_names: &HashSet<String>,
    functions: &mut Vec<FunctionIR>,
) {
    // Simple heuristic: find lines starting with `F ` followed by identifier then `(`
    let mut remaining = source;

    while let Some(f_pos) = find_function_start(remaining) {
        let after_f = &remaining[f_pos + 2..]; // skip "F "

        // Extract function name
        let name_end = after_f
            .find(|c: char| !c.is_ascii_alphanumeric() && c != '_')
            .unwrap_or(after_f.len());
        let name = &after_f[..name_end];

        if name.is_empty() || reactive_names.contains(name) {
            remaining = &remaining[f_pos + 2..];
            continue;
        }

        // Find the function body (between { and })
        if let Some(brace_start) = after_f[name_end..].find('{') {
            let body_start = name_end + brace_start;
            let body_source = &after_f[body_start..];
            if let Some(close) = find_matching_close(body_source, '{', '}') {
                // Include params in body for simplicity
                let params_and_body = after_f[name_end..body_start + close + 1].to_string();
                functions.push(FunctionIR {
                    name: name.to_string(),
                    body: params_and_body,
                });
                remaining = &after_f[body_start + close + 1..];
                continue;
            }
        }

        remaining = &remaining[f_pos + 2..];
    }
}

/// Find the start of a function declaration `F name`.
/// Returns the byte position of `F` if found.
fn find_function_start(source: &str) -> Option<usize> {
    let bytes = source.as_bytes();
    for i in 0..bytes.len() {
        if bytes[i] != b'F' {
            continue;
        }
        // Must be at line start (start of string or after newline + whitespace)
        let at_line_start = if i == 0 {
            true
        } else {
            let before = &source[..i];
            let trimmed = before.trim_end_matches([' ', '\t']);
            trimmed.is_empty() || trimmed.ends_with('\n')
        };
        if !at_line_start {
            continue;
        }
        // Must be followed by a space then an identifier
        if i + 1 < bytes.len() && bytes[i + 1] == b' ' {
            let after = &source[i + 2..];
            if after.starts_with(|c: char| c.is_ascii_alphabetic() || c == '_') {
                return Some(i);
            }
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Template analysis
// ---------------------------------------------------------------------------

/// Walk the template AST and collect bindings with dependency information.
fn analyze_template_nodes(
    nodes: &[vaisx_parser::Spanned<TemplateNode>],
    reactive_names: &HashSet<String>,
    graph: &mut DependencyGraph,
    node_counter: &mut usize,
) {
    for spanned_node in nodes {
        match &spanned_node.node {
            TemplateNode::Element(element) => {
                let element_idx = *node_counter;
                *node_counter += 1;
                analyze_element(element, element_idx, reactive_names, graph, node_counter);
            }
            TemplateNode::Text(_) => {
                *node_counter += 1;
            }
            TemplateNode::ExprInterpolation(interp) => {
                let idx = *node_counter;
                *node_counter += 1;
                analyze_interpolation(interp, idx, reactive_names, graph);
            }
            TemplateNode::IfBlock(if_block) => {
                let idx = *node_counter;
                *node_counter += 1;
                analyze_if_block(if_block, idx, reactive_names, graph, node_counter);
            }
            TemplateNode::EachBlock(each_block) => {
                let idx = *node_counter;
                *node_counter += 1;
                analyze_each_block(each_block, idx, reactive_names, graph, node_counter);
            }
            TemplateNode::AwaitBlock(_) => {
                // TODO: await block analysis
                *node_counter += 1;
            }
            TemplateNode::Comment(_) => {
                *node_counter += 1;
            }
        }
    }
}

/// Analyze an element's attributes and children.
fn analyze_element(
    element: &Element,
    element_idx: usize,
    reactive_names: &HashSet<String>,
    graph: &mut DependencyGraph,
    node_counter: &mut usize,
) {
    for attr in &element.attributes {
        match &attr.node {
            Attribute::Dynamic { name, value } => {
                let deps = find_reactive_refs(&value.raw, reactive_names);
                if !deps.is_empty() {
                    graph.add_binding(TemplateBinding {
                        kind: if element.is_component {
                            BindingKind::ComponentProp {
                                node_index: element_idx,
                                prop_name: name.clone(),
                            }
                        } else {
                            BindingKind::Attribute {
                                node_index: element_idx,
                                attr_name: name.clone(),
                            }
                        },
                        expr: value.raw.clone(),
                        deps,
                    });
                }
            }
            Attribute::Event(binding) => {
                let deps = find_reactive_refs(&binding.handler.raw, reactive_names);
                // Events always create a binding (even without reactive deps) for codegen
                graph.add_binding(TemplateBinding {
                    kind: BindingKind::Event {
                        node_index: element_idx,
                        event_name: binding.name.clone(),
                        modifiers: binding.modifiers.clone(),
                    },
                    expr: binding.handler.raw.clone(),
                    deps,
                });
            }
            Attribute::Bind(bind) => {
                let deps = find_reactive_refs(&bind.expr.raw, reactive_names);
                graph.add_binding(TemplateBinding {
                    kind: BindingKind::TwoWay {
                        node_index: element_idx,
                        property: bind.property.clone(),
                        var_name: bind.expr.raw.clone(),
                    },
                    expr: bind.expr.raw.clone(),
                    deps,
                });
            }
            Attribute::Shorthand { name } => {
                let deps = find_reactive_refs(name, reactive_names);
                if !deps.is_empty() {
                    graph.add_binding(TemplateBinding {
                        kind: if element.is_component {
                            BindingKind::ComponentProp {
                                node_index: element_idx,
                                prop_name: name.clone(),
                            }
                        } else {
                            BindingKind::Attribute {
                                node_index: element_idx,
                                attr_name: name.clone(),
                            }
                        },
                        expr: name.clone(),
                        deps,
                    });
                }
            }
            Attribute::Spread { expr } => {
                let deps = find_reactive_refs(&expr.raw, reactive_names);
                if !deps.is_empty() {
                    // Spread bindings affect all attributes — represented as a special attribute binding
                    graph.add_binding(TemplateBinding {
                        kind: BindingKind::Attribute {
                            node_index: element_idx,
                            attr_name: "..spread".to_string(),
                        },
                        expr: expr.raw.clone(),
                        deps,
                    });
                }
            }
            Attribute::Static { .. } => {
                // Static attributes don't produce bindings
            }
        }
    }

    // Recurse into children
    analyze_template_nodes(&element.children, reactive_names, graph, node_counter);
}

/// Analyze an expression interpolation.
fn analyze_interpolation(
    interp: &ExprInterpolation,
    node_idx: usize,
    reactive_names: &HashSet<String>,
    graph: &mut DependencyGraph,
) {
    let deps = find_reactive_refs(&interp.expr.raw, reactive_names);
    if !deps.is_empty() {
        graph.add_binding(TemplateBinding {
            kind: BindingKind::Text {
                node_index: node_idx,
            },
            expr: interp.expr.raw.clone(),
            deps,
        });
    }
}

/// Analyze an `@if` block.
fn analyze_if_block(
    if_block: &IfBlock,
    node_idx: usize,
    reactive_names: &HashSet<String>,
    graph: &mut DependencyGraph,
    node_counter: &mut usize,
) {
    // The condition expression creates a binding
    let deps = find_reactive_refs(&if_block.condition.raw, reactive_names);
    if !deps.is_empty() {
        graph.add_binding(TemplateBinding {
            kind: BindingKind::Conditional {
                node_index: node_idx,
            },
            expr: if_block.condition.raw.clone(),
            deps,
        });
    }

    // Analyze children of consequent
    analyze_template_nodes(&if_block.consequent, reactive_names, graph, node_counter);

    // Analyze elif branches
    for elif in &if_block.elifs {
        let elif_deps = find_reactive_refs(&elif.condition.raw, reactive_names);
        if !elif_deps.is_empty() {
            graph.add_binding(TemplateBinding {
                kind: BindingKind::Conditional {
                    node_index: node_idx,
                },
                expr: elif.condition.raw.clone(),
                deps: elif_deps,
            });
        }
        analyze_template_nodes(&elif.body, reactive_names, graph, node_counter);
    }

    // Analyze else branch
    if let Some(alternate) = &if_block.alternate {
        analyze_template_nodes(alternate, reactive_names, graph, node_counter);
    }
}

/// Analyze an `@each` block.
fn analyze_each_block(
    each_block: &EachBlock,
    node_idx: usize,
    reactive_names: &HashSet<String>,
    graph: &mut DependencyGraph,
    node_counter: &mut usize,
) {
    // The iterable expression creates a list binding
    let deps = find_reactive_refs(&each_block.iterable.raw, reactive_names);
    if !deps.is_empty() {
        graph.add_binding(TemplateBinding {
            kind: BindingKind::List {
                node_index: node_idx,
                item_binding: each_block.item_binding.clone(),
                index_binding: each_block.index_binding.clone(),
                key_expr: each_block.key.as_ref().map(|k| k.raw.clone()),
            },
            expr: each_block.iterable.raw.clone(),
            deps,
        });
    }

    // Analyze children (note: item_binding introduces a new scope variable,
    // but we don't track it as reactive — it's a loop variable)
    analyze_template_nodes(&each_block.body, reactive_names, graph, node_counter);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Find the matching closing delimiter, handling nesting.
fn find_matching_close(source: &str, open: char, close: char) -> Option<usize> {
    if source.is_empty() || !source.starts_with(open) {
        // If source doesn't start with open, search from beginning with depth 1
        let mut depth: i32 = 1;
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
                c if c == open => depth += 1,
                c if c == close => {
                    depth -= 1;
                    if depth == 0 {
                        return Some(i);
                    }
                }
                _ => {}
            }
        }
        return None;
    }

    // Source starts with open char
    let mut depth: i32 = 1;
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
            c if c == open => depth += 1,
            c if c == close => {
                depth -= 1;
                if depth == 0 {
                    return Some(i + 1);
                }
            }
            _ => {}
        }
    }
    None
}

/// Find matching closing paren (starting after the opening paren).
fn find_matching_close_paren(source: &str) -> Option<usize> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use vaisx_parser::parse;

    // -----------------------------------------------------------------------
    // Reactive variable extraction
    // -----------------------------------------------------------------------

    #[test]
    fn extract_state_vars() {
        let source = r#"<script>
  count := $state(0)
  name := $state("world")
</script>"#;
        let file = parse(source).unwrap();
        let ir = analyze(&file, "Test").unwrap();

        assert_eq!(ir.dependency_graph.state_vars.len(), 2);
        assert!(ir.dependency_graph.state_vars.contains_key("count"));
        assert!(ir.dependency_graph.state_vars.contains_key("name"));
        assert_eq!(
            ir.dependency_graph.state_vars["count"].init_expr,
            "0"
        );
        assert_eq!(
            ir.dependency_graph.state_vars["name"].init_expr,
            "\"world\""
        );
        assert!(ir.has_reactivity);
    }

    #[test]
    fn extract_derived_vars_with_deps() {
        let source = r#"<script>
  count := $state(0)
  doubled := $derived(count * 2)
</script>"#;
        let file = parse(source).unwrap();
        let ir = analyze(&file, "Test").unwrap();

        assert_eq!(ir.dependency_graph.derived_vars.len(), 1);
        let doubled = &ir.dependency_graph.derived_vars["doubled"];
        assert_eq!(doubled.expr, "count * 2");
        assert!(doubled.deps.contains("count"));

        // count should have doubled as a dependent
        let deps = ir.dependency_graph.get_dependents("count").unwrap();
        assert!(deps.contains("derived:doubled"));
    }

    #[test]
    fn extract_effects_with_deps() {
        let source = r#"<script>
  count := $state(0)
  $effect {
    console_log(count)
  }
</script>"#;
        let file = parse(source).unwrap();
        let ir = analyze(&file, "Test").unwrap();

        assert_eq!(ir.dependency_graph.effects.len(), 1);
        let effect = &ir.dependency_graph.effects[0];
        assert!(effect.body.contains("console_log(count)"));
        assert!(effect.deps.contains("count"));

        let deps = ir.dependency_graph.get_dependents("count").unwrap();
        assert!(deps.contains("effect:0"));
    }

    #[test]
    fn derived_chain_deps() {
        let source = r#"<script>
  a := $state(1)
  b := $derived(a + 1)
  c := $derived(b + 1)
</script>"#;
        let file = parse(source).unwrap();
        let ir = analyze(&file, "Test").unwrap();

        let b = &ir.dependency_graph.derived_vars["b"];
        assert!(b.deps.contains("a"));
        let c = &ir.dependency_graph.derived_vars["c"];
        assert!(c.deps.contains("b"));

        // Topo order should be b before c
        let order = ir.dependency_graph.derived_topo_order();
        let b_pos = order.iter().position(|x| x == "b").unwrap();
        let c_pos = order.iter().position(|x| x == "c").unwrap();
        assert!(b_pos < c_pos);
    }

    // -----------------------------------------------------------------------
    // Template binding analysis
    // -----------------------------------------------------------------------

    #[test]
    fn text_interpolation_binding() {
        let source = r#"<script>
  count := $state(0)
</script>
<template>
  <p>{count}</p>
</template>"#;
        let file = parse(source).unwrap();
        let ir = analyze(&file, "Test").unwrap();

        let text_bindings: Vec<_> = ir
            .dependency_graph
            .bindings
            .iter()
            .filter(|b| matches!(b.kind, BindingKind::Text { .. }))
            .collect();
        assert_eq!(text_bindings.len(), 1);
        assert_eq!(text_bindings[0].expr, "count");
        assert!(text_bindings[0].deps.contains("count"));
    }

    #[test]
    fn dynamic_attribute_binding() {
        let source = r#"<script>
  cls := $state("active")
</script>
<template>
  <div class={cls}>hello</div>
</template>"#;
        let file = parse(source).unwrap();
        let ir = analyze(&file, "Test").unwrap();

        let attr_bindings: Vec<_> = ir
            .dependency_graph
            .bindings
            .iter()
            .filter(|b| matches!(b.kind, BindingKind::Attribute { .. }))
            .collect();
        assert_eq!(attr_bindings.len(), 1);
        assert!(attr_bindings[0].deps.contains("cls"));
    }

    #[test]
    fn event_binding() {
        let source = r#"<script>
  count := $state(0)
  F increment() { count += 1 }
</script>
<template>
  <button @click={increment}>{count}</button>
</template>"#;
        let file = parse(source).unwrap();
        let ir = analyze(&file, "Test").unwrap();

        let event_bindings: Vec<_> = ir
            .dependency_graph
            .bindings
            .iter()
            .filter(|b| matches!(b.kind, BindingKind::Event { .. }))
            .collect();
        assert_eq!(event_bindings.len(), 1);
        assert_eq!(event_bindings[0].expr, "increment");
    }

    #[test]
    fn two_way_binding() {
        let source = r#"<script>
  name := $state("")
</script>
<template>
  <input :value={name} />
</template>"#;
        let file = parse(source).unwrap();
        let ir = analyze(&file, "Test").unwrap();

        let bind_bindings: Vec<_> = ir
            .dependency_graph
            .bindings
            .iter()
            .filter(|b| matches!(b.kind, BindingKind::TwoWay { .. }))
            .collect();
        assert_eq!(bind_bindings.len(), 1);
        assert!(bind_bindings[0].deps.contains("name"));
    }

    #[test]
    fn conditional_binding() {
        let source = r#"<script>
  show := $state(true)
</script>
<template>
  @if show {
    <p>visible</p>
  }
</template>"#;
        let file = parse(source).unwrap();
        let ir = analyze(&file, "Test").unwrap();

        let cond_bindings: Vec<_> = ir
            .dependency_graph
            .bindings
            .iter()
            .filter(|b| matches!(b.kind, BindingKind::Conditional { .. }))
            .collect();
        assert_eq!(cond_bindings.len(), 1);
        assert!(cond_bindings[0].deps.contains("show"));
    }

    #[test]
    fn list_binding() {
        let source = r#"<script>
  items := $state([])
</script>
<template>
  @each items -> item {
    <li>{item}</li>
  }
</template>"#;
        let file = parse(source).unwrap();
        let ir = analyze(&file, "Test").unwrap();

        let list_bindings: Vec<_> = ir
            .dependency_graph
            .bindings
            .iter()
            .filter(|b| matches!(b.kind, BindingKind::List { .. }))
            .collect();
        assert_eq!(list_bindings.len(), 1);
        assert!(list_bindings[0].deps.contains("items"));
    }

    // -----------------------------------------------------------------------
    // Full component analysis
    // -----------------------------------------------------------------------

    #[test]
    fn full_counter_component() {
        let source = r#"<script>
  count := $state(0)
  doubled := $derived(count * 2)
  F increment() { count += 1 }

  $effect {
    console_log(count)
  }
</script>
<template>
  <button @click={increment}>{count}</button>
  <p>{doubled}</p>
</template>"#;
        let file = parse(source).unwrap();
        let ir = analyze(&file, "Counter").unwrap();

        assert_eq!(ir.name, "Counter");
        assert!(ir.has_reactivity);
        assert_eq!(ir.dependency_graph.state_vars.len(), 1);
        assert_eq!(ir.dependency_graph.derived_vars.len(), 1);
        assert_eq!(ir.dependency_graph.effects.len(), 1);
        assert!(!ir.dependency_graph.bindings.is_empty());
        assert!(!ir.functions.is_empty());
    }

    #[test]
    fn component_with_props_and_events() {
        let source = r#"<script>
  P {
    user: User
    showAvatar: bool = true
    emit select(user: User)
  }
</script>
<template>
  <p>hello</p>
</template>"#;
        let file = parse(source).unwrap();
        let ir = analyze(&file, "UserCard").unwrap();

        assert_eq!(ir.name, "UserCard");
        let props = ir.props.unwrap();
        assert_eq!(props.fields.len(), 2);
        assert_eq!(ir.events.len(), 1);
        assert_eq!(ir.events[0].name, "select");
    }

    #[test]
    fn empty_component() {
        let file = parse("").unwrap();
        let ir = analyze(&file, "Empty").unwrap();
        assert_eq!(ir.name, "Empty");
        assert!(!ir.has_reactivity);
        assert!(ir.props.is_none());
        assert!(ir.events.is_empty());
    }

    // -----------------------------------------------------------------------
    // Helper tests
    // -----------------------------------------------------------------------

    #[test]
    fn identifier_referenced_basic() {
        assert!(is_identifier_referenced("count + 1", "count"));
        assert!(!is_identifier_referenced("accounting", "count"));
        assert!(!is_identifier_referenced("my_count", "count"));
        assert!(is_identifier_referenced("a + count", "count"));
        assert!(is_identifier_referenced("count", "count"));
    }

    #[test]
    fn identifier_not_in_string_literal() {
        // Note: our simple identifier check doesn't parse strings,
        // so it will find "count" inside string literals.
        // This is acceptable for now — the compiler errs on the side of
        // tracking extra dependencies rather than missing real ones.
        assert!(is_identifier_referenced("\"count\"", "count"));
    }

    #[test]
    fn parse_state_decl_basic() {
        let (name, init) = parse_state_decl("count := __vx_state(0)").unwrap();
        assert_eq!(name, "count");
        assert_eq!(init, "0");
    }

    #[test]
    fn parse_state_decl_string() {
        let (name, init) = parse_state_decl("name := __vx_state(\"hello\")").unwrap();
        assert_eq!(name, "name");
        assert_eq!(init, "\"hello\"");
    }

    #[test]
    fn parse_derived_decl_basic() {
        let (name, expr) =
            parse_derived_decl("doubled := __vx_derived(|| { count * 2 })").unwrap();
        assert_eq!(name, "doubled");
        assert_eq!(expr, "count * 2");
    }

    #[test]
    fn parse_state_decl_not_state() {
        assert!(parse_state_decl("x := foo(1)").is_none());
        assert!(parse_state_decl("x = __vx_state(1)").is_none()); // not :=
    }
}

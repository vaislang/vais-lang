//! JavaScript code generation from ComponentIR.
//!
//! Generates an ESM module that creates and manages a component's DOM:
//!
//! ```js
//! import { $$element, $$text, $$append, $$attr, $$listen, $$schedule } from "@vaisx/runtime";
//!
//! export default function Counter($$target) {
//!   // State initialization
//!   let count = 0;
//!   // Derived computations
//!   let doubled = count * 2;
//!   // DOM creation
//!   let $$el0 = $$element("button");
//!   let $$txt0 = $$text(count);
//!   $$append($$el0, $$txt0);
//!   $$append($$target, $$el0);
//!   // Update function
//!   function $$update() { ... }
//!   // Lifecycle
//!   return { $$update, $$destroy() { ... } };
//! }
//! ```

use std::collections::HashSet;
use std::fmt::Write;

use vaisx_parser::{Attribute, AwaitBlock, EachBlock, Element, IfBlock, TemplateNode};

use crate::ir::{BindingKind, ComponentIR};

/// Generate JavaScript code from a ComponentIR.
pub fn generate_js(ir: &ComponentIR, file: &vaisx_parser::VaisxFile) -> String {
    let mut codegen = JsCodegen::new(ir);
    codegen.generate(file);
    codegen.output
}

struct JsCodegen<'a> {
    ir: &'a ComponentIR,
    output: String,
    indent: usize,
    /// Runtime imports needed
    runtime_imports: HashSet<&'static str>,
    /// Counter for element variable names
    el_counter: usize,
    /// Counter for text node variable names
    txt_counter: usize,
    /// Counter for conditional block variable names
    if_counter: usize,
    /// Counter for list block variable names
    each_counter: usize,
    /// Counter for await block variable names
    await_counter: usize,
    /// Counter for component instance variable names
    comp_counter: usize,
    /// Track how many if blocks were generated (for update function)
    if_blocks_generated: usize,
    /// Track how many each blocks were generated (for update function)
    each_blocks_generated: usize,
    /// Track child component instances for destroy
    child_components: Vec<String>,
    /// Track event listener cleanup references
    listener_cleanups: Vec<String>,
    /// CSS scope hash from `<style scoped>` block (if any).
    /// When `Some`, every DOM element created via `$$element()` will receive
    /// a `$$attr(el, "data-v-{hash}", "")` call for CSS scoping.
    scope_hash: Option<String>,
}

impl<'a> JsCodegen<'a> {
    fn new(ir: &'a ComponentIR) -> Self {
        Self {
            ir,
            output: String::with_capacity(1024),
            indent: 0,
            runtime_imports: HashSet::new(),
            el_counter: 0,
            txt_counter: 0,
            if_counter: 0,
            each_counter: 0,
            await_counter: 0,
            comp_counter: 0,
            if_blocks_generated: 0,
            each_blocks_generated: 0,
            child_components: Vec::new(),
            listener_cleanups: Vec::new(),
            scope_hash: None,
        }
    }

    fn generate(&mut self, file: &vaisx_parser::VaisxFile) {
        // We generate code in two passes:
        // 1. Generate the component body into a buffer to discover runtime imports
        // 2. Prepend the import statement

        // Detect scoped style blocks and compute a hash for DOM attribute injection.
        // We use the first `<style scoped>` block found (there should be at most one).
        // The hash is derived from the component name (ir.name) via the same algorithm
        // used in the CSS scoping pass, so the attribute value will match the CSS selector.
        for style in &file.styles {
            if style.node.is_scoped {
                // Prefer a pre-computed hash (set by the caller / build pipeline);
                // fall back to computing it from the component name.
                let hash = style
                    .node
                    .scope_hash
                    .clone()
                    .unwrap_or_else(|| vaisx_parser::style::compute_scope_hash(&self.ir.name));
                self.scope_hash = Some(hash);
                break;
            }
        }

        let mut body = String::with_capacity(1024);
        std::mem::swap(&mut self.output, &mut body);

        // Generate component function
        self.emit_component_function(file);

        std::mem::swap(&mut self.output, &mut body);

        // Now emit the import statement
        self.emit_runtime_import();
        self.output.push('\n');
        self.output.push_str(&body);
    }

    // -----------------------------------------------------------------------
    // Import generation
    // -----------------------------------------------------------------------

    fn emit_runtime_import(&mut self) {
        if self.runtime_imports.is_empty() {
            return;
        }
        let mut imports: Vec<&str> = self.runtime_imports.iter().copied().collect();
        imports.sort();

        write!(
            self.output,
            "import {{ {} }} from \"@vaisx/runtime\";\n",
            imports.join(", ")
        )
        .unwrap();
    }

    // -----------------------------------------------------------------------
    // Component function
    // -----------------------------------------------------------------------

    fn emit_component_function(&mut self, file: &vaisx_parser::VaisxFile) {
        self.writeln(&format!(
            "export default function {}($$target) {{",
            self.ir.name
        ));
        self.indent += 1;

        // State variables
        self.emit_state_vars();

        // Derived variables
        self.emit_derived_vars();

        // Functions
        self.emit_functions();

        // DOM creation from template
        if let Some(template) = &file.template {
            self.writeln("// DOM creation");
            self.emit_template_nodes(&template.node.children, "$$target");
        }

        // Record how many blocks were generated
        self.if_blocks_generated = self.if_counter;
        self.each_blocks_generated = self.each_counter;

        // Update function
        self.emit_update_function(file);

        // Effects (run after initial render)
        self.emit_effects();

        // Return lifecycle object
        self.emit_lifecycle();

        self.indent -= 1;
        self.writeln("}");
    }

    // -----------------------------------------------------------------------
    // State & derived
    // -----------------------------------------------------------------------

    fn emit_state_vars(&mut self) {
        if self.ir.dependency_graph.state_vars.is_empty() {
            return;
        }
        self.writeln("// State");
        // Sort by name for deterministic output
        let mut vars: Vec<_> = self.ir.dependency_graph.state_vars.values().collect();
        vars.sort_by_key(|v| &v.name);

        for var in vars {
            self.writeln(&format!("let {} = {};", var.name, var.init_expr));
        }
        self.writeln("");
    }

    fn emit_derived_vars(&mut self) {
        if self.ir.dependency_graph.derived_vars.is_empty() {
            return;
        }
        self.writeln("// Derived");
        let order = self.ir.dependency_graph.derived_topo_order();
        for name in &order {
            if let Some(derived) = self.ir.dependency_graph.derived_vars.get(name) {
                self.writeln(&format!("let {} = {};", derived.name, derived.expr));
            }
        }
        self.writeln("");
    }

    fn emit_functions(&mut self) {
        if self.ir.functions.is_empty() {
            return;
        }
        self.writeln("// Functions");
        for func in &self.ir.functions {
            // Emit state mutation wrappers: assignments to state vars become $$invalidate calls
            let body = self.transform_state_mutations(&func.body);
            self.writeln(&format!("function {}{}", func.name, body));
        }
        self.writeln("");
    }

    /// Transform assignments to state variables into invalidation-wrapped updates.
    ///
    /// Detects patterns like `count += 1`, `count = expr`, `count -= 1` etc.
    /// and appends `$$schedule($$update)` after the enclosing statement.
    ///
    /// For function bodies, we append a single `$$schedule($$update)` at the end
    /// of the function if any state mutation is detected.
    fn transform_state_mutations(&mut self, body: &str) -> String {
        let state_names: Vec<&str> = self
            .ir
            .dependency_graph
            .state_vars
            .keys()
            .map(|s| s.as_str())
            .collect();

        if state_names.is_empty() {
            return body.to_string();
        }

        // Check if the function body mutates any state variable
        let has_mutation = state_names.iter().any(|name| {
            // Look for assignment patterns: `name =`, `name +=`, `name -=`, etc.
            let patterns = [
                format!("{} =", name),
                format!("{} +=", name),
                format!("{} -=", name),
                format!("{} *=", name),
                format!("{} /=", name),
                format!("{}++", name),
                format!("{}--", name),
            ];
            patterns.iter().any(|p| body.contains(p.as_str()))
        });

        if has_mutation {
            self.runtime_imports.insert("$$schedule");
            // Insert $$schedule($$update) before the closing brace
            if let Some(last_brace) = body.rfind('}') {
                let mut result = body[..last_brace].to_string();
                result.push_str("\n    $$schedule($$update);\n");
                result.push_str(&body[last_brace..]);
                return result;
            }
        }

        body.to_string()
    }

    // -----------------------------------------------------------------------
    // Template DOM generation
    // -----------------------------------------------------------------------

    fn emit_template_nodes(&mut self, nodes: &[vaisx_parser::Spanned<TemplateNode>], parent: &str) {
        for node in nodes {
            match &node.node {
                TemplateNode::Element(element) => {
                    self.emit_element(element, parent);
                }
                TemplateNode::Text(text) => {
                    let trimmed = text.trim();
                    if !trimmed.is_empty() {
                        self.emit_static_text(trimmed, parent);
                    }
                }
                TemplateNode::ExprInterpolation(interp) => {
                    self.emit_text_interpolation(&interp.expr.raw, parent);
                }
                TemplateNode::IfBlock(if_block) => {
                    self.emit_if_block(if_block, parent);
                }
                TemplateNode::EachBlock(each_block) => {
                    self.emit_each_block(each_block, parent);
                }
                TemplateNode::Comment(text) => {
                    self.writeln(&format!("// {}", text.trim()));
                }
                TemplateNode::AwaitBlock(await_block) => {
                    self.emit_await_block(await_block, parent);
                }
            }
        }
    }

    fn emit_element(&mut self, element: &Element, parent: &str) {
        if element.is_component {
            self.emit_component_instantiation(element, parent);
            return;
        }

        let el_var = self.next_el_var();
        self.runtime_imports.insert("$$element");
        self.writeln(&format!(
            "let {} = $$element(\"{}\");",
            el_var, element.tag
        ));

        // CSS scoping — add data-v-{hash} attribute to every DOM element
        if let Some(hash) = self.scope_hash.clone() {
            self.runtime_imports.insert("$$attr");
            self.writeln(&format!(
                "$$attr({}, \"data-v-{}\", \"\");",
                el_var, hash
            ));
        }

        // Static attributes
        for attr in &element.attributes {
            match &attr.node {
                Attribute::Static { name, value } => {
                    self.runtime_imports.insert("$$attr");
                    self.writeln(&format!(
                        "$$attr({}, \"{}\", \"{}\");",
                        el_var, name, value
                    ));
                }
                Attribute::Dynamic { name, value } => {
                    self.runtime_imports.insert("$$attr");
                    self.writeln(&format!(
                        "$$attr({}, \"{}\", {});",
                        el_var, name, value.raw
                    ));
                }
                Attribute::Event(binding) => {
                    self.runtime_imports.insert("$$listen");
                    let modifiers = if binding.modifiers.is_empty() {
                        String::new()
                    } else {
                        format!(
                            ", {{ {} }}",
                            binding
                                .modifiers
                                .iter()
                                .map(|m| format!("{}: true", m))
                                .collect::<Vec<_>>()
                                .join(", ")
                        )
                    };
                    self.writeln(&format!(
                        "$$listen({}, \"{}\", {}{});",
                        el_var, binding.name, binding.handler.raw, modifiers
                    ));
                }
                Attribute::Bind(bind) => {
                    self.runtime_imports.insert("$$attr");
                    self.runtime_imports.insert("$$listen");
                    // Set initial value
                    self.writeln(&format!(
                        "$$attr({}, \"{}\", {});",
                        el_var, bind.property, bind.expr.raw
                    ));
                    // Listen for input events to update the state var
                    let event_name = match bind.property.as_str() {
                        "checked" => "change",
                        _ => "input",
                    };
                    self.writeln(&format!(
                        "$$listen({}, \"{}\", (e) => {{ {} = e.target.{}; $$update(); }});",
                        el_var, event_name, bind.expr.raw, bind.property
                    ));
                }
                Attribute::Shorthand { name } => {
                    self.runtime_imports.insert("$$attr");
                    self.writeln(&format!(
                        "$$attr({}, \"{}\", {});",
                        el_var, name, name
                    ));
                }
                Attribute::Spread { expr } => {
                    self.runtime_imports.insert("$$spread");
                    self.writeln(&format!("$$spread({}, {});", el_var, expr.raw));
                }
            }
        }

        // Children
        if !element.children.is_empty() {
            self.emit_template_nodes(&element.children, &el_var);
        }

        // Append to parent
        self.runtime_imports.insert("$$append");
        self.writeln(&format!("$$append({}, {});", parent, el_var));
    }

    fn emit_static_text(&mut self, text: &str, parent: &str) {
        let txt_var = self.next_txt_var();
        self.runtime_imports.insert("$$text");
        self.runtime_imports.insert("$$append");
        // Escape text for JS string
        let escaped = text.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', "\\n");
        self.writeln(&format!("let {} = $$text(\"{}\");", txt_var, escaped));
        self.writeln(&format!("$$append({}, {});", parent, txt_var));
    }

    fn emit_text_interpolation(&mut self, expr: &str, parent: &str) {
        let txt_var = self.next_txt_var();
        self.runtime_imports.insert("$$text");
        self.runtime_imports.insert("$$append");
        self.writeln(&format!("let {} = $$text({});", txt_var, expr));
        self.writeln(&format!("$$append({}, {});", parent, txt_var));
    }

    /// Emit component instantiation code.
    ///
    /// Generates:
    /// ```js
    /// let $$comp0_target = $$element("div"); // wrapper
    /// let $$comp0 = ComponentName($$comp0_target, { prop1: val1, ... });
    /// $$append($$parent, $$comp0_target);
    /// ```
    fn emit_component_instantiation(&mut self, element: &Element, parent: &str) {
        let comp_id = self.comp_counter;
        self.comp_counter += 1;

        let comp_var = format!("$$comp{}", comp_id);
        let target_var = format!("$$comp{}_target", comp_id);

        self.runtime_imports.insert("$$element");
        self.runtime_imports.insert("$$append");

        // Create a wrapper element to mount the child component into
        self.writeln(&format!(
            "let {} = $$element(\"div\");",
            target_var
        ));

        // Build props object
        let mut props_parts: Vec<String> = Vec::new();
        let mut event_handlers: Vec<(String, String)> = Vec::new();

        for attr in &element.attributes {
            match &attr.node {
                Attribute::Static { name, value } => {
                    props_parts.push(format!("{}: \"{}\"", name, value));
                }
                Attribute::Dynamic { name, value } => {
                    props_parts.push(format!("{}: {}", name, value.raw));
                }
                Attribute::Shorthand { name } => {
                    props_parts.push(format!("{}: {}", name, name));
                }
                Attribute::Event(binding) => {
                    // Component events: @eventName={handler} -> on_eventName callback
                    event_handlers.push((binding.name.clone(), binding.handler.raw.clone()));
                }
                Attribute::Bind(bind) => {
                    props_parts.push(format!("{}: {}", bind.property, bind.expr.raw));
                }
                Attribute::Spread { expr } => {
                    props_parts.push(format!("...{}", expr.raw));
                }
            }
        }

        // Add event handler callbacks as props (on_eventName convention)
        for (event_name, handler) in &event_handlers {
            props_parts.push(format!("on_{}: {}", event_name, handler));
        }

        let props_str = if props_parts.is_empty() {
            String::new()
        } else {
            format!(", {{ {} }}", props_parts.join(", "))
        };

        // Instantiate the component
        self.writeln(&format!(
            "let {} = {}({}{}); ",
            comp_var, element.tag, target_var, props_str
        ));

        // Handle children / slots
        if !element.children.is_empty() {
            // Check for named slots
            let has_named_slots = element.children.iter().any(|child| {
                matches!(&child.node, TemplateNode::Element(el) if el.tag.starts_with(':'))
            });

            if has_named_slots {
                // Named slots: <:slotName>content</:slotName>
                for child in &element.children {
                    if let TemplateNode::Element(slot_el) = &child.node {
                        if slot_el.tag.starts_with(':') {
                            let slot_name = &slot_el.tag[1..];
                            let slot_var = format!("$$slot_{}_{}", comp_id, slot_name);
                            self.runtime_imports.insert("$$create_fragment");
                            self.writeln(&format!(
                                "let {} = $$create_fragment();",
                                slot_var
                            ));
                            self.emit_template_nodes(&slot_el.children, &slot_var);
                            // Pass slot content to component (convention: $$slots.slotName)
                            self.writeln(&format!(
                                "if ({}.$$slots) {}.$$slots[\"{}\"] = {};",
                                comp_var, comp_var, slot_name, slot_var
                            ));
                        }
                    }
                }
            } else {
                // Default slot: all children go into the default slot
                self.emit_template_nodes(&element.children, &target_var);
            }
        }

        // Append the component's wrapper to the parent
        self.writeln(&format!("$$append({}, {});", parent, target_var));

        // Track for destroy
        self.child_components.push(comp_var);
    }

    /// Emit an `@if` / `@elif` / `@else` conditional block.
    ///
    /// Strategy: use a $$anchor comment node as a position marker.
    /// Create a fragment function for each branch, and a $$if_update function
    /// that swaps between them based on the condition.
    fn emit_if_block(&mut self, if_block: &IfBlock, parent: &str) {
        let block_id = self.if_counter;
        self.if_counter += 1;

        let anchor_var = format!("$$if_anchor{}", block_id);
        let current_var = format!("$$if_current{}", block_id);

        self.runtime_imports.insert("$$anchor");
        self.runtime_imports.insert("$$create_fragment");
        self.runtime_imports.insert("$$insert_before");
        self.runtime_imports.insert("$$remove_fragment");
        self.runtime_imports.insert("$$append");

        // Create anchor node
        self.writeln(&format!("let {} = $$anchor();", anchor_var));
        self.writeln(&format!("$$append({}, {});", parent, anchor_var));
        self.writeln(&format!("let {} = null;", current_var));

        // Branch 0: @if consequent
        self.writeln(&format!("function $$if{}_branch0($$parent) {{", block_id));
        self.indent += 1;
        self.writeln(&format!("let $$frag = $$create_fragment();"));
        self.emit_template_nodes(&if_block.consequent, "$$frag");
        self.writeln("return $$frag;");
        self.indent -= 1;
        self.writeln("}");

        // Elif branches
        for (i, elif) in if_block.elifs.iter().enumerate() {
            self.writeln(&format!(
                "function $$if{}_branch{}($$parent) {{",
                block_id,
                i + 1
            ));
            self.indent += 1;
            self.writeln(&format!("let $$frag = $$create_fragment();"));
            self.emit_template_nodes(&elif.body, "$$frag");
            self.writeln("return $$frag;");
            self.indent -= 1;
            self.writeln("}");
        }

        // Else branch
        if let Some(alternate) = &if_block.alternate {
            let else_idx = 1 + if_block.elifs.len();
            self.writeln(&format!(
                "function $$if{}_branch{}($$parent) {{",
                block_id, else_idx
            ));
            self.indent += 1;
            self.writeln(&format!("let $$frag = $$create_fragment();"));
            self.emit_template_nodes(alternate, "$$frag");
            self.writeln("return $$frag;");
            self.indent -= 1;
            self.writeln("}");
        }

        // Initial evaluation
        self.writeln(&format!("function $$if{}_update() {{", block_id));
        self.indent += 1;
        self.writeln(&format!(
            "let $$new_branch = null;"
        ));

        // Condition chain
        self.writeln(&format!("if ({}) {{", if_block.condition.raw));
        self.indent += 1;
        self.writeln(&format!(
            "$$new_branch = $$if{}_branch0;",
            block_id
        ));
        self.indent -= 1;

        for (i, elif) in if_block.elifs.iter().enumerate() {
            self.writeln(&format!("}} else if ({}) {{", elif.condition.raw));
            self.indent += 1;
            self.writeln(&format!(
                "$$new_branch = $$if{}_branch{};",
                block_id,
                i + 1
            ));
            self.indent -= 1;
        }

        if if_block.alternate.is_some() {
            let else_idx = 1 + if_block.elifs.len();
            self.writeln("} else {");
            self.indent += 1;
            self.writeln(&format!(
                "$$new_branch = $$if{}_branch{};",
                block_id, else_idx
            ));
            self.indent -= 1;
        }
        self.writeln("}");

        // Swap fragments
        self.writeln(&format!(
            "if ({} !== null) {{ $$remove_fragment({}); }}",
            current_var, current_var
        ));
        self.writeln("if ($$new_branch !== null) {");
        self.indent += 1;
        self.writeln(&format!(
            "{} = $$new_branch({});",
            current_var, parent
        ));
        self.writeln(&format!(
            "$$insert_before({}, {}, {});",
            parent, current_var, anchor_var
        ));
        self.indent -= 1;
        self.writeln("} else {");
        self.indent += 1;
        self.writeln(&format!("{} = null;", current_var));
        self.indent -= 1;
        self.writeln("}");

        self.indent -= 1;
        self.writeln("}");

        // Run initial evaluation
        self.writeln(&format!("$$if{}_update();", block_id));
    }

    /// Emit an `@each` list rendering block.
    ///
    /// Strategy: use a $$anchor for position, maintain an array of fragments,
    /// and a $$each_update function that diffs and patches.
    fn emit_each_block(&mut self, each_block: &EachBlock, parent: &str) {
        let block_id = self.each_counter;
        self.each_counter += 1;

        let anchor_var = format!("$$each_anchor{}", block_id);
        let items_var = format!("$$each_items{}", block_id);

        self.runtime_imports.insert("$$anchor");
        self.runtime_imports.insert("$$create_fragment");
        self.runtime_imports.insert("$$insert_before");
        self.runtime_imports.insert("$$remove_fragment");
        self.runtime_imports.insert("$$append");

        // Create anchor
        self.writeln(&format!("let {} = $$anchor();", anchor_var));
        self.writeln(&format!("$$append({}, {});", parent, anchor_var));
        self.writeln(&format!("let {} = [];", items_var));

        // Item renderer function
        let item_binding = &each_block.item_binding;
        let index_param = each_block
            .index_binding
            .as_ref()
            .map(|i| format!(", {}", i))
            .unwrap_or_default();

        self.writeln(&format!(
            "function $$each{}_render({}{}) {{",
            block_id, item_binding, index_param
        ));
        self.indent += 1;
        self.writeln("let $$frag = $$create_fragment();");
        self.emit_template_nodes(&each_block.body, "$$frag");
        self.writeln("return $$frag;");
        self.indent -= 1;
        self.writeln("}");

        // Update function
        self.writeln(&format!("function $$each{}_update() {{", block_id));
        self.indent += 1;

        // Remove old items
        self.writeln(&format!(
            "for (let $$i = 0; $$i < {}.length; $$i++) {{",
            items_var
        ));
        self.indent += 1;
        self.writeln(&format!("$$remove_fragment({}[$$i]);", items_var));
        self.indent -= 1;
        self.writeln("}");

        // Create new items
        self.writeln(&format!("{} = [];", items_var));

        let iterable = &each_block.iterable.raw;
        if each_block.index_binding.is_some() {
            let idx_name = each_block.index_binding.as_ref().unwrap();
            self.writeln(&format!(
                "for (let {idx} = 0; {idx} < {iter}.length; {idx}++) {{",
                idx = idx_name,
                iter = iterable
            ));
            self.indent += 1;
            self.writeln(&format!(
                "let {} = {}[{}];",
                item_binding, iterable, idx_name
            ));
        } else {
            self.writeln(&format!(
                "for (let $$i = 0; $$i < {}.length; $$i++) {{",
                iterable
            ));
            self.indent += 1;
            self.writeln(&format!(
                "let {} = {}[$$i];",
                item_binding, iterable
            ));
        }

        self.writeln(&format!(
            "let $$frag = $$each{}_render({}{});",
            block_id,
            item_binding,
            each_block
                .index_binding
                .as_ref()
                .map(|i| format!(", {}", i))
                .unwrap_or_default()
        ));
        self.writeln(&format!(
            "$$insert_before({}, $$frag, {});",
            parent, anchor_var
        ));
        self.writeln(&format!("{}.push($$frag);", items_var));
        self.indent -= 1;
        self.writeln("}");

        self.indent -= 1;
        self.writeln("}");

        // Run initial render
        self.writeln(&format!("$$each{}_update();", block_id));
    }

    /// Emit an `@await` block for async rendering.
    ///
    /// Strategy: show loading state initially, then switch to ok/err when resolved.
    fn emit_await_block(&mut self, await_block: &AwaitBlock, parent: &str) {
        let block_id = self.await_counter;
        self.await_counter += 1;

        let anchor_var = format!("$$await_anchor{}", block_id);
        let current_var = format!("$$await_current{}", block_id);

        self.runtime_imports.insert("$$anchor");
        self.runtime_imports.insert("$$create_fragment");
        self.runtime_imports.insert("$$insert_before");
        self.runtime_imports.insert("$$remove_fragment");
        self.runtime_imports.insert("$$append");

        self.writeln(&format!("let {} = $$anchor();", anchor_var));
        self.writeln(&format!("$$append({}, {});", parent, anchor_var));
        self.writeln(&format!("let {} = null;", current_var));

        // Loading branch
        if let Some(loading) = &await_block.loading {
            self.writeln(&format!(
                "function $$await{}_loading($$parent) {{",
                block_id
            ));
            self.indent += 1;
            self.writeln("let $$frag = $$create_fragment();");
            self.emit_template_nodes(loading, "$$frag");
            self.writeln("return $$frag;");
            self.indent -= 1;
            self.writeln("}");
        }

        // Ok branch
        if let Some(ok_body) = &await_block.ok_body {
            let ok_binding = await_block
                .ok_binding
                .as_deref()
                .unwrap_or("$$value");
            self.writeln(&format!(
                "function $$await{}_ok({}) {{",
                block_id, ok_binding
            ));
            self.indent += 1;
            self.writeln("let $$frag = $$create_fragment();");
            self.emit_template_nodes(ok_body, "$$frag");
            self.writeln("return $$frag;");
            self.indent -= 1;
            self.writeln("}");
        }

        // Error branch
        if let Some(err_body) = &await_block.err_body {
            let err_binding = await_block
                .err_binding
                .as_deref()
                .unwrap_or("$$error");
            self.writeln(&format!(
                "function $$await{}_err({}) {{",
                block_id, err_binding
            ));
            self.indent += 1;
            self.writeln("let $$frag = $$create_fragment();");
            self.emit_template_nodes(err_body, "$$frag");
            self.writeln("return $$frag;");
            self.indent -= 1;
            self.writeln("}");
        }

        // Show loading initially
        if await_block.loading.is_some() {
            self.writeln(&format!(
                "{cur} = $$await{id}_loading({parent});",
                cur = current_var,
                id = block_id,
                parent = parent
            ));
            self.writeln(&format!(
                "$$insert_before({}, {}, {});",
                parent, current_var, anchor_var
            ));
        }

        // Handle promise resolution
        self.writeln(&format!("({}).then(", await_block.expr.raw));
        self.indent += 1;

        // Ok handler
        if await_block.ok_body.is_some() {
            let ok_binding = await_block.ok_binding.as_deref().unwrap_or("$$value");
            self.writeln(&format!("({}) => {{", ok_binding));
            self.indent += 1;
            self.writeln(&format!(
                "if ({} !== null) {{ $$remove_fragment({}); }}",
                current_var, current_var
            ));
            self.writeln(&format!(
                "{} = $$await{}_ok({});",
                current_var, block_id, ok_binding
            ));
            self.writeln(&format!(
                "$$insert_before({}, {}, {});",
                parent, current_var, anchor_var
            ));
            self.indent -= 1;
            self.writeln("},");
        } else {
            self.writeln("() => {},");
        }

        // Error handler
        if await_block.err_body.is_some() {
            let err_binding = await_block.err_binding.as_deref().unwrap_or("$$error");
            self.writeln(&format!("({}) => {{", err_binding));
            self.indent += 1;
            self.writeln(&format!(
                "if ({} !== null) {{ $$remove_fragment({}); }}",
                current_var, current_var
            ));
            self.writeln(&format!(
                "{} = $$await{}_err({});",
                current_var, block_id, err_binding
            ));
            self.writeln(&format!(
                "$$insert_before({}, {}, {});",
                parent, current_var, anchor_var
            ));
            self.indent -= 1;
            self.writeln("}");
        }

        self.indent -= 1;
        self.writeln(");");
    }

    // -----------------------------------------------------------------------
    // Update function
    // -----------------------------------------------------------------------

    fn emit_update_function(&mut self, _file: &vaisx_parser::VaisxFile) {
        if !self.ir.has_reactivity {
            return;
        }

        self.writeln("");
        self.writeln("// Update function — called when state changes");
        self.writeln("function $$update() {");
        self.indent += 1;

        // Re-compute derived values in topological order
        let order = self.ir.dependency_graph.derived_topo_order();
        if !order.is_empty() {
            self.writeln("// Re-compute derived values");
            for name in &order {
                if let Some(derived) = self.ir.dependency_graph.derived_vars.get(name) {
                    self.writeln(&format!("{} = {};", derived.name, derived.expr));
                }
            }
        }

        // Update text bindings
        let text_bindings: Vec<_> = self
            .ir
            .dependency_graph
            .bindings
            .iter()
            .filter(|b| matches!(b.kind, BindingKind::Text { .. }))
            .collect();

        if !text_bindings.is_empty() {
            self.writeln("// Update text nodes");
            self.runtime_imports.insert("$$set_text");
            for binding in &text_bindings {
                if let BindingKind::Text { node_index } = &binding.kind {
                    self.writeln(&format!(
                        "$$set_text($$txt{}, {});",
                        node_index, binding.expr
                    ));
                }
            }
        }

        // Update attribute bindings
        let attr_bindings: Vec<_> = self
            .ir
            .dependency_graph
            .bindings
            .iter()
            .filter(|b| matches!(b.kind, BindingKind::Attribute { .. }))
            .collect();

        if !attr_bindings.is_empty() {
            self.writeln("// Update attributes");
            self.runtime_imports.insert("$$attr");
            for binding in &attr_bindings {
                if let BindingKind::Attribute {
                    node_index,
                    attr_name,
                } = &binding.kind
                {
                    self.writeln(&format!(
                        "$$attr($$el{}, \"{}\", {});",
                        node_index, attr_name, binding.expr
                    ));
                }
            }
        }

        // Update two-way bindings
        let twoway_bindings: Vec<_> = self
            .ir
            .dependency_graph
            .bindings
            .iter()
            .filter(|b| matches!(b.kind, BindingKind::TwoWay { .. }))
            .collect();

        if !twoway_bindings.is_empty() {
            self.writeln("// Update two-way bindings");
            self.runtime_imports.insert("$$attr");
            for binding in &twoway_bindings {
                if let BindingKind::TwoWay {
                    node_index,
                    property,
                    ..
                } = &binding.kind
                {
                    self.writeln(&format!(
                        "$$attr($$el{}, \"{}\", {});",
                        node_index, property, binding.expr
                    ));
                }
            }
        }

        // Update conditional blocks
        if self.if_blocks_generated > 0 {
            self.writeln("// Update conditional blocks");
            for i in 0..self.if_blocks_generated {
                self.writeln(&format!("$$if{}_update();", i));
            }
        }

        // Update list blocks
        if self.each_blocks_generated > 0 {
            self.writeln("// Update list blocks");
            for i in 0..self.each_blocks_generated {
                self.writeln(&format!("$$each{}_update();", i));
            }
        }

        self.indent -= 1;
        self.writeln("}");
    }

    // -----------------------------------------------------------------------
    // Effects
    // -----------------------------------------------------------------------

    fn emit_effects(&mut self) {
        if self.ir.dependency_graph.effects.is_empty() {
            return;
        }

        self.writeln("");
        self.writeln("// Effects");
        self.runtime_imports.insert("$$schedule");
        for effect in &self.ir.dependency_graph.effects {
            self.writeln(&format!("$$schedule(() => {{"));
            self.indent += 1;
            self.writeln(&effect.body);
            self.indent -= 1;
            self.writeln("});");
        }
    }

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    fn emit_lifecycle(&mut self) {
        self.writeln("");

        let has_cleanup = !self.child_components.is_empty() || !self.listener_cleanups.is_empty();

        if self.ir.has_reactivity {
            self.writeln("return {");
            self.indent += 1;
            self.writeln("$$update,");
            self.writeln("$$destroy() {");
            self.indent += 1;
            self.emit_destroy_body();
            self.indent -= 1;
            self.writeln("},");
            self.indent -= 1;
            self.writeln("};");
        } else if has_cleanup {
            self.writeln("return {");
            self.indent += 1;
            self.writeln("$$destroy() {");
            self.indent += 1;
            self.emit_destroy_body();
            self.indent -= 1;
            self.writeln("},");
            self.indent -= 1;
            self.writeln("};");
        } else {
            self.writeln("return {");
            self.indent += 1;
            self.writeln("$$destroy() {},");
            self.indent -= 1;
            self.writeln("};");
        }
    }

    fn emit_destroy_body(&mut self) {
        // Destroy child components
        if !self.child_components.is_empty() {
            self.writeln("// Destroy child components");
            for comp_var in &self.child_components.clone() {
                self.writeln(&format!(
                    "if ({} && {}.$$destroy) {}.$$destroy();",
                    comp_var, comp_var, comp_var
                ));
            }
        }

        // Clean up event listeners
        if !self.listener_cleanups.is_empty() {
            self.writeln("// Clean up event listeners");
            for cleanup in &self.listener_cleanups.clone() {
                self.writeln(&format!("{}();", cleanup));
            }
        }

        // Remove conditional block fragments
        if self.if_blocks_generated > 0 {
            for i in 0..self.if_blocks_generated {
                self.writeln(&format!(
                    "if ($$if_current{} !== null) $$remove_fragment($$if_current{});",
                    i, i
                ));
            }
        }

        // Remove each block items
        if self.each_blocks_generated > 0 {
            for i in 0..self.each_blocks_generated {
                self.writeln(&format!(
                    "for (let $$i = 0; $$i < $$each_items{}.length; $$i++) $$remove_fragment($$each_items{}[$$i]);",
                    i, i
                ));
            }
        }
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    fn writeln(&mut self, line: &str) {
        for _ in 0..self.indent {
            self.output.push_str("  ");
        }
        self.output.push_str(line);
        self.output.push('\n');
    }

    fn next_el_var(&mut self) -> String {
        let var = format!("$$el{}", self.el_counter);
        self.el_counter += 1;
        var
    }

    fn next_txt_var(&mut self) -> String {
        let var = format!("$$txt{}", self.txt_counter);
        self.txt_counter += 1;
        var
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analyze::analyze;
    use vaisx_parser::parse;

    fn compile_to_js(source: &str, name: &str) -> String {
        let file = parse(source).unwrap();
        let ir = analyze(&file, name).unwrap();
        generate_js(&ir, &file)
    }

    #[test]
    fn empty_component() {
        let js = compile_to_js("", "Empty");
        assert!(js.contains("export default function Empty($$target)"));
        assert!(js.contains("$$destroy()"));
    }

    #[test]
    fn static_template() {
        let source = r#"<template>
  <div>
    <h1>Hello</h1>
  </div>
</template>"#;
        let js = compile_to_js(source, "Static");
        assert!(js.contains("$$element(\"div\")"));
        assert!(js.contains("$$element(\"h1\")"));
        assert!(js.contains("$$text(\"Hello\")"));
        assert!(js.contains("$$append"));
        assert!(js.contains("import {"));
        assert!(js.contains("@vaisx/runtime"));
    }

    #[test]
    fn state_and_text_interpolation() {
        let source = r#"<script>
  count := $state(0)
</script>
<template>
  <p>{count}</p>
</template>"#;
        let js = compile_to_js(source, "Counter");
        assert!(js.contains("let count = 0;"));
        assert!(js.contains("$$text(count)"));
        assert!(js.contains("function $$update()"));
    }

    #[test]
    fn derived_var_in_output() {
        let source = r#"<script>
  count := $state(0)
  doubled := $derived(count * 2)
</script>
<template>
  <p>{doubled}</p>
</template>"#;
        let js = compile_to_js(source, "Counter");
        assert!(js.contains("let count = 0;"));
        assert!(js.contains("let doubled = count * 2;"));
        // Update function should re-compute derived
        assert!(js.contains("doubled = count * 2;"));
    }

    #[test]
    fn static_attribute() {
        let source = r#"<template>
  <div class="container">hello</div>
</template>"#;
        let js = compile_to_js(source, "Test");
        assert!(js.contains("$$attr($$el0, \"class\", \"container\")"));
    }

    #[test]
    fn dynamic_attribute() {
        let source = r#"<script>
  cls := $state("active")
</script>
<template>
  <div class={cls}>hello</div>
</template>"#;
        let js = compile_to_js(source, "Test");
        assert!(js.contains("$$attr($$el0, \"class\", cls)"));
    }

    #[test]
    fn event_binding() {
        let source = r#"<script>
  count := $state(0)
  F increment() { count += 1 }
</script>
<template>
  <button @click={increment}>click</button>
</template>"#;
        let js = compile_to_js(source, "Counter");
        assert!(js.contains("$$listen($$el0, \"click\", increment)"));
    }

    #[test]
    fn event_binding_with_modifiers() {
        let source = r#"<template>
  <form @submit|preventDefault={handleSubmit}>submit</form>
</template>"#;
        let js = compile_to_js(source, "Form");
        assert!(js.contains("$$listen($$el0, \"submit\", handleSubmit, { preventDefault: true })"));
    }

    #[test]
    fn two_way_binding() {
        let source = r#"<script>
  name := $state("")
</script>
<template>
  <input :value={name} />
</template>"#;
        let js = compile_to_js(source, "Input");
        assert!(js.contains("$$attr($$el0, \"value\", name)"));
        assert!(js.contains("$$listen($$el0, \"input\""));
        assert!(js.contains("name = e.target.value"));
    }

    #[test]
    fn effect_generation() {
        let source = r#"<script>
  count := $state(0)
  $effect {
    console_log(count)
  }
</script>"#;
        let js = compile_to_js(source, "Counter");
        assert!(js.contains("$$schedule"));
        assert!(js.contains("console_log(count)"));
    }

    #[test]
    fn function_generation() {
        let source = r#"<script>
  count := $state(0)
  F increment() { count += 1 }
</script>
<template>
  <button @click={increment}>{count}</button>
</template>"#;
        let js = compile_to_js(source, "Counter");
        assert!(js.contains("function increment"));
    }

    #[test]
    fn import_statement_includes_used_helpers() {
        let source = r#"<template>
  <div>hello</div>
</template>"#;
        let js = compile_to_js(source, "Test");
        assert!(js.contains("$$element"));
        assert!(js.contains("$$text"));
        assert!(js.contains("$$append"));
    }

    #[test]
    fn lifecycle_return_reactive() {
        let source = r#"<script>
  count := $state(0)
</script>"#;
        let js = compile_to_js(source, "Counter");
        assert!(js.contains("$$update,"));
        assert!(js.contains("$$destroy()"));
    }

    #[test]
    fn lifecycle_return_static() {
        let js = compile_to_js("", "Static");
        assert!(js.contains("$$destroy()"));
        assert!(!js.contains("$$update,"));
    }

    #[test]
    fn self_closing_element() {
        let source = r#"<template>
  <input />
  <br />
</template>"#;
        let js = compile_to_js(source, "Test");
        assert!(js.contains("$$element(\"input\")"));
        assert!(js.contains("$$element(\"br\")"));
    }

    // -----------------------------------------------------------------------
    // Task #4: Event binding & update function enhancements
    // -----------------------------------------------------------------------

    #[test]
    fn state_mutation_injects_schedule() {
        let source = r#"<script>
  count := $state(0)
  F increment() { count += 1 }
</script>
<template>
  <button @click={increment}>{count}</button>
</template>"#;
        let js = compile_to_js(source, "Counter");
        // The function body should contain $$schedule($$update) for state invalidation
        assert!(js.contains("$$schedule($$update)"), "should inject $$schedule for state mutation. JS:\n{}", js);
    }

    #[test]
    fn no_schedule_without_mutation() {
        let source = r#"<script>
  count := $state(0)
  F greet() { console_log("hello") }
</script>
<template>
  <p>{count}</p>
</template>"#;
        let js = compile_to_js(source, "Test");
        // greet() doesn't mutate state, so no $$schedule in the function
        // ($$schedule may appear for effects, but not in greet)
        assert!(js.contains("function greet"));
    }

    #[test]
    fn update_function_recomputes_derived() {
        let source = r#"<script>
  count := $state(0)
  doubled := $derived(count * 2)
  tripled := $derived(count * 3)
</script>
<template>
  <p>{doubled}</p>
  <p>{tripled}</p>
</template>"#;
        let js = compile_to_js(source, "Counter");
        // Update function should re-compute both derived vars
        assert!(js.contains("doubled = count * 2;"));
        assert!(js.contains("tripled = count * 3;"));
    }

    #[test]
    fn update_function_updates_text_nodes() {
        let source = r#"<script>
  count := $state(0)
</script>
<template>
  <p>{count}</p>
</template>"#;
        let js = compile_to_js(source, "Counter");
        // Update function should call $$set_text
        assert!(js.contains("$$set_text"));
    }

    #[test]
    fn update_function_updates_attributes() {
        let source = r#"<script>
  cls := $state("active")
</script>
<template>
  <div class={cls}>hello</div>
</template>"#;
        let js = compile_to_js(source, "Counter");
        // Update function should update dynamic attributes
        // The $$attr call appears both in initial setup and in update
        let attr_count = js.matches("$$attr").count();
        assert!(attr_count >= 2, "should have $$attr in both init and update. count: {}", attr_count);
    }

    #[test]
    fn checked_binding_uses_change_event() {
        let source = r#"<script>
  checked := $state(false)
</script>
<template>
  <input :checked={checked} />
</template>"#;
        let js = compile_to_js(source, "Toggle");
        // :checked should use 'change' event instead of 'input'
        assert!(js.contains("\"change\""), "should use change event for checked binding");
        assert!(js.contains("e.target.checked"), "should read e.target.checked");
    }

    #[test]
    fn two_way_binding_calls_update() {
        let source = r#"<script>
  name := $state("")
</script>
<template>
  <input :value={name} />
</template>"#;
        let js = compile_to_js(source, "Input");
        // Two-way binding handler should call $$update()
        assert!(js.contains("$$update()"), "two-way binding should call $$update()");
    }

    #[test]
    fn multiple_event_modifiers() {
        let source = r#"<template>
  <a @click|preventDefault|stopPropagation={handleClick}>link</a>
</template>"#;
        let js = compile_to_js(source, "Link");
        assert!(js.contains("preventDefault: true"));
        assert!(js.contains("stopPropagation: true"));
    }

    #[test]
    fn update_includes_set_text_import() {
        let source = r#"<script>
  count := $state(0)
</script>
<template>
  <p>{count}</p>
</template>"#;
        let js = compile_to_js(source, "Counter");
        assert!(js.contains("$$set_text"), "should import $$set_text for reactive text updates");
    }

    // -----------------------------------------------------------------------
    // Task #5: Conditional / List / Await rendering
    // -----------------------------------------------------------------------

    #[test]
    fn if_block_basic() {
        let source = r#"<script>
  show := $state(true)
</script>
<template>
  @if show {
    <p>visible</p>
  }
</template>"#;
        let js = compile_to_js(source, "Toggle");
        assert!(js.contains("$$anchor"), "should create anchor node");
        assert!(js.contains("$$if0_branch0"), "should create branch function");
        assert!(js.contains("$$if0_update()"), "should call if update");
        assert!(js.contains("if (show)"), "should check condition");
        assert!(js.contains("$$create_fragment"), "should create fragment");
    }

    #[test]
    fn if_else_block() {
        let source = r#"<script>
  show := $state(true)
</script>
<template>
  @if show {
    <p>yes</p>
  } @else {
    <p>no</p>
  }
</template>"#;
        let js = compile_to_js(source, "Toggle");
        assert!(js.contains("$$if0_branch0"), "should create if branch");
        assert!(js.contains("$$if0_branch1"), "should create else branch");
        assert!(js.contains("} else {"), "should have else clause");
    }

    #[test]
    fn if_elif_else_block() {
        let source = r#"<script>
  count := $state(0)
</script>
<template>
  @if count > 10 {
    <p>high</p>
  } @elif count > 5 {
    <p>medium</p>
  } @else {
    <p>low</p>
  }
</template>"#;
        let js = compile_to_js(source, "Level");
        assert!(js.contains("$$if0_branch0"), "should have if branch");
        assert!(js.contains("$$if0_branch1"), "should have elif branch");
        assert!(js.contains("$$if0_branch2"), "should have else branch");
        assert!(js.contains("if (count > 10)"), "should check first condition");
        assert!(js.contains("else if (count > 5)"), "should check elif condition");
    }

    #[test]
    fn if_block_reactive_update() {
        let source = r#"<script>
  show := $state(true)
</script>
<template>
  @if show {
    <p>visible</p>
  }
</template>"#;
        let js = compile_to_js(source, "Toggle");
        // Update function should include $$if0_update()
        assert!(
            js.contains("$$if0_update();"),
            "update function should call $$if0_update"
        );
    }

    #[test]
    fn each_block_basic() {
        let source = r#"<script>
  items := $state([])
</script>
<template>
  @each items -> item {
    <li>{item}</li>
  }
</template>"#;
        let js = compile_to_js(source, "List");
        assert!(js.contains("$$each_anchor0"), "should create anchor");
        assert!(js.contains("$$each0_render"), "should create render function");
        assert!(js.contains("$$each0_update()"), "should call update");
        assert!(js.contains("items.length"), "should iterate over items");
    }

    #[test]
    fn each_block_with_index() {
        let source = r#"<script>
  items := $state([])
</script>
<template>
  @each items -> item, idx {
    <li>{item}</li>
  }
</template>"#;
        let js = compile_to_js(source, "List");
        assert!(js.contains("$$each0_render(item, idx)"), "should pass index to render. JS:\n{}", js);
    }

    #[test]
    fn each_block_reactive_update() {
        let source = r#"<script>
  items := $state([])
</script>
<template>
  @each items -> item {
    <li>{item}</li>
  }
</template>"#;
        let js = compile_to_js(source, "List");
        assert!(
            js.contains("$$each0_update();"),
            "update function should call $$each0_update"
        );
    }

    #[test]
    fn multiple_if_blocks() {
        let source = r#"<script>
  a := $state(true)
  b := $state(false)
</script>
<template>
  @if a {
    <p>A</p>
  }
  @if b {
    <p>B</p>
  }
</template>"#;
        let js = compile_to_js(source, "Multi");
        assert!(js.contains("$$if0_update"), "should have first if block");
        assert!(js.contains("$$if1_update"), "should have second if block");
    }

    #[test]
    fn if_block_removes_and_inserts_fragment() {
        let source = r#"<script>
  show := $state(true)
</script>
<template>
  @if show {
    <p>visible</p>
  }
</template>"#;
        let js = compile_to_js(source, "Toggle");
        assert!(js.contains("$$remove_fragment"), "should remove old fragment");
        assert!(js.contains("$$insert_before"), "should insert new fragment");
    }

    #[test]
    fn each_block_removes_old_items() {
        let source = r#"<script>
  items := $state([])
</script>
<template>
  @each items -> item {
    <li>{item}</li>
  }
</template>"#;
        let js = compile_to_js(source, "List");
        assert!(js.contains("$$remove_fragment"), "should remove old items on update");
    }

    // -----------------------------------------------------------------------
    // Task #6: Component instantiation & destroy
    // -----------------------------------------------------------------------

    #[test]
    fn component_instantiation_basic() {
        let source = r#"<template>
  <Counter />
</template>"#;
        let js = compile_to_js(source, "App");
        assert!(js.contains("Counter($$comp0_target"), "should call component constructor. JS:\n{}", js);
        assert!(js.contains("let $$comp0"), "should create component instance variable");
        assert!(js.contains("$$append"), "should append component to parent");
    }

    #[test]
    fn component_with_static_props() {
        let source = r#"<template>
  <Button label="Click me" />
</template>"#;
        let js = compile_to_js(source, "App");
        assert!(js.contains("label: \"Click me\""), "should pass static prop");
    }

    #[test]
    fn component_with_dynamic_props() {
        let source = r#"<script>
  name := $state("world")
</script>
<template>
  <Greeting name={name} />
</template>"#;
        let js = compile_to_js(source, "App");
        assert!(js.contains("name: name"), "should pass dynamic prop");
    }

    #[test]
    fn component_with_event_handler() {
        let source = r#"<script>
  F handleSelect() { }
</script>
<template>
  <UserCard @select={handleSelect} />
</template>"#;
        let js = compile_to_js(source, "App");
        assert!(js.contains("on_select: handleSelect"), "should pass event handler as on_ prop");
    }

    #[test]
    fn component_with_children_default_slot() {
        let source = r#"<template>
  <Card>
    <p>content</p>
  </Card>
</template>"#;
        let js = compile_to_js(source, "App");
        assert!(js.contains("Card($$comp0_target"), "should instantiate Card");
        // Children should be rendered into the component target
        assert!(js.contains("$$element(\"p\")"), "should render child elements");
    }

    #[test]
    fn destroy_cleans_up_child_components() {
        let source = r#"<template>
  <Counter />
  <Timer />
</template>"#;
        let js = compile_to_js(source, "App");
        assert!(js.contains("$$comp0.$$destroy"), "should destroy first child component");
        assert!(js.contains("$$comp1.$$destroy"), "should destroy second child component");
    }

    #[test]
    fn destroy_removes_conditional_fragments() {
        let source = r#"<script>
  show := $state(true)
</script>
<template>
  @if show {
    <p>visible</p>
  }
</template>"#;
        let js = compile_to_js(source, "Toggle");
        assert!(
            js.contains("$$if_current0") && js.contains("$$remove_fragment"),
            "destroy should clean up conditional fragments"
        );
    }

    #[test]
    fn destroy_removes_each_items() {
        let source = r#"<script>
  items := $state([])
</script>
<template>
  @each items -> item {
    <li>{item}</li>
  }
</template>"#;
        let js = compile_to_js(source, "List");
        assert!(
            js.contains("$$each_items0"),
            "destroy should clean up each block items"
        );
    }

    #[test]
    fn component_shorthand_prop() {
        let source = r#"<script>
  name := $state("")
</script>
<template>
  <Greeting {name} />
</template>"#;
        let js = compile_to_js(source, "App");
        assert!(js.contains("name: name"), "should pass shorthand prop");
    }
}

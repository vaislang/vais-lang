//! Intermediate representation for the VaisX reactivity compiler.
//!
//! These types represent the result of analyzing a `.vaisx` file's reactive
//! declarations and template bindings, forming the input for JS code generation.

use std::collections::{HashMap, HashSet};

// ---------------------------------------------------------------------------
// Reactive variable declarations (from <script> analysis)
// ---------------------------------------------------------------------------

/// A reactive state variable declared via `$state(initialValue)`.
///
/// Desugared form: `name := __vx_state(initialValue)`
#[derive(Debug, Clone, PartialEq)]
pub struct ReactiveVar {
    /// Variable name (e.g., `"count"`).
    pub name: String,
    /// Initial value expression as raw source text (e.g., `"0"`, `"\"hello\""`).
    pub init_expr: String,
}

/// A derived (computed) variable declared via `$derived(expr)`.
///
/// Desugared form: `name := __vx_derived(|| { expr })`
#[derive(Debug, Clone, PartialEq)]
pub struct DerivedVar {
    /// Variable name (e.g., `"doubled"`).
    pub name: String,
    /// The computation expression (e.g., `"count * 2"`).
    pub expr: String,
    /// Names of reactive variables this derived depends on.
    pub deps: HashSet<String>,
}

/// An effect block declared via `$effect { body }`.
///
/// Desugared form: `__vx_effect(|| { body })`
#[derive(Debug, Clone, PartialEq)]
pub struct EffectVar {
    /// Unique index for this effect (0-based, in declaration order).
    pub index: usize,
    /// The effect body as raw source text.
    pub body: String,
    /// Names of reactive variables this effect depends on.
    pub deps: HashSet<String>,
}

// ---------------------------------------------------------------------------
// Template bindings (from <template> analysis)
// ---------------------------------------------------------------------------

/// A binding from a template expression to its reactive dependencies.
///
/// Each interpolation `{expr}`, dynamic attribute `attr={expr}`, or directive
/// condition produces a `TemplateBinding` that the codegen uses to wire up
/// fine-grained DOM updates.
#[derive(Debug, Clone, PartialEq)]
pub struct TemplateBinding {
    /// What kind of binding this is.
    pub kind: BindingKind,
    /// The expression being bound (raw source text).
    pub expr: String,
    /// Names of reactive variables this binding depends on.
    pub deps: HashSet<String>,
}

/// The kind of template binding — determines what codegen emits.
#[derive(Debug, Clone, PartialEq)]
pub enum BindingKind {
    /// Text interpolation: `{expr}` — updates a text node.
    Text {
        /// Index of the text node in the flattened DOM tree (for targeting).
        node_index: usize,
    },
    /// Dynamic attribute: `attr={expr}` — updates an element attribute.
    Attribute {
        /// Index of the element node.
        node_index: usize,
        /// Attribute name (e.g., `"class"`, `"disabled"`).
        attr_name: String,
    },
    /// Two-way binding: `:prop={var}` — syncs element property with state.
    TwoWay {
        /// Index of the element node.
        node_index: usize,
        /// Property name (e.g., `"value"`, `"checked"`).
        property: String,
        /// The bound variable name.
        var_name: String,
    },
    /// Event handler: `@event={handler}` — attaches event listener.
    Event {
        /// Index of the element node.
        node_index: usize,
        /// Event name (e.g., `"click"`, `"input"`).
        event_name: String,
        /// Modifiers (e.g., `["preventDefault"]`).
        modifiers: Vec<String>,
    },
    /// Conditional block: `@if` — controls visibility/creation of a subtree.
    Conditional {
        /// Index of the anchor/marker node.
        node_index: usize,
    },
    /// List rendering: `@each` — repeats a template fragment.
    List {
        /// Index of the anchor/marker node.
        node_index: usize,
        /// Item binding name.
        item_binding: String,
        /// Optional index binding name.
        index_binding: Option<String>,
        /// Optional key expression.
        key_expr: Option<String>,
    },
    /// Component prop binding.
    ComponentProp {
        /// Index of the component node.
        node_index: usize,
        /// Prop name on the child component.
        prop_name: String,
    },
}

// ---------------------------------------------------------------------------
// Dependency graph
// ---------------------------------------------------------------------------

/// The dependency graph for a single `.vaisx` component.
///
/// Maps reactive variables to all their dependents (derived vars, effects,
/// template bindings). Used by codegen to emit fine-grained update functions.
#[derive(Debug, Clone, PartialEq)]
pub struct DependencyGraph {
    /// All `$state` variables, keyed by name.
    pub state_vars: HashMap<String, ReactiveVar>,
    /// All `$derived` variables, keyed by name.
    pub derived_vars: HashMap<String, DerivedVar>,
    /// All `$effect` blocks, ordered by declaration index.
    pub effects: Vec<EffectVar>,
    /// All template bindings.
    pub bindings: Vec<TemplateBinding>,
    /// Adjacency list: state/derived var name -> set of dependent names/indices.
    ///
    /// Dependents can be:
    /// - `"derived:name"` — a derived variable
    /// - `"effect:N"` — an effect (by index)
    /// - `"binding:N"` — a template binding (by index in `bindings`)
    pub dependents: HashMap<String, HashSet<String>>,
}

impl DependencyGraph {
    /// Create an empty dependency graph.
    pub fn new() -> Self {
        Self {
            state_vars: HashMap::new(),
            derived_vars: HashMap::new(),
            effects: Vec::new(),
            bindings: Vec::new(),
            dependents: HashMap::new(),
        }
    }

    /// Add a state variable to the graph.
    pub fn add_state(&mut self, var: ReactiveVar) {
        self.state_vars.insert(var.name.clone(), var);
    }

    /// Add a derived variable and register its dependencies.
    pub fn add_derived(&mut self, var: DerivedVar) {
        let dep_key = format!("derived:{}", var.name);
        for dep in &var.deps {
            self.dependents
                .entry(dep.clone())
                .or_default()
                .insert(dep_key.clone());
        }
        self.derived_vars.insert(var.name.clone(), var);
    }

    /// Add an effect and register its dependencies.
    pub fn add_effect(&mut self, effect: EffectVar) {
        let dep_key = format!("effect:{}", effect.index);
        for dep in &effect.deps {
            self.dependents
                .entry(dep.clone())
                .or_default()
                .insert(dep_key.clone());
        }
        self.effects.push(effect);
    }

    /// Add a template binding and register its dependencies.
    pub fn add_binding(&mut self, binding: TemplateBinding) {
        let idx = self.bindings.len();
        let dep_key = format!("binding:{}", idx);
        for dep in &binding.deps {
            self.dependents
                .entry(dep.clone())
                .or_default()
                .insert(dep_key.clone());
        }
        self.bindings.push(binding);
    }

    /// Get all dependents (direct) of a given variable name.
    pub fn get_dependents(&self, var_name: &str) -> Option<&HashSet<String>> {
        self.dependents.get(var_name)
    }

    /// Compute the topological order of derived variables for evaluation.
    ///
    /// Returns derived var names in an order where each variable appears
    /// after all variables it depends on.
    pub fn derived_topo_order(&self) -> Vec<String> {
        let mut visited = HashSet::new();
        let mut order = Vec::new();

        for name in self.derived_vars.keys() {
            self.topo_visit(name, &mut visited, &mut order);
        }

        order
    }

    fn topo_visit(
        &self,
        name: &str,
        visited: &mut HashSet<String>,
        order: &mut Vec<String>,
    ) {
        if visited.contains(name) {
            return;
        }
        visited.insert(name.to_string());

        if let Some(derived) = self.derived_vars.get(name) {
            for dep in &derived.deps {
                if self.derived_vars.contains_key(dep) {
                    self.topo_visit(dep, visited, order);
                }
            }
        }

        if self.derived_vars.contains_key(name) {
            order.push(name.to_string());
        }
    }
}

impl Default for DependencyGraph {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Component IR (full compiled representation)
// ---------------------------------------------------------------------------

/// The full compiled intermediate representation of a `.vaisx` component.
///
/// This is the output of the analysis phase and the input to JS code generation.
#[derive(Debug, Clone, PartialEq)]
pub struct ComponentIR {
    /// Component name (derived from file name, e.g., `"Counter"`).
    pub name: String,
    /// The dependency graph with all reactive relationships.
    pub dependency_graph: DependencyGraph,
    /// Props declaration (if any).
    pub props: Option<PropsIR>,
    /// Event declarations (emit signatures).
    pub events: Vec<EventIR>,
    /// Whether this component has any reactive state.
    pub has_reactivity: bool,
    /// Functions declared in the script block (non-reactive helpers).
    pub functions: Vec<FunctionIR>,
}

/// Props declaration in IR form.
#[derive(Debug, Clone, PartialEq)]
pub struct PropsIR {
    pub fields: Vec<PropFieldIR>,
}

/// A single prop field in IR form.
#[derive(Debug, Clone, PartialEq)]
pub struct PropFieldIR {
    pub name: String,
    pub type_annotation: String,
    pub default_value: Option<String>,
}

/// An event declaration in IR form.
#[derive(Debug, Clone, PartialEq)]
pub struct EventIR {
    pub name: String,
    pub params: String,
}

/// A non-reactive function declared in the script block.
#[derive(Debug, Clone, PartialEq)]
pub struct FunctionIR {
    pub name: String,
    /// Raw function body source text.
    pub body: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dependency_graph_empty() {
        let graph = DependencyGraph::new();
        assert!(graph.state_vars.is_empty());
        assert!(graph.derived_vars.is_empty());
        assert!(graph.effects.is_empty());
        assert!(graph.bindings.is_empty());
    }

    #[test]
    fn dependency_graph_add_state() {
        let mut graph = DependencyGraph::new();
        graph.add_state(ReactiveVar {
            name: "count".to_string(),
            init_expr: "0".to_string(),
        });
        assert!(graph.state_vars.contains_key("count"));
    }

    #[test]
    fn dependency_graph_add_derived_registers_deps() {
        let mut graph = DependencyGraph::new();
        graph.add_state(ReactiveVar {
            name: "count".to_string(),
            init_expr: "0".to_string(),
        });
        graph.add_derived(DerivedVar {
            name: "doubled".to_string(),
            expr: "count * 2".to_string(),
            deps: HashSet::from(["count".to_string()]),
        });

        let dependents = graph.get_dependents("count").unwrap();
        assert!(dependents.contains("derived:doubled"));
    }

    #[test]
    fn dependency_graph_add_effect_registers_deps() {
        let mut graph = DependencyGraph::new();
        graph.add_state(ReactiveVar {
            name: "count".to_string(),
            init_expr: "0".to_string(),
        });
        graph.add_effect(EffectVar {
            index: 0,
            body: "console_log(count)".to_string(),
            deps: HashSet::from(["count".to_string()]),
        });

        let dependents = graph.get_dependents("count").unwrap();
        assert!(dependents.contains("effect:0"));
    }

    #[test]
    fn dependency_graph_add_binding_registers_deps() {
        let mut graph = DependencyGraph::new();
        graph.add_state(ReactiveVar {
            name: "count".to_string(),
            init_expr: "0".to_string(),
        });
        graph.add_binding(TemplateBinding {
            kind: BindingKind::Text { node_index: 0 },
            expr: "count".to_string(),
            deps: HashSet::from(["count".to_string()]),
        });

        let dependents = graph.get_dependents("count").unwrap();
        assert!(dependents.contains("binding:0"));
    }

    #[test]
    fn derived_topo_order_simple_chain() {
        let mut graph = DependencyGraph::new();
        graph.add_state(ReactiveVar {
            name: "a".to_string(),
            init_expr: "1".to_string(),
        });
        graph.add_derived(DerivedVar {
            name: "b".to_string(),
            expr: "a + 1".to_string(),
            deps: HashSet::from(["a".to_string()]),
        });
        graph.add_derived(DerivedVar {
            name: "c".to_string(),
            expr: "b + 1".to_string(),
            deps: HashSet::from(["b".to_string()]),
        });

        let order = graph.derived_topo_order();
        let b_pos = order.iter().position(|x| x == "b").unwrap();
        let c_pos = order.iter().position(|x| x == "c").unwrap();
        assert!(b_pos < c_pos, "b must come before c");
    }

    #[test]
    fn derived_topo_order_diamond() {
        let mut graph = DependencyGraph::new();
        graph.add_state(ReactiveVar {
            name: "a".to_string(),
            init_expr: "1".to_string(),
        });
        graph.add_derived(DerivedVar {
            name: "b".to_string(),
            expr: "a + 1".to_string(),
            deps: HashSet::from(["a".to_string()]),
        });
        graph.add_derived(DerivedVar {
            name: "c".to_string(),
            expr: "a + 2".to_string(),
            deps: HashSet::from(["a".to_string()]),
        });
        graph.add_derived(DerivedVar {
            name: "d".to_string(),
            expr: "b + c".to_string(),
            deps: HashSet::from(["b".to_string(), "c".to_string()]),
        });

        let order = graph.derived_topo_order();
        let d_pos = order.iter().position(|x| x == "d").unwrap();
        let b_pos = order.iter().position(|x| x == "b").unwrap();
        let c_pos = order.iter().position(|x| x == "c").unwrap();
        assert!(b_pos < d_pos, "b must come before d");
        assert!(c_pos < d_pos, "c must come before d");
    }

    #[test]
    fn component_ir_construction() {
        let ir = ComponentIR {
            name: "Counter".to_string(),
            dependency_graph: DependencyGraph::new(),
            props: None,
            events: vec![],
            has_reactivity: false,
            functions: vec![],
        };
        assert_eq!(ir.name, "Counter");
        assert!(!ir.has_reactivity);
    }
}

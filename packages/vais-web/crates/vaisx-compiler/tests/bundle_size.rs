//! Bundle size benchmarks & optimization checks.
//!
//! Measures the JS output size for standard component patterns and verifies
//! that the compiler doesn't emit unnecessary code.

use vaisx_compiler::{compile, CompileOptions};

fn compile_js(source: &str, name: &str) -> String {
    let options = CompileOptions {
        component_name: Some(name.to_string()),
        ..Default::default()
    };
    compile(source, options).expect("compilation should succeed").js
}

// ---------------------------------------------------------------------------
// Size measurement helpers
// ---------------------------------------------------------------------------

fn measure_size(js: &str) -> usize {
    js.len()
}

fn count_lines(js: &str) -> usize {
    js.lines().count()
}

// ---------------------------------------------------------------------------
// 1. Standard component size measurements
// ---------------------------------------------------------------------------

#[test]
fn bundle_size_empty_component() {
    let js = compile_js("", "Empty");
    let size = measure_size(&js);
    let lines = count_lines(&js);

    // Empty component should be very small
    assert!(size < 200, "empty component should be < 200 bytes, got {}", size);
    assert!(lines < 10, "empty component should be < 10 lines, got {}", lines);
    eprintln!("[BENCH] Empty component: {} bytes, {} lines", size, lines);
}

#[test]
fn bundle_size_counter() {
    let source = r#"<script>
  count := $state(0)
  F increment() { count += 1 }
</script>
<template>
  <button @click={increment}>{count}</button>
</template>"#;

    let js = compile_js(source, "Counter");
    let size = measure_size(&js);
    let lines = count_lines(&js);

    // Counter should be reasonably small
    assert!(size < 1500, "counter should be < 1500 bytes, got {}", size);
    eprintln!("[BENCH] Counter: {} bytes, {} lines", size, lines);
}

#[test]
fn bundle_size_todo_list() {
    let source = r#"<script>
  todos := $state([])
  newTodo := $state("")
  F addTodo() {
    todos = [...todos, newTodo]
    newTodo = ""
  }
</script>
<template>
  <div>
    <input :value={newTodo} />
    <button @click={addTodo}>Add</button>
    <ul>
      @each todos -> todo {
        <li>{todo}</li>
      }
    </ul>
  </div>
</template>"#;

    let js = compile_js(source, "TodoList");
    let size = measure_size(&js);
    let lines = count_lines(&js);

    assert!(size < 3000, "todo list should be < 3000 bytes, got {}", size);
    eprintln!("[BENCH] Todo list: {} bytes, {} lines", size, lines);
}

#[test]
fn bundle_size_conditional() {
    let source = r#"<script>
  status := $state("loading")
</script>
<template>
  @if status == "loading" {
    <p>Loading...</p>
  } @elif status == "error" {
    <p>Error</p>
  } @else {
    <p>Ready</p>
  }
</template>"#;

    let js = compile_js(source, "Status");
    let size = measure_size(&js);
    let lines = count_lines(&js);

    assert!(size < 2500, "conditional should be < 2500 bytes, got {}", size);
    eprintln!("[BENCH] Conditional: {} bytes, {} lines", size, lines);
}

#[test]
fn bundle_size_derived_chain() {
    let source = r#"<script>
  a := $state(1)
  b := $derived(a * 2)
  c := $derived(b * 3)
  d := $derived(c * 4)
</script>
<template>
  <p>{d}</p>
</template>"#;

    let js = compile_js(source, "Chain");
    let size = measure_size(&js);
    eprintln!("[BENCH] Derived chain (4 levels): {} bytes", size);
    assert!(size < 1500, "derived chain should be < 1500 bytes, got {}", size);
}

// ---------------------------------------------------------------------------
// 2. Unnecessary code elimination
// ---------------------------------------------------------------------------

#[test]
fn no_unused_imports_static() {
    let js = compile_js("", "Empty");
    // Empty component should not import any runtime helpers
    assert!(!js.contains("import {"), "empty component should have no imports");
}

#[test]
fn no_unused_imports_template_only() {
    let source = r#"<template>
  <div>hello</div>
</template>"#;
    let js = compile_js(source, "Static");

    // Should import only used helpers
    assert!(js.contains("$$element"), "should import $$element");
    assert!(js.contains("$$text"), "should import $$text");
    assert!(js.contains("$$append"), "should import $$append");

    // Should NOT import reactive helpers
    assert!(!js.contains("$$schedule"), "should not import $$schedule for static component");
    assert!(!js.contains("$$set_text"), "should not import $$set_text for static component");
    assert!(!js.contains("$$listen"), "should not import $$listen for static component");
}

#[test]
fn no_update_function_for_static() {
    let source = r#"<template>
  <p>hello</p>
</template>"#;
    let js = compile_js(source, "Static");
    assert!(!js.contains("function $$update"), "static component should not have $$update");
    assert!(!js.contains("$$update,"), "static component should not return $$update");
}

#[test]
fn no_effect_scheduling_without_effects() {
    let source = r#"<script>
  count := $state(0)
</script>
<template>
  <p>{count}</p>
</template>"#;
    let js = compile_js(source, "NoEffect");
    // $$schedule should not appear unless there are effects
    // (it may appear if functions mutate state though)
    // Just verify we don't have stray $$schedule calls
    let schedule_count = js.matches("$$schedule(()").count();
    assert_eq!(schedule_count, 0, "should not schedule effects when there are none");
}

#[test]
fn no_anchor_without_conditionals() {
    let source = r#"<template>
  <p>hello</p>
</template>"#;
    let js = compile_js(source, "Simple");
    assert!(!js.contains("$$anchor"), "should not create anchors without conditionals/lists");
}

#[test]
fn no_fragment_without_blocks() {
    let source = r#"<template>
  <div>
    <p>simple</p>
  </div>
</template>"#;
    let js = compile_js(source, "Simple");
    assert!(!js.contains("$$create_fragment"), "should not create fragments without blocks");
}

// ---------------------------------------------------------------------------
// 3. Output code quality snapshots
// ---------------------------------------------------------------------------

#[test]
fn output_structure_counter() {
    let source = r#"<script>
  count := $state(0)
  F increment() { count += 1 }
</script>
<template>
  <button @click={increment}>{count}</button>
</template>"#;

    let js = compile_js(source, "Counter");

    // Verify structural ordering:
    // 1. Imports
    // 2. Function declaration
    // 3. State initialization
    // 4. Function definitions
    // 5. DOM creation
    // 6. Update function
    // 7. Return lifecycle

    let import_pos = js.find("import {").expect("should have import");
    let function_pos = js.find("export default function").expect("should have function");
    let state_pos = js.find("let count = 0").expect("should have state init");
    let dom_pos = js.find("// DOM creation").unwrap_or_else(|| js.find("$$element").expect("should have DOM creation"));
    let update_pos = js.find("function $$update").expect("should have update function");
    let return_pos = js.find("return {").expect("should have return");

    assert!(import_pos < function_pos, "imports before function");
    assert!(function_pos < state_pos, "function before state");
    // State and DOM may interleave with functions, so check DOM < update and update < return
    assert!(dom_pos < update_pos, "DOM before update");
    assert!(update_pos < return_pos, "update before return");
}

#[test]
fn output_valid_js_structure() {
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
  <span>{doubled}</span>
</template>"#;

    let js = compile_js(source, "Test");

    // Check brace matching (basic validation)
    let open_braces = js.chars().filter(|c| *c == '{').count();
    let close_braces = js.chars().filter(|c| *c == '}').count();
    assert_eq!(open_braces, close_braces,
        "braces should be balanced: {} open, {} close", open_braces, close_braces);

    // Check parenthesis matching
    let open_parens = js.chars().filter(|c| *c == '(').count();
    let close_parens = js.chars().filter(|c| *c == ')').count();
    assert_eq!(open_parens, close_parens,
        "parens should be balanced: {} open, {} close", open_parens, close_parens);
}

#[test]
fn output_consistent_indentation() {
    let source = r#"<template>
  <div>hello</div>
</template>"#;

    let js = compile_js(source, "Test");

    // All lines should use consistent 2-space indentation
    for line in js.lines() {
        if line.is_empty() {
            continue;
        }
        let leading_spaces = line.len() - line.trim_start().len();
        assert_eq!(leading_spaces % 2, 0,
            "indentation should be multiples of 2 spaces: {:?}", line);
    }
}

// ---------------------------------------------------------------------------
// 4. Size comparison report
// ---------------------------------------------------------------------------

#[test]
fn size_report() {
    let components = [
        ("Empty", ""),
        ("StaticDiv", "<template><div>hello</div></template>"),
        ("Counter", r#"<script>
  count := $state(0)
  F increment() { count += 1 }
</script>
<template>
  <button @click={increment}>{count}</button>
</template>"#),
        ("TodoList", r#"<script>
  todos := $state([])
  newTodo := $state("")
  F addTodo() { todos = [...todos, newTodo] }
</script>
<template>
  <div>
    <input :value={newTodo} />
    <button @click={addTodo}>Add</button>
    <ul>
      @each todos -> todo {
        <li>{todo}</li>
      }
    </ul>
  </div>
</template>"#),
    ];

    eprintln!("\n=== Bundle Size Report ===");
    eprintln!("{:<15} {:>8} {:>8}", "Component", "Bytes", "Lines");
    eprintln!("{}", "-".repeat(33));

    for (name, source) in &components {
        let js = compile_js(source, name);
        let size = measure_size(&js);
        let lines = count_lines(&js);
        eprintln!("{:<15} {:>8} {:>8}", name, size, lines);
    }
    eprintln!("===========================\n");
}

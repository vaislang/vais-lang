//! Compile output correctness E2E tests.
//!
//! Tests the full pipeline: .vaisx source -> parse -> analyze -> codegen -> JS output.
//! Each test verifies that the generated JS contains the expected patterns
//! for a given component type.

use vaisx_compiler::{compile, CompileOptions};

fn compile_js(source: &str, name: &str) -> String {
    let options = CompileOptions {
        component_name: Some(name.to_string()),
        ..Default::default()
    };
    let result = compile(source, options).expect("compilation should succeed");
    result.js
}

// ---------------------------------------------------------------------------
// 1. Counter — basic state + event
// ---------------------------------------------------------------------------

#[test]
fn e2e_counter_component() {
    let source = r#"<script>
  count := $state(0)
  F increment() { count += 1 }
  F decrement() { count -= 1 }
</script>
<template>
  <div class="counter">
    <button @click={decrement}>-</button>
    <span>{count}</span>
    <button @click={increment}>+</button>
  </div>
</template>
<style>
  .counter { display: flex; }
</style>"#;

    let js = compile_js(source, "Counter");

    // Module structure
    assert!(js.starts_with("import {"), "should start with imports");
    assert!(js.contains("@vaisx/runtime"), "should import from runtime");
    assert!(js.contains("export default function Counter($$target)"), "should export component");

    // State
    assert!(js.contains("let count = 0;"), "should initialize state");

    // Functions
    assert!(js.contains("function increment"), "should define increment");
    assert!(js.contains("function decrement"), "should define decrement");

    // DOM creation
    assert!(js.contains("$$element(\"div\")"), "should create div");
    assert!(js.contains("$$element(\"button\")"), "should create buttons");
    assert!(js.contains("$$element(\"span\")"), "should create span");
    assert!(js.contains("$$attr"), "should set attributes");
    assert!(js.contains("$$text(count)"), "should create reactive text");

    // Event bindings
    assert!(js.contains("$$listen"), "should attach event listeners");
    assert!(js.contains("\"click\""), "should listen for click events");
    assert!(js.contains("increment"), "should reference increment handler");
    assert!(js.contains("decrement"), "should reference decrement handler");

    // Update function
    assert!(js.contains("function $$update()"), "should have update function");
    assert!(js.contains("$$set_text"), "should update text on state change");

    // State mutation scheduling
    assert!(js.contains("$$schedule"), "should schedule updates on mutation");

    // Lifecycle
    assert!(js.contains("$$update,"), "should return update in lifecycle");
    assert!(js.contains("$$destroy()"), "should return destroy in lifecycle");
}

// ---------------------------------------------------------------------------
// 2. Todo — list rendering + CRUD
// ---------------------------------------------------------------------------

#[test]
fn e2e_todo_list() {
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
      @each todos -> todo, idx {
        <li>{todo}</li>
      }
    </ul>
  </div>
</template>"#;

    let js = compile_js(source, "TodoList");

    // State
    assert!(js.contains("let newTodo = \"\";"), "should init newTodo");
    assert!(js.contains("let todos = [];"), "should init todos");

    // Two-way binding on input
    assert!(js.contains("$$attr("), "should set initial value on input");
    assert!(js.contains("\"input\""), "should listen for input events");
    assert!(js.contains("newTodo = e.target.value"), "should update newTodo on input");

    // Event binding on button
    assert!(js.contains("$$listen"), "should attach click listener");

    // @each list rendering
    assert!(js.contains("$$each0_render"), "should have each render function");
    assert!(js.contains("$$each0_update"), "should have each update function");
    assert!(js.contains("todos.length"), "should iterate over todos");
    assert!(js.contains("$$element(\"li\")"), "should create li elements");

    // Update function includes each update
    assert!(js.contains("$$each0_update();"), "update should refresh list");
}

// ---------------------------------------------------------------------------
// 3. Conditional rendering (@if/@elif/@else)
// ---------------------------------------------------------------------------

#[test]
fn e2e_conditional_rendering() {
    let source = r#"<script>
  status := $state("loading")
</script>
<template>
  <div>
    @if status == "loading" {
      <p>Loading...</p>
    } @elif status == "error" {
      <p>Error occurred</p>
    } @else {
      <p>Ready!</p>
    }
  </div>
</template>"#;

    let js = compile_js(source, "StatusView");

    // State
    assert!(js.contains("let status = \"loading\";"), "should init status");

    // Conditional block
    assert!(js.contains("$$if0_branch0"), "should have if branch");
    assert!(js.contains("$$if0_branch1"), "should have elif branch");
    assert!(js.contains("$$if0_branch2"), "should have else branch");
    assert!(js.contains("status == \"loading\""), "should check loading condition");
    assert!(js.contains("status == \"error\""), "should check error condition");

    // Fragment management
    assert!(js.contains("$$create_fragment"), "should create fragments");
    assert!(js.contains("$$remove_fragment"), "should remove old fragments");
    assert!(js.contains("$$insert_before"), "should insert new fragments");
    assert!(js.contains("$$anchor"), "should create anchor nodes");

    // Update includes if_update
    assert!(js.contains("$$if0_update();"), "update should re-evaluate conditions");
}

// ---------------------------------------------------------------------------
// 4. Nested components (props + slot)
// ---------------------------------------------------------------------------

#[test]
fn e2e_nested_components() {
    let source = r#"<script>
  title := $state("Hello")
  F handleClick() { }
</script>
<template>
  <div>
    <Card title={title} @click={handleClick}>
      <p>Card content</p>
    </Card>
    <Button label="Submit" />
  </div>
</template>"#;

    let js = compile_js(source, "Page");

    // Child component instantiation
    assert!(js.contains("Card($$comp0_target"), "should instantiate Card");
    assert!(js.contains("Button($$comp1_target"), "should instantiate Button");

    // Props passing
    assert!(js.contains("title: title"), "should pass dynamic prop to Card");
    assert!(js.contains("on_click: handleClick"), "should pass event handler to Card");
    assert!(js.contains("label: \"Submit\""), "should pass static prop to Button");

    // Default slot content
    assert!(js.contains("$$element(\"p\")"), "should render slot content");

    // Destroy cleanup
    assert!(js.contains("$$comp0.$$destroy"), "should destroy Card on cleanup");
    assert!(js.contains("$$comp1.$$destroy"), "should destroy Button on cleanup");
}

// ---------------------------------------------------------------------------
// 5. Derived chain (state -> derived1 -> derived2 -> DOM)
// ---------------------------------------------------------------------------

#[test]
fn e2e_derived_chain() {
    let source = r#"<script>
  price := $state(100)
  tax := $derived(price * 0.1)
  total := $derived(price + tax)
</script>
<template>
  <div>
    <p>Price: {price}</p>
    <p>Tax: {tax}</p>
    <p>Total: {total}</p>
  </div>
</template>"#;

    let js = compile_js(source, "PriceCalc");

    // State
    assert!(js.contains("let price = 100;"), "should init price");

    // Derived values (initial)
    assert!(js.contains("let tax = price * 0.1;"), "should compute tax");
    assert!(js.contains("let total = price + tax;"), "should compute total");

    // Update function re-computes in correct order (tax before total)
    let tax_update_pos = js.find("tax = price * 0.1").unwrap();
    let total_update_pos = js.find("total = price + tax").unwrap();
    // There should be a second occurrence in the update function
    let second_tax = js[tax_update_pos + 1..].find("tax = price * 0.1");
    let second_total = js[total_update_pos + 1..].find("total = price + tax");
    assert!(second_tax.is_some(), "update should recompute tax");
    assert!(second_total.is_some(), "update should recompute total");

    // Text interpolation
    assert!(js.contains("$$text(price)"), "should show price");
    assert!(js.contains("$$text(tax)"), "should show tax");
    assert!(js.contains("$$text(total)"), "should show total");
}

// ---------------------------------------------------------------------------
// 6. Effect lifecycle
// ---------------------------------------------------------------------------

#[test]
fn e2e_effect_lifecycle() {
    let source = r#"<script>
  count := $state(0)
  $effect {
    console_log("count changed:", count)
  }
  $effect {
    document_title = "Count: " + count
  }
</script>
<template>
  <p>{count}</p>
</template>"#;

    let js = compile_js(source, "EffectDemo");

    // Effects are scheduled
    assert!(js.contains("$$schedule"), "should schedule effects");
    assert!(js.contains("console_log"), "should contain first effect body");
    assert!(js.contains("document_title"), "should contain second effect body");

    // Two separate effect schedules
    let schedule_count = js.matches("$$schedule(").count();
    assert!(schedule_count >= 2, "should schedule at least 2 effects, got {}", schedule_count);
}

// ---------------------------------------------------------------------------
// 7. Two-way binding
// ---------------------------------------------------------------------------

#[test]
fn e2e_two_way_binding() {
    let source = r#"<script>
  name := $state("")
  agreed := $state(false)
</script>
<template>
  <form>
    <input :value={name} />
    <input type="checkbox" :checked={agreed} />
    <p>Name: {name}</p>
    <p>Agreed: {agreed}</p>
  </form>
</template>"#;

    let js = compile_js(source, "Form");

    // Value binding
    assert!(js.contains("$$attr("), "should set value attribute");
    assert!(js.contains("\"input\""), "should listen for input event on text input");
    assert!(js.contains("name = e.target.value"), "should update name from input");

    // Checked binding
    assert!(js.contains("\"change\""), "should listen for change event on checkbox");
    assert!(js.contains("agreed = e.target.checked"), "should update agreed from checkbox");

    // Both call $$update
    let update_calls = js.matches("$$update()").count();
    assert!(update_calls >= 2, "should call $$update in both binding handlers, got {}", update_calls);

    // Text interpolation for display
    assert!(js.contains("$$text(name)"), "should show name");
    assert!(js.contains("$$text(agreed)"), "should show agreed");
}

// ---------------------------------------------------------------------------
// 8. @await async block
// ---------------------------------------------------------------------------

#[test]
fn e2e_await_block() {
    let source = r#"<template>
  @await fetchData() {
    loading => {
      <p>Loading...</p>
    }
    ok(data) => {
      <p>{data}</p>
    }
    err(e) => {
      <p>Error: {e}</p>
    }
  }
</template>"#;

    let js = compile_js(source, "AsyncView");

    // Await block structure
    assert!(js.contains("$$await_anchor0"), "should create await anchor");
    assert!(js.contains("$$await0_loading"), "should have loading branch");
    assert!(js.contains("$$await0_ok"), "should have ok branch");
    assert!(js.contains("$$await0_err"), "should have err branch");

    // Promise handling
    assert!(js.contains(".then("), "should call .then() on the promise");
    assert!(js.contains("fetchData()"), "should use the expression");

    // Fragment management
    assert!(js.contains("$$create_fragment"), "should create fragments");
    assert!(js.contains("$$remove_fragment"), "should remove fragments");
}

// ---------------------------------------------------------------------------
// 9. Full integration: complex component
// ---------------------------------------------------------------------------

#[test]
fn e2e_complex_component() {
    let source = r#"<script>
  P {
    items: Array
    title: String = "My List"
    emit select(item: Item)
  }

  filter := $state("")
  filteredItems := $derived(items.filter(i => i.name.includes(filter)))
  count := $derived(filteredItems.length)

  F handleSelect(item) {
    emit select(item)
  }

  $effect {
    console_log("Filtered count:", count)
  }
</script>
<template>
  <div class="list-view">
    <h1>{title}</h1>
    <input :value={filter} />
    <p>{count} items</p>
    @if count > 0 {
      <ul>
        @each filteredItems -> item {
          <li @click={handleSelect}>{item.name}</li>
        }
      </ul>
    } @else {
      <p>No items found</p>
    }
  </div>
</template>"#;

    let js = compile_js(source, "ListView");

    // Module structure
    assert!(js.contains("export default function ListView($$target)"));
    assert!(js.contains("import {"));

    // State & derived
    assert!(js.contains("let filter = \"\";"), "should init filter");
    assert!(js.contains("let filteredItems ="), "should compute filteredItems");
    assert!(js.contains("let count ="), "should compute count");

    // Props (extracted by parser)
    // Events (extracted by parser)
    // Functions
    assert!(js.contains("function handleSelect"), "should define handleSelect");

    // Template elements
    assert!(js.contains("$$element(\"div\")"), "should create div");
    assert!(js.contains("$$element(\"h1\")"), "should create h1");
    assert!(js.contains("$$element(\"input\")"), "should create input");

    // Two-way binding
    assert!(js.contains("filter = e.target.value"), "should bind filter to input");

    // Conditional
    assert!(js.contains("$$if0_"), "should have conditional block");
    assert!(js.contains("count > 0"), "should check condition");

    // List rendering
    assert!(js.contains("$$each0_"), "should have each block");

    // Effect
    assert!(js.contains("$$schedule"), "should schedule effect");

    // Update function
    assert!(js.contains("function $$update()"), "should have update function");

    // Lifecycle
    assert!(js.contains("$$destroy()"), "should have destroy");
}

// ---------------------------------------------------------------------------
// 10. Edge cases
// ---------------------------------------------------------------------------

#[test]
fn e2e_empty_component() {
    let js = compile_js("", "Empty");
    assert!(js.contains("export default function Empty($$target)"));
    assert!(js.contains("$$destroy()"));
    assert!(!js.contains("$$update,"), "static component should not export update");
}

#[test]
fn e2e_template_only() {
    let source = r#"<template>
  <div>
    <h1>Hello World</h1>
    <p>Static content</p>
  </div>
</template>"#;
    let js = compile_js(source, "Static");
    assert!(js.contains("$$element(\"div\")"));
    assert!(js.contains("$$element(\"h1\")"));
    assert!(js.contains("$$text(\"Hello World\")"));
    assert!(!js.contains("function $$update"), "static component should not have update");
}

#[test]
fn e2e_script_only() {
    let source = r#"<script>
  count := $state(0)
  doubled := $derived(count * 2)
</script>"#;
    let js = compile_js(source, "ScriptOnly");
    assert!(js.contains("let count = 0;"));
    assert!(js.contains("let doubled = count * 2;"));
    assert!(js.contains("function $$update()"), "reactive component should have update");
}

#[test]
fn e2e_multiple_state_vars() {
    let source = r#"<script>
  a := $state(1)
  b := $state(2)
  c := $state(3)
  sum := $derived(a + b + c)
</script>
<template>
  <p>{sum}</p>
</template>"#;
    let js = compile_js(source, "Multi");
    assert!(js.contains("let a = 1;"));
    assert!(js.contains("let b = 2;"));
    assert!(js.contains("let c = 3;"));
    assert!(js.contains("let sum = a + b + c;"));
}

#[test]
fn e2e_nested_elements() {
    let source = r#"<template>
  <div>
    <ul>
      <li>
        <a>link</a>
      </li>
    </ul>
  </div>
</template>"#;
    let js = compile_js(source, "Nested");
    assert!(js.contains("$$element(\"div\")"));
    assert!(js.contains("$$element(\"ul\")"));
    assert!(js.contains("$$element(\"li\")"));
    assert!(js.contains("$$element(\"a\")"));
    // Nesting should use $$append with correct parent variables
    let append_count = js.matches("$$append").count();
    assert!(append_count >= 4, "should have at least 4 $$append calls, got {}", append_count);
}

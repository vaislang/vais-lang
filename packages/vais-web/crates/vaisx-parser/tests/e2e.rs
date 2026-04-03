//! End-to-end integration tests for the vaisx-parser.
//!
//! These tests exercise the full parsing pipeline: block separation → desugar → template/style parsing.
//! Covers the 26 contract test patterns from PHASE_0_5_PARSER_COMPAT.md plus additional scenarios.

use vaisx_parser::*;

// ===========================================================================
// 1. Block separation tests
// ===========================================================================

#[test]
fn e2e_01_empty_file() {
    let file = parse("").unwrap();
    assert!(file.script.is_none());
    assert!(file.template.is_none());
    assert!(file.styles.is_empty());
}

#[test]
fn e2e_02_script_only() {
    let file = parse("<script>count := 0</script>").unwrap();
    assert!(file.script.is_some());
    assert!(file.template.is_none());
    assert!(file.styles.is_empty());
}

#[test]
fn e2e_03_template_only() {
    let file = parse("<template><div>Hello</div></template>").unwrap();
    assert!(file.script.is_none());
    assert!(file.template.is_some());
}

#[test]
fn e2e_04_style_only() {
    let file = parse("<style>h1 { color: blue; }</style>").unwrap();
    assert!(file.script.is_none());
    assert!(file.template.is_none());
    assert_eq!(file.styles.len(), 1);
}

#[test]
fn e2e_05_all_three_blocks() {
    let src = r#"<script>
  count := $state(0)
</script>

<template>
  <p>{count}</p>
</template>

<style>
  p { color: red; }
</style>"#;
    let file = parse(src).unwrap();
    assert!(file.script.is_some());
    assert!(file.template.is_some());
    assert_eq!(file.styles.len(), 1);
}

#[test]
fn e2e_06_reverse_block_order() {
    let src = r#"<style>h1 { color: blue; }</style>
<template><h1>Hello</h1></template>
<script>x := 1</script>"#;
    let file = parse(src).unwrap();
    assert!(file.script.is_some());
    assert!(file.template.is_some());
    assert_eq!(file.styles.len(), 1);
}

#[test]
fn e2e_07_duplicate_script_error() {
    let src = "<script>a</script><script>b</script>";
    let (file, errors) = parse_with_recovery(src);
    assert_eq!(errors.len(), 1);
    assert!(matches!(errors[0], ParseError::DuplicateBlock { .. }));
    assert_eq!(file.script.unwrap().node.raw_source, "a");
}

// ===========================================================================
// 2. Desugar tests (contract test patterns from PHASE_0_5_PARSER_COMPAT.md)
// ===========================================================================

#[test]
fn e2e_08_desugar_state_integer() {
    // Contract: count := __vx_state(0) → Stmt::Let + Expr::Call
    let src = "<script>count := $state(0)</script>";
    let file = parse(src).unwrap();
    let desugared = file.script.unwrap().node.desugared_source.unwrap();
    assert!(desugared.contains("__vx_state(0)"));
    assert!(!desugared.contains("$state"));
}

#[test]
fn e2e_09_desugar_state_string() {
    // Contract: name := __vx_state("world") → string arg
    let src = r#"<script>name := $state("world")</script>"#;
    let file = parse(src).unwrap();
    let desugared = file.script.unwrap().node.desugared_source.unwrap();
    assert!(desugared.contains("__vx_state(\"world\")"));
}

#[test]
fn e2e_10_desugar_derived() {
    // Contract: doubled := __vx_derived(|| { count * 2 }) → closure arg
    let src = "<script>doubled := $derived(count * 2)</script>";
    let file = parse(src).unwrap();
    let desugared = file.script.unwrap().node.desugared_source.unwrap();
    assert!(desugared.contains("__vx_derived(|| { count * 2 })"));
}

#[test]
fn e2e_11_desugar_derived_complex() {
    let src = r#"<script>greeting := $derived("Hello, " + name + "!")</script>"#;
    let file = parse(src).unwrap();
    let desugared = file.script.unwrap().node.desugared_source.unwrap();
    assert!(desugared.contains("__vx_derived(|| {"));
}

#[test]
fn e2e_12_desugar_effect() {
    // Contract: __vx_effect(|| { console_log("changed: ", count) }) → expr stmt + closure
    let src = r#"<script>$effect {
    console_log("count changed: ", count)
  }</script>"#;
    let file = parse(src).unwrap();
    let desugared = file.script.unwrap().node.desugared_source.unwrap();
    assert!(desugared.contains("__vx_effect(||"));
    assert!(desugared.contains("console_log"));
    assert!(!desugared.contains("$effect"));
}

#[test]
fn e2e_13_desugar_props_struct() {
    // Contract: S __VxProps__ { user: User, showAvatar: bool } → struct definition
    let src = r#"<script>
P {
    user: User
    showAvatar: bool
}
</script>"#;
    let file = parse(src).unwrap();
    let script = file.script.unwrap();
    let desugared = script.node.desugared_source.unwrap();
    assert!(desugared.contains("S __VxProps__"));
    assert!(!desugared.contains("P {"));
    let props = script.node.props.unwrap().node;
    assert_eq!(props.fields.len(), 2);
}

#[test]
fn e2e_14_desugar_props_with_defaults() {
    let src = r#"<script>
P {
    showAvatar: bool = true
    count: i32 = 0
}
</script>"#;
    let file = parse(src).unwrap();
    let script = file.script.unwrap();
    let props = script.node.props.unwrap().node;
    assert_eq!(props.fields[0].node.default_value, Some("true".to_string()));
    assert_eq!(props.fields[1].node.default_value, Some("0".to_string()));
}

#[test]
fn e2e_15_desugar_props_with_emit() {
    let src = r#"<script>
P {
    user: User
    emit select(user: User)
}
</script>"#;
    let file = parse(src).unwrap();
    let script = file.script.unwrap();
    assert!(script.node.events.iter().any(|e| e.node.name == "select"));
    let desugared = script.node.desugared_source.unwrap();
    assert!(!desugared.contains("emit select"));
}

#[test]
fn e2e_16_desugar_emit_call() {
    // Contract: __vx_emit("select") → string arg function call
    let src = "<script>emit select(user)</script>";
    let file = parse(src).unwrap();
    let desugared = file.script.unwrap().node.desugared_source.unwrap();
    assert!(desugared.contains("__vx_emit(\"select\""));
}

#[test]
fn e2e_17_desugar_server_attribute_passthrough() {
    // Contract: #[server] A F loadItems() → attribute + async function
    let src = r#"<script>
#[server]
A F loadItems() -> Vec<Item> {
    db.query("SELECT * FROM items")
}
</script>"#;
    let file = parse(src).unwrap();
    let desugared = file.script.unwrap().node.desugared_source.unwrap();
    // #[server] should pass through unchanged
    assert!(desugared.contains("#[server]"));
    assert!(desugared.contains("A F loadItems()"));
}

#[test]
fn e2e_18_desugar_wasm_attribute_passthrough() {
    let src = r#"<script>
#[wasm]
F processData(raw: Vec<f64>) -> Vec<DataPoint> {
    raw
}
</script>"#;
    let file = parse(src).unwrap();
    let desugared = file.script.unwrap().node.desugared_source.unwrap();
    assert!(desugared.contains("#[wasm]"));
}

// ===========================================================================
// 3. Template parsing tests
// ===========================================================================

#[test]
fn e2e_19_template_text_interpolation() {
    let src = r#"<template><h1>{greeting}</h1><p>Count: {count}, Doubled: {doubled}</p></template>"#;
    let file = parse(src).unwrap();
    let tmpl = file.template.unwrap();
    // h1 and p elements
    let elements: Vec<_> = tmpl.node.children.iter().filter(|n| matches!(&n.node, TemplateNode::Element(_))).collect();
    assert_eq!(elements.len(), 2);
}

#[test]
fn e2e_20_template_event_binding() {
    let src = r#"<template><button @click={increment}>+1</button></template>"#;
    let file = parse(src).unwrap();
    let tmpl = file.template.unwrap();
    let btn = tmpl.node.children.iter()
        .find_map(|n| match &n.node { TemplateNode::Element(el) if el.tag == "button" => Some(el), _ => None })
        .unwrap();
    let has_click = btn.attributes.iter().any(|a| matches!(&a.node, Attribute::Event(ev) if ev.name == "click"));
    assert!(has_click);
}

#[test]
fn e2e_21_template_bind_directive() {
    let src = r#"<template><input :value={name} /></template>"#;
    let file = parse(src).unwrap();
    let tmpl = file.template.unwrap();
    let input = tmpl.node.children.iter()
        .find_map(|n| match &n.node { TemplateNode::Element(el) if el.tag == "input" => Some(el), _ => None })
        .unwrap();
    let has_bind = input.attributes.iter().any(|a| matches!(&a.node, Attribute::Bind(b) if b.property == "value"));
    assert!(has_bind);
}

#[test]
fn e2e_22_template_if_elif_else() {
    let src = r#"<template>
  @if count > 10 {
    <p>High</p>
  } @elif count > 5 {
    <p>Medium</p>
  } @else {
    <p>Low</p>
  }
</template>"#;
    let file = parse(src).unwrap();
    let tmpl = file.template.unwrap();
    let if_block = tmpl.node.children.iter()
        .find_map(|n| match &n.node { TemplateNode::IfBlock(b) => Some(b), _ => None })
        .unwrap();
    assert_eq!(if_block.condition.raw, "count > 10");
    assert_eq!(if_block.elifs.len(), 1);
    assert!(if_block.alternate.is_some());
}

#[test]
fn e2e_23_template_each_with_index() {
    let src = r#"<template>
  @each items -> item, index {
    <li>{index}: {item.name}</li>
  }
</template>"#;
    let file = parse(src).unwrap();
    let tmpl = file.template.unwrap();
    let each = tmpl.node.children.iter()
        .find_map(|n| match &n.node { TemplateNode::EachBlock(b) => Some(b), _ => None })
        .unwrap();
    assert_eq!(each.iterable.raw, "items");
    assert_eq!(each.item_binding, "item");
    assert_eq!(each.index_binding, Some("index".to_string()));
}

#[test]
fn e2e_24_template_await_block() {
    let src = r#"<template>
  @await loadItems() {
    loading => <p>Loading...</p>
    ok(items) => {
      <ul>Done</ul>
    }
    err(e) => <p>Error: {e}</p>
  }
</template>"#;
    let file = parse(src).unwrap();
    let tmpl = file.template.unwrap();
    let await_block = tmpl.node.children.iter()
        .find_map(|n| match &n.node { TemplateNode::AwaitBlock(b) => Some(b), _ => None })
        .unwrap();
    assert!(await_block.loading.is_some());
    assert_eq!(await_block.ok_binding, Some("items".to_string()));
    assert_eq!(await_block.err_binding, Some("e".to_string()));
}

#[test]
fn e2e_25_template_component_with_props() {
    let src = r#"<template><Counter initial={5} /><UserCard user={currentUser} @select={handleSelect} /></template>"#;
    let file = parse(src).unwrap();
    let tmpl = file.template.unwrap();
    let components: Vec<_> = tmpl.node.children.iter()
        .filter_map(|n| match &n.node { TemplateNode::Element(el) if el.is_component => Some(el), _ => None })
        .collect();
    assert_eq!(components.len(), 2);
    assert_eq!(components[0].tag, "Counter");
    assert_eq!(components[1].tag, "UserCard");
}

#[test]
fn e2e_26_template_named_slots() {
    let src = r#"<template>
  <Layout>
    <:header>
      <h1>My App</h1>
    </:header>
    <:default>
      <p>Content here</p>
    </:default>
  </Layout>
</template>"#;
    let file = parse(src).unwrap();
    let tmpl = file.template.unwrap();
    let layout = tmpl.node.children.iter()
        .find_map(|n| match &n.node { TemplateNode::Element(el) if el.tag == "Layout" => Some(el), _ => None })
        .unwrap();
    let slot_tags: Vec<_> = layout.children.iter()
        .filter_map(|n| match &n.node { TemplateNode::Element(el) if el.tag.starts_with(':') => Some(&el.tag), _ => None })
        .collect();
    assert!(slot_tags.contains(&&":header".to_string()));
    assert!(slot_tags.contains(&&":default".to_string()));
}

// ===========================================================================
// 4. CSS parsing tests
// ===========================================================================

#[test]
fn e2e_27_css_basic_rule() {
    let src = "<style>h1 { color: blue; font-size: 24px; }</style>";
    let file = parse(src).unwrap();
    let style = &file.styles[0].node;
    assert!(!style.is_global);
    match &style.rules[0].node {
        CssRule::Style(rule) => {
            assert_eq!(rule.selectors, vec!["h1"]);
            assert_eq!(rule.declarations.len(), 2);
        }
        _ => panic!("expected Style rule"),
    }
}

#[test]
fn e2e_28_css_global_style() {
    let src = "<style global>body { margin: 0; }</style>";
    let file = parse(src).unwrap();
    assert!(file.styles[0].node.is_global);
}

#[test]
fn e2e_29_css_media_query() {
    let src = "<style>@media (max-width: 768px) { .container { width: 100%; } }</style>";
    let file = parse(src).unwrap();
    match &file.styles[0].node.rules[0].node {
        CssRule::AtRule(at) => {
            assert_eq!(at.name, "media");
            assert!(!at.rules.is_empty());
        }
        _ => panic!("expected AtRule"),
    }
}

#[test]
fn e2e_30_css_multiple_style_blocks() {
    let src = r#"<style>h1 { color: blue; }</style>
<style global>body { margin: 0; }</style>"#;
    let file = parse(src).unwrap();
    assert_eq!(file.styles.len(), 2);
    assert!(!file.styles[0].node.is_global);
    assert!(file.styles[1].node.is_global);
}

// ===========================================================================
// 5. Error case tests
// ===========================================================================

#[test]
fn e2e_31_error_duplicate_template() {
    let src = "<template>a</template><template>b</template>";
    let (_, errors) = parse_with_recovery(src);
    assert!(!errors.is_empty());
}

#[test]
fn e2e_32_script_context_client() {
    let src = r#"<script context="client">count := $state(0)</script>"#;
    let file = parse(src).unwrap();
    assert_eq!(file.script.unwrap().node.context, ScriptContext::Client);
}

#[test]
fn e2e_33_script_context_server() {
    let src = r#"<script context="server">F load() { }</script>"#;
    let file = parse(src).unwrap();
    assert_eq!(file.script.unwrap().node.context, ScriptContext::Server);
}

// ===========================================================================
// 6. Full component integration tests
// ===========================================================================

#[test]
fn e2e_34_counter_component() {
    let src = r#"<script>
  count := $state(0)
  F increment() { count += 1 }
</script>

<template>
  <button @click={increment}>{count}</button>
</template>"#;
    let file = parse(src).unwrap();
    let script = file.script.unwrap();
    assert!(script.node.desugared_source.unwrap().contains("__vx_state(0)"));
    let tmpl = file.template.unwrap();
    assert!(!tmpl.node.children.is_empty());
}

#[test]
fn e2e_35_user_card_component() {
    let src = r#"<script>
  P {
    user: User
    showAvatar: bool = true
    emit select(user: User)
  }

  F handleClick() {
    emit select(user)
  }
</script>

<template>
  <div class="card" @click={handleClick}>
    @if showAvatar {
      <img src={user.avatar} />
    }
    <span>{user.name}</span>
  </div>
</template>

<style>
  .card { padding: 16px; border: 1px solid #ccc; cursor: pointer; }
  .card:hover { background: #f5f5f5; }
</style>"#;
    let (file, errors) = parse_with_recovery(src);
    assert!(errors.is_empty(), "errors: {:?}", errors);

    // Script: props + events + desugar
    let script = file.script.unwrap();
    let props = script.node.props.unwrap().node;
    assert_eq!(props.fields.len(), 2);
    assert_eq!(props.fields[0].node.name, "user");
    assert!(script.node.events.len() >= 1); // emit select from P {} and from emit call

    let desugared = script.node.desugared_source.unwrap();
    assert!(desugared.contains("S __VxProps__"));
    assert!(desugared.contains("__vx_emit(\"select\""));

    // Template: div with @click, @if, img, span
    let tmpl = file.template.unwrap();
    assert!(!tmpl.node.children.is_empty());

    // Style: 2 rules
    assert_eq!(file.styles.len(), 1);
    assert!(file.styles[0].node.rules.len() >= 2);
}

#[test]
fn e2e_36_page_with_server_load() {
    let src = r#"<script>
  #[server]
  A F load(params: RouteParams) -> PageData {
    post := await db.query("SELECT * FROM posts WHERE slug = ?", params.slug)
    PageData { post: post }
  }

  showComments := $state(false)
</script>

<template>
  <article>
    <h1>{post.title}</h1>
    <button @click={() => { showComments = !showComments }}>Toggle</button>
  </article>
</template>"#;
    let file = parse(src).unwrap();
    let desugared = file.script.unwrap().node.desugared_source.unwrap();
    assert!(desugared.contains("#[server]"));
    assert!(desugared.contains("__vx_state(false)"));
}

#[test]
fn e2e_37_desugar_combined_primitives() {
    let src = r#"<script>
  count := $state(0)
  name := $state("world")
  doubled := $derived(count * 2)
  greeting := $derived("Hello, " + name + "!")

  $effect {
    console_log("count changed: ", count)
  }
</script>"#;
    let file = parse(src).unwrap();
    let desugared = file.script.unwrap().node.desugared_source.unwrap();
    // All $-prefixed constructs are gone
    assert!(!desugared.contains("$state"));
    assert!(!desugared.contains("$derived"));
    assert!(!desugared.contains("$effect"));
    // All __vx_ replacements present
    assert!(desugared.contains("__vx_state(0)"));
    assert!(desugared.contains("__vx_state(\"world\")"));
    assert!(desugared.contains("__vx_derived(|| { count * 2 })"));
    assert!(desugared.contains("__vx_effect(||"));
}

#[test]
fn e2e_38_html_comment_in_template() {
    let src = "<template><!-- TODO: add more --><p>Hello</p></template>";
    let file = parse(src).unwrap();
    let tmpl = file.template.unwrap();
    let has_comment = tmpl.node.children.iter().any(|n| matches!(&n.node, TemplateNode::Comment(_)));
    assert!(has_comment);
}

#[test]
fn e2e_39_css_comment() {
    let src = "<style>/* reset */ body { margin: 0; }</style>";
    let file = parse(src).unwrap();
    let has_comment = file.styles[0].node.rules.iter().any(|r| matches!(&r.node, CssRule::Comment(_)));
    assert!(has_comment);
}

#[test]
fn e2e_40_template_boolean_attribute() {
    let src = "<template><input disabled /></template>";
    let file = parse(src).unwrap();
    let tmpl = file.template.unwrap();
    let input = tmpl.node.children.iter()
        .find_map(|n| match &n.node { TemplateNode::Element(el) if el.tag == "input" => Some(el), _ => None })
        .unwrap();
    let has_disabled = input.attributes.iter().any(|a| matches!(&a.node, Attribute::Static { name, value } if name == "disabled" && value.is_empty()));
    assert!(has_disabled);
}

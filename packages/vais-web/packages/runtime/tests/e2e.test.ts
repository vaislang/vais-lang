/**
 * E2E tests: Simulate vaisx-compiler codegen output running against the runtime.
 * These tests verify that the runtime helpers work together as a compiled component would use them.
 */
import { describe, it, expect, vi } from "vitest";
import {
  $$element,
  $$text,
  $$append,
  $$attr,
  $$listen,
  $$schedule,
  $$flush,
  $$set_text,
  $$anchor,
  $$create_fragment,
  $$insert_before,
  $$remove_fragment,
  $$mount,
  $$destroy,
  $$spread,
} from "../src/lib.js";

describe("E2E: Counter component (codegen simulation)", () => {
  /**
   * Simulates compiled output of:
   * ```vaisx
   * <script>
   *   count := $state(0)
   *   F increment() { count += 1 }
   * </script>
   * <template>
   *   <button @click={increment}>{count}</button>
   * </template>
   * ```
   */
  it("renders and updates a counter", async () => {
    const target = $$element("div");

    function Counter($$target: HTMLElement) {
      let count = 0;

      // DOM creation
      const button = $$element("button");
      const button_text = $$text(count);
      $$append(button, button_text);
      $$append($$target, button);

      // Update function
      function $$update() {
        $$set_text(button_text, count);
      }

      // Event + state mutation
      const cleanup0 = $$listen(button, "click", () => {
        count += 1;
        $$schedule($$update);
      });

      return {
        $$update,
        $$destroy() {
          cleanup0();
          button.remove();
        },
      };
    }

    const instance = $$mount(target, Counter);
    expect(target.innerHTML).toBe("<button>0</button>");

    // Simulate click
    (target.querySelector("button") as HTMLButtonElement).click();
    await Promise.resolve(); // flush microtask
    expect(target.innerHTML).toBe("<button>1</button>");

    // Multiple clicks in same sync batch
    (target.querySelector("button") as HTMLButtonElement).click();
    (target.querySelector("button") as HTMLButtonElement).click();
    await Promise.resolve();
    expect(target.innerHTML).toBe("<button>3</button>");

    // Destroy
    $$destroy(instance);
    expect(target.innerHTML).toBe("");
  });
});

describe("E2E: Conditional rendering (@if simulation)", () => {
  /**
   * Simulates compiled output of:
   * ```vaisx
   * <script>
   *   show := $state(true)
   * </script>
   * <template>
   *   @if show {
   *     <p>Visible</p>
   *   } @else {
   *     <p>Hidden</p>
   *   }
   * </template>
   * ```
   */
  it("switches between conditional branches", () => {
    const target = $$element("div");
    let show = true;

    const $$if_anchor0 = $$anchor();
    $$append(target, $$if_anchor0);

    let $$if_current0: Node | null = null;

    function $$if0_branch0() {
      const frag = $$create_fragment();
      const p = $$element("p");
      $$append(p, $$text("Visible"));
      $$append(frag, p);
      return p; // Return the actual DOM node for removal
    }

    function $$if0_branch1() {
      const frag = $$create_fragment();
      const p = $$element("p");
      $$append(p, $$text("Hidden"));
      $$append(frag, p);
      return p;
    }

    function $$if0_update() {
      if ($$if_current0) $$remove_fragment($$if_current0);
      $$if_current0 = show ? $$if0_branch0() : $$if0_branch1();
      $$insert_before(target, $$if_current0, $$if_anchor0);
    }

    // Initial render
    $$if0_update();
    expect(target.innerHTML).toBe("<p>Visible</p><!---->");

    // Toggle
    show = false;
    $$if0_update();
    expect(target.innerHTML).toBe("<p>Hidden</p><!---->");

    // Toggle back
    show = true;
    $$if0_update();
    expect(target.innerHTML).toBe("<p>Visible</p><!---->");
  });
});

describe("E2E: Attribute binding simulation", () => {
  it("binds dynamic class and value attributes", async () => {
    const target = $$element("div");
    let cls = "active";
    let inputValue = "hello";

    const div = $$element("div");
    $$attr(div, "class", cls);
    $$append(target, div);

    const input = $$element("input") as HTMLInputElement;
    $$attr(input, "value", inputValue);
    $$append(target, input);

    expect(div.getAttribute("class")).toBe("active");
    expect(input.value).toBe("hello");

    // Update
    cls = "inactive";
    inputValue = "world";
    $$attr(div, "class", cls);
    $$attr(input, "value", inputValue);
    expect(div.getAttribute("class")).toBe("inactive");
    expect(input.value).toBe("world");
  });
});

describe("E2E: Two-way binding simulation (:value)", () => {
  /**
   * Simulates compiled output of:
   * ```vaisx
   * <script>
   *   name := $state("world")
   * </script>
   * <template>
   *   <input :value={name} />
   *   <p>Hello, {name}!</p>
   * </template>
   * ```
   */
  it("syncs input value with state", async () => {
    const target = $$element("div");
    let name = "world";

    const input = $$element("input") as HTMLInputElement;
    $$attr(input, "value", name);
    $$append(target, input);

    const p = $$element("p");
    const p_text = $$text("Hello, " + name + "!");
    $$append(p, p_text);
    $$append(target, p);

    function $$update() {
      $$attr(input, "value", name);
      $$set_text(p_text, "Hello, " + name + "!");
    }

    // Two-way binding: input event updates state
    $$listen(input, "input", (e) => {
      name = (e.target as HTMLInputElement).value;
      $$schedule($$update);
    });

    expect(input.value).toBe("world");
    expect(p.textContent).toBe("Hello, world!");

    // Simulate user typing
    input.value = "Vais";
    input.dispatchEvent(new Event("input"));
    await Promise.resolve();
    expect(name).toBe("Vais");
    expect(p.textContent).toBe("Hello, Vais!");
  });
});

describe("E2E: Spread attributes simulation", () => {
  it("applies spread props to element", () => {
    const target = $$element("div");
    const el = $$element("button");
    $$append(target, el);

    $$spread(el, {
      class: "btn",
      id: "submit-btn",
      "data-action": "submit",
    });

    expect(el.getAttribute("class")).toBe("btn");
    expect(el.getAttribute("id")).toBe("submit-btn");
    expect(el.getAttribute("data-action")).toBe("submit");
  });
});

describe("E2E: Component lifecycle", () => {
  it("mount creates DOM, destroy cleans up", () => {
    const root = $$element("div");

    function MyComponent(target: HTMLElement) {
      const h1 = $$element("h1");
      $$append(h1, $$text("Hello"));
      $$append(target, h1);

      const cleanups: Array<() => void> = [];
      cleanups.push($$listen(h1, "click", () => {}));

      return {
        $$destroy() {
          for (const c of cleanups) c();
          h1.remove();
        },
      };
    }

    const instance = $$mount(root, MyComponent);
    expect(root.innerHTML).toBe("<h1>Hello</h1>");

    $$destroy(instance);
    expect(root.innerHTML).toBe("");
  });
});

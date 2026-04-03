import { describe, it, expect, vi } from "vitest";
import { userEvent } from "../src/user-event.js";

function makeInput(type = "text"): HTMLInputElement {
  const input = document.createElement("input");
  input.type = type;
  document.body.appendChild(input);
  return input;
}

function makeButton(): HTMLButtonElement {
  const btn = document.createElement("button");
  document.body.appendChild(btn);
  return btn;
}

describe("userEvent.click()", () => {
  it("fires mousedown, mouseup and click in order", () => {
    const btn = makeButton();
    const events: string[] = [];
    btn.addEventListener("mousedown", () => events.push("mousedown"));
    btn.addEventListener("mouseup", () => events.push("mouseup"));
    btn.addEventListener("click", () => events.push("click"));

    userEvent.click(btn);
    expect(events).toEqual(["mousedown", "mouseup", "click"]);
  });
});

describe("userEvent.dblClick()", () => {
  it("fires dblclick event", () => {
    const btn = makeButton();
    const spy = vi.fn();
    btn.addEventListener("dblclick", spy);
    userEvent.dblClick(btn);
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe("userEvent.type()", () => {
  it("updates input value character by character", async () => {
    const input = makeInput();
    await userEvent.type(input, "abc");
    expect(input.value).toBe("abc");
  });

  it("fires keydown and keyup events for each character", async () => {
    const input = makeInput();
    const keydowns: string[] = [];
    const keyups: string[] = [];
    input.addEventListener("keydown", (e) => keydowns.push((e as KeyboardEvent).key));
    input.addEventListener("keyup", (e) => keyups.push((e as KeyboardEvent).key));

    await userEvent.type(input, "hi");
    expect(keydowns).toEqual(["h", "i"]);
    expect(keyups).toEqual(["h", "i"]);
  });

  it("fires an input event for each character", async () => {
    const input = makeInput();
    const spy = vi.fn();
    input.addEventListener("input", spy);
    await userEvent.type(input, "xyz");
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("appends to existing value", async () => {
    const input = makeInput();
    input.value = "hello ";
    await userEvent.type(input, "world");
    expect(input.value).toBe("hello world");
  });
});

describe("userEvent.clear()", () => {
  it("clears the input value", () => {
    const input = makeInput();
    input.value = "some text";
    userEvent.clear(input);
    expect(input.value).toBe("");
  });

  it("fires change event after clearing", () => {
    const input = makeInput();
    input.value = "data";
    const spy = vi.fn();
    input.addEventListener("change", spy);
    userEvent.clear(input);
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe("userEvent.hover() / unhover()", () => {
  it("fires mouseover when hovering", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const spy = vi.fn();
    div.addEventListener("mouseover", spy);
    userEvent.hover(div);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("fires mouseout when unhovering", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const spy = vi.fn();
    div.addEventListener("mouseout", spy);
    userEvent.unhover(div);
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe("userEvent.tab()", () => {
  it("moves focus to the next focusable element", () => {
    // Reset body to controlled state.
    document.body.innerHTML = "";
    const a = document.createElement("input");
    a.setAttribute("tabindex", "0");
    const b = document.createElement("input");
    b.setAttribute("tabindex", "0");
    document.body.appendChild(a);
    document.body.appendChild(b);

    a.focus();
    expect(document.activeElement).toBe(a);
    userEvent.tab();
    expect(document.activeElement).toBe(b);
  });
});

describe("userEvent.selectOptions()", () => {
  it("selects the matching option by value", () => {
    const select = document.createElement("select");
    select.innerHTML = `
      <option value="a">Option A</option>
      <option value="b">Option B</option>
    `;
    document.body.appendChild(select);

    userEvent.selectOptions(select, "b");
    expect(select.value).toBe("b");
  });

  it("fires a change event after selecting", () => {
    const select = document.createElement("select");
    select.innerHTML = `<option value="x">X</option><option value="y">Y</option>`;
    document.body.appendChild(select);

    const spy = vi.fn();
    select.addEventListener("change", spy);
    userEvent.selectOptions(select, "y");
    expect(spy).toHaveBeenCalledOnce();
  });
});

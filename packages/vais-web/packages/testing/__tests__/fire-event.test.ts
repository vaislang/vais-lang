import { describe, it, expect, vi } from "vitest";
import { fireEvent } from "../src/fire-event.js";

function makeButton(): HTMLButtonElement {
  const btn = document.createElement("button");
  document.body.appendChild(btn);
  return btn;
}

function makeInput(): HTMLInputElement {
  const input = document.createElement("input");
  document.body.appendChild(input);
  return input;
}

function makeForm(): HTMLFormElement {
  const form = document.createElement("form");
  document.body.appendChild(form);
  return form;
}

describe("fireEvent", () => {
  it("fireEvent.click() triggers a click listener", () => {
    const btn = makeButton();
    const spy = vi.fn();
    btn.addEventListener("click", spy);
    fireEvent.click(btn);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("fireEvent.click() returns true when not prevented", () => {
    const btn = makeButton();
    const result = fireEvent.click(btn);
    expect(result).toBe(true);
  });

  it("fireEvent.click() returns false when event is preventDefault()-ed", () => {
    const btn = makeButton();
    btn.addEventListener("click", (e) => e.preventDefault());
    const result = fireEvent.click(btn);
    expect(result).toBe(false);
  });

  it("fireEvent.dblClick() triggers a dblclick listener", () => {
    const btn = makeButton();
    const spy = vi.fn();
    btn.addEventListener("dblclick", spy);
    fireEvent.dblClick(btn);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("fireEvent.input() triggers an input listener", () => {
    const input = makeInput();
    const spy = vi.fn();
    input.addEventListener("input", spy);
    fireEvent.input(input);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("fireEvent.change() triggers a change listener", () => {
    const input = makeInput();
    const spy = vi.fn();
    input.addEventListener("change", spy);
    fireEvent.change(input);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("fireEvent.submit() triggers a submit listener", () => {
    const form = makeForm();
    const spy = vi.fn();
    form.addEventListener("submit", spy);
    fireEvent.submit(form);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("fireEvent.keyDown() triggers a keydown listener with correct key", () => {
    const input = makeInput();
    const spy = vi.fn<[KeyboardEvent], void>();
    input.addEventListener("keydown", spy);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0].key).toBe("Enter");
  });

  it("fireEvent.keyUp() triggers a keyup listener", () => {
    const input = makeInput();
    const spy = vi.fn();
    input.addEventListener("keyup", spy);
    fireEvent.keyUp(input, { key: "a" });
    expect(spy).toHaveBeenCalledOnce();
  });

  it("fireEvent.focus() triggers a focus listener", () => {
    const input = makeInput();
    const spy = vi.fn();
    input.addEventListener("focus", spy);
    fireEvent.focus(input);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("fireEvent.blur() triggers a blur listener", () => {
    const input = makeInput();
    const spy = vi.fn();
    input.addEventListener("blur", spy);
    fireEvent.blur(input);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("fireEvent.mouseOver() triggers a mouseover listener", () => {
    const btn = makeButton();
    const spy = vi.fn();
    btn.addEventListener("mouseover", spy);
    fireEvent.mouseOver(btn);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("fireEvent.mouseOut() triggers a mouseout listener", () => {
    const btn = makeButton();
    const spy = vi.fn();
    btn.addEventListener("mouseout", spy);
    fireEvent.mouseOut(btn);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("fireEvent.custom() dispatches a custom event with detail data", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const spy = vi.fn<[CustomEvent<{ value: number }>], void>();
    div.addEventListener("my-event", spy as EventListenerOrEventListenerObject);
    fireEvent.custom(div, "my-event", { value: 42 });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0].detail).toEqual({ value: 42 });
  });

  it("events bubble up to parent elements", () => {
    const parent = document.createElement("div");
    const child = document.createElement("button");
    parent.appendChild(child);
    document.body.appendChild(parent);

    const spy = vi.fn();
    parent.addEventListener("click", spy);
    fireEvent.click(child);
    expect(spy).toHaveBeenCalledOnce();
  });
});

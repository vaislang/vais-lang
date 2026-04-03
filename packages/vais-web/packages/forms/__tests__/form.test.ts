/**
 * @vaisx/forms — createForm() tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createForm } from "../src/form.js";
import { required, email, minLength } from "../src/validation.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBlurEvent(): Event {
  return new Event("blur");
}

/**
 * Create a synthetic change event whose `target` is a real DOM input element.
 * We dispatch on the actual element so that e.target is correctly set by jsdom.
 */
function makeChangeEvent(value: string, type = "text"): Event {
  const input = document.createElement("input");
  document.body.appendChild(input);
  input.type = type;
  input.value = value;
  const event = new Event("change", { bubbles: true });
  input.dispatchEvent(event);
  document.body.removeChild(input);
  // Return an event whose target points to our input
  return Object.defineProperty(new Event("change"), "target", {
    writable: false,
    value: input,
  });
}

function makeCheckboxEvent(checked: boolean): Event {
  const input = document.createElement("input");
  document.body.appendChild(input);
  input.type = "checkbox";
  input.checked = checked;
  const event = new Event("change", { bubbles: true });
  input.dispatchEvent(event);
  document.body.removeChild(input);
  return Object.defineProperty(new Event("change"), "target", {
    writable: false,
    value: input,
  });
}

// ─── Basic state ──────────────────────────────────────────────────────────────

describe("createForm — initial state", () => {
  it("reflects defaultValues in state.values", () => {
    const form = createForm({ defaultValues: { name: "Alice", age: 30 } });
    expect(form.state.values.name).toBe("Alice");
    expect(form.state.values.age).toBe(30);
  });

  it("starts with empty errors", () => {
    const form = createForm({ defaultValues: { name: "" } });
    expect(Object.keys(form.state.errors)).toHaveLength(0);
  });

  it("starts with no touched fields", () => {
    const form = createForm({ defaultValues: { name: "" } });
    expect(Object.keys(form.state.touched)).toHaveLength(0);
  });

  it("isSubmitting starts as false", () => {
    const form = createForm({ defaultValues: { name: "" } });
    expect(form.state.isSubmitting).toBe(false);
  });

  it("isValid starts as true (no validation errors)", () => {
    const form = createForm({ defaultValues: { name: "" } });
    expect(form.state.isValid).toBe(true);
  });

  it("isDirty starts as false", () => {
    const form = createForm({ defaultValues: { name: "Alice" } });
    expect(form.state.isDirty).toBe(false);
  });
});

// ─── register ─────────────────────────────────────────────────────────────────

describe("createForm — register()", () => {
  it("returns a FieldBinding with the correct name", () => {
    const form = createForm({ defaultValues: { email: "" } });
    const binding = form.register("email");
    expect(binding.name).toBe("email");
  });

  it("FieldBinding.value reflects the current field value", () => {
    const form = createForm({ defaultValues: { email: "test@example.com" } });
    const binding = form.register("email");
    expect(binding.value).toBe("test@example.com");
  });

  it("onChange updates the field value in state", () => {
    const form = createForm({ defaultValues: { email: "" } });
    const binding = form.register("email");
    binding.onChange(makeChangeEvent("new@example.com"));
    expect(form.state.values.email).toBe("new@example.com");
  });

  it("onBlur marks the field as touched", () => {
    const form = createForm({ defaultValues: { email: "" } });
    const binding = form.register("email");
    binding.onBlur();
    expect(form.state.touched.email).toBe(true);
  });

  it("checkbox onChange updates a boolean value", () => {
    const form = createForm({ defaultValues: { agree: false } });
    const binding = form.register("agree");
    binding.onChange(makeCheckboxEvent(true));
    expect(form.state.values.agree).toBe(true);
  });

  it("isDirty becomes true after a change", () => {
    const form = createForm({ defaultValues: { name: "Alice" } });
    const binding = form.register("name");
    binding.onChange(makeChangeEvent("Bob"));
    expect(form.state.isDirty).toBe(true);
  });
});

// ─── setValue ─────────────────────────────────────────────────────────────────

describe("createForm — setValue()", () => {
  it("updates the field value directly", () => {
    const form = createForm({ defaultValues: { count: 0 } });
    form.setValue("count", 42);
    expect(form.state.values.count).toBe(42);
  });

  it("marks form as dirty when value differs from default", () => {
    const form = createForm({ defaultValues: { name: "Alice" } });
    form.setValue("name", "Bob");
    expect(form.state.isDirty).toBe(true);
  });
});

// ─── setError / clearErrors ───────────────────────────────────────────────────

describe("createForm — setError / clearErrors", () => {
  it("setError adds a field error", () => {
    const form = createForm({ defaultValues: { email: "" } });
    form.setError("email", "Email is invalid");
    expect(form.state.errors.email).toBe("Email is invalid");
    expect(form.state.isValid).toBe(false);
  });

  it("clearErrors removes all errors", () => {
    const form = createForm({ defaultValues: { email: "", name: "" } });
    form.setError("email", "Bad email");
    form.setError("name", "Name required");
    form.clearErrors();
    expect(Object.keys(form.state.errors)).toHaveLength(0);
    expect(form.state.isValid).toBe(true);
  });
});

// ─── reset ────────────────────────────────────────────────────────────────────

describe("createForm — reset()", () => {
  it("restores all values to defaultValues", () => {
    const form = createForm({ defaultValues: { name: "Alice", score: 0 } });
    form.setValue("name", "Bob");
    form.setValue("score", 99);
    form.reset();
    expect(form.state.values.name).toBe("Alice");
    expect(form.state.values.score).toBe(0);
  });

  it("clears errors on reset", () => {
    const form = createForm({ defaultValues: { name: "" } });
    form.setError("name", "Required");
    form.reset();
    expect(Object.keys(form.state.errors)).toHaveLength(0);
  });

  it("clears touched on reset", () => {
    const form = createForm({ defaultValues: { name: "" } });
    const binding = form.register("name");
    binding.onBlur();
    form.reset();
    expect(Object.keys(form.state.touched)).toHaveLength(0);
  });

  it("isDirty becomes false after reset", () => {
    const form = createForm({ defaultValues: { name: "Alice" } });
    form.setValue("name", "Bob");
    form.reset();
    expect(form.state.isDirty).toBe(false);
  });
});

// ─── handleSubmit ─────────────────────────────────────────────────────────────

describe("createForm — handleSubmit()", () => {
  it("calls onSubmit with current values when valid", async () => {
    const onSubmit = vi.fn();
    const form = createForm({
      defaultValues: { name: "Alice" },
      onSubmit,
    });
    await form.handleSubmit();
    expect(onSubmit).toHaveBeenCalledWith({ name: "Alice" });
  });

  it("does NOT call onSubmit when validation fails", async () => {
    const onSubmit = vi.fn();
    const form = createForm({
      defaultValues: { email: "" },
      validation: { email: [required(), email()] },
      onSubmit,
    });
    await form.handleSubmit();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("sets errors on failed validation", async () => {
    const form = createForm({
      defaultValues: { email: "bad" },
      validation: { email: email() },
    });
    await form.handleSubmit();
    expect(form.state.errors.email).toBeDefined();
  });

  it("marks all fields as touched on submit attempt", async () => {
    const form = createForm({
      defaultValues: { name: "", email: "" },
      validation: { name: required() },
    });
    await form.handleSubmit();
    expect(form.state.touched.name).toBe(true);
    expect(form.state.touched.email).toBe(true);
  });

  it("calls e.preventDefault() when an event is passed", async () => {
    const form = createForm({ defaultValues: { x: "" } });
    const e = { preventDefault: vi.fn() } as unknown as Event;
    await form.handleSubmit(e);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("sets isSubmitting to true while submitting and false after", async () => {
    const states: boolean[] = [];
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn(() => new Promise<void>((res) => { resolveSubmit = res; }));

    const form = createForm({ defaultValues: { x: "y" }, onSubmit });

    form.subscribe((s) => states.push(s.isSubmitting));

    const submitPromise = form.handleSubmit();
    // isSubmitting should be true while we wait
    resolveSubmit();
    await submitPromise;

    expect(states).toContain(true);
    expect(form.state.isSubmitting).toBe(false);
  });
});

// ─── subscribe ────────────────────────────────────────────────────────────────

describe("createForm — subscribe()", () => {
  it("calls the callback when state changes", () => {
    const form = createForm({ defaultValues: { name: "" } });
    const cb = vi.fn();
    form.subscribe(cb);
    form.setValue("name", "Alice");
    expect(cb).toHaveBeenCalled();
  });

  it("returns an unsubscribe function that stops notifications", () => {
    const form = createForm({ defaultValues: { name: "" } });
    const cb = vi.fn();
    const unsub = form.subscribe(cb);
    unsub();
    form.setValue("name", "Alice");
    expect(cb).not.toHaveBeenCalled();
  });

  it("multiple subscribers are all notified", () => {
    const form = createForm({ defaultValues: { x: 0 } });
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    form.subscribe(cb1);
    form.subscribe(cb2);
    form.setValue("x", 1);
    expect(cb1).toHaveBeenCalled();
    expect(cb2).toHaveBeenCalled();
  });
});

// ─── Validation on blur / change ──────────────────────────────────────────────

describe("createForm — validation triggers", () => {
  it("shows error on blur for a required field", () => {
    const form = createForm({
      defaultValues: { name: "" },
      validation: { name: required() },
    });
    const binding = form.register("name");
    binding.onBlur();
    expect(form.state.errors.name).toBeDefined();
  });

  it("clears error when field becomes valid after blur + change", () => {
    const form = createForm({
      defaultValues: { name: "" },
      validation: { name: required() },
    });
    const binding = form.register("name");
    binding.onBlur(); // trigger validation (will fail)
    expect(form.state.errors.name).toBeDefined();
    binding.onChange(makeChangeEvent("Alice")); // now valid
    expect(form.state.errors.name).toBeUndefined();
  });

  it("re-validates on change only if already touched", () => {
    const form = createForm({
      defaultValues: { email: "" },
      validation: { email: email() },
    });
    const binding = form.register("email");
    // Change without touching — no error yet
    binding.onChange(makeChangeEvent("bad"));
    expect(form.state.errors.email).toBeUndefined();
    // Blur → touch → validate
    binding.onBlur();
    expect(form.state.errors.email).toBeDefined();
  });
});

// ─── Per-field validation isolation ──────────────────────────────────────────

describe("createForm — per-field validation on change", () => {
  it("changing one field does not trigger validation of other fields", () => {
    // Both fields have validation rules
    const validateEmail = vi.fn((value: unknown) =>
      typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    );
    const validateName = vi.fn((value: unknown) =>
      typeof value === "string" && value.trim().length > 0,
    );

    const form = createForm({
      defaultValues: { email: "", name: "" },
      validation: {
        email: [{ message: "Invalid email", validate: validateEmail }],
        name: [{ message: "Name required", validate: validateName }],
      },
    });

    const emailBinding = form.register("email");

    // Touch and change email — only email's rule should run
    emailBinding.onBlur();
    validateEmail.mockClear();
    validateName.mockClear();

    emailBinding.onChange(makeChangeEvent("bad-email"));

    // email rule ran once for the changed field
    expect(validateEmail).toHaveBeenCalledTimes(1);
    // name rule must NOT have been invoked
    expect(validateName).not.toHaveBeenCalled();
  });

  it("handleSubmit validates all fields", async () => {
    const validateEmail = vi.fn(() => true);
    const validateName = vi.fn(() => true);

    const form = createForm({
      defaultValues: { email: "a@b.com", name: "Alice" },
      validation: {
        email: [{ message: "Invalid email", validate: validateEmail }],
        name: [{ message: "Name required", validate: validateName }],
      },
      onSubmit: vi.fn(),
    });

    await form.handleSubmit();

    expect(validateEmail).toHaveBeenCalled();
    expect(validateName).toHaveBeenCalled();
  });
});

// ─── minLength rule in form ───────────────────────────────────────────────────

describe("createForm — minLength rule integration", () => {
  it("shows error when value is shorter than minLength after blur", () => {
    const form = createForm({
      defaultValues: { password: "" },
      validation: { password: [required(), minLength(8)] },
    });
    const binding = form.register("password");
    binding.onChange(makeChangeEvent("short"));
    binding.onBlur();
    expect(form.state.errors.password).toBe("Must be at least 8 characters");
  });

  it("clears error when password meets the length requirement", () => {
    const form = createForm({
      defaultValues: { password: "" },
      validation: { password: [required(), minLength(8)] },
    });
    const binding = form.register("password");
    binding.onBlur();
    binding.onChange(makeChangeEvent("longpassword123"));
    expect(form.state.errors.password).toBeUndefined();
  });
});

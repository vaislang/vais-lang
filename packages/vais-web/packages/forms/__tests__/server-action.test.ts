/**
 * @vaisx/forms — server action integration tests
 */

import { describe, it, expect, vi } from "vitest";
import { createForm } from "../src/form.js";
import {
  createServerAction,
  applyServerErrors,
  withServerAction,
} from "../src/server-action.js";
import type { ServerActionResult } from "../src/types.js";

// ─── createServerAction ───────────────────────────────────────────────────────

describe("createServerAction — success path", () => {
  it("calls onSuccess when the action returns success: true", async () => {
    const form = createForm({ defaultValues: { email: "a@a.com" } });
    const onSuccess = vi.fn();
    const controller = createServerAction(form, {
      action: async () => ({ success: true }),
      onSuccess,
    });
    await controller.submit({ email: "a@a.com" });
    expect(onSuccess).toHaveBeenCalledWith({ success: true });
  });

  it("globalError is undefined after a successful action", async () => {
    const form = createForm({ defaultValues: { email: "a@a.com" } });
    const controller = createServerAction(form, {
      action: async () => ({ success: true }),
    });
    await controller.submit({ email: "a@a.com" });
    expect(controller.globalError).toBeUndefined();
  });
});

describe("createServerAction — error path", () => {
  it("maps server field errors to form errors", async () => {
    const form = createForm({ defaultValues: { email: "" } });
    const action = async (): Promise<ServerActionResult> => ({
      success: false,
      errors: { email: "Email already registered" },
    });
    const controller = createServerAction(form, { action });
    await controller.submit({ email: "duplicate@test.com" });
    expect(form.state.errors.email).toBe("Email already registered");
  });

  it("sets globalError when the server returns a message", async () => {
    const form = createForm({ defaultValues: { email: "" } });
    const controller = createServerAction(form, {
      action: async () => ({ success: false, message: "Server error" }),
    });
    await controller.submit({});
    expect(controller.globalError).toBe("Server error");
  });

  it("calls onError when action returns success: false", async () => {
    const form = createForm({ defaultValues: { x: "" } });
    const onError = vi.fn();
    const controller = createServerAction(form, {
      action: async () => ({ success: false, message: "Fail" }),
      onError,
    });
    await controller.submit({});
    expect(onError).toHaveBeenCalled();
  });

  it("captures thrown errors as globalError", async () => {
    const form = createForm({ defaultValues: { x: "" } });
    const controller = createServerAction(form, {
      action: async () => { throw new Error("Network failure"); },
    });
    await controller.submit({});
    expect(controller.globalError).toBe("Network failure");
  });

  it("clears previous field errors before a new submission", async () => {
    const form = createForm({ defaultValues: { email: "" } });
    form.setError("email", "Old error");
    const controller = createServerAction(form, {
      action: async () => ({ success: true }),
    });
    await controller.submit({ email: "ok@test.com" });
    expect(form.state.errors.email).toBeUndefined();
  });
});

// ─── applyServerErrors ────────────────────────────────────────────────────────

describe("applyServerErrors", () => {
  it("sets each error on the correct form field", () => {
    const form = createForm({ defaultValues: { username: "", email: "" } });
    applyServerErrors(form, {
      username: "Username taken",
      email: "Email invalid",
    });
    expect(form.state.errors.username).toBe("Username taken");
    expect(form.state.errors.email).toBe("Email invalid");
  });

  it("does not affect fields not in the error map", () => {
    const form = createForm({ defaultValues: { name: "Alice", age: 30 } });
    applyServerErrors(form, { name: "Name taken" });
    expect(form.state.errors.age).toBeUndefined();
  });
});

// ─── withServerAction ─────────────────────────────────────────────────────────

describe("withServerAction", () => {
  it("calls onSuccess when action returns success: true", async () => {
    const form = createForm({ defaultValues: { value: "" } });
    const onSuccess = vi.fn();
    const submitFn = withServerAction(
      async () => ({ success: true }),
      { onSuccess },
    );
    await submitFn({ value: "test" }, form);
    expect(onSuccess).toHaveBeenCalled();
  });

  it("maps field errors when action returns errors", async () => {
    const form = createForm({ defaultValues: { code: "" } });
    const submitFn = withServerAction(async () => ({
      success: false,
      errors: { code: "Invalid code" },
    }));
    await submitFn({ code: "bad" }, form);
    expect(form.state.errors.code).toBe("Invalid code");
  });

  it("calls onError when action fails", async () => {
    const form = createForm({ defaultValues: { x: "" } });
    const onError = vi.fn();
    const submitFn = withServerAction(
      async () => ({ success: false, message: "Rejected" }),
      { onError },
    );
    await submitFn({ x: "" }, form);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it("calls onFieldError for each field error", async () => {
    const form = createForm({ defaultValues: { email: "" } });
    const onFieldError = vi.fn();
    const submitFn = withServerAction(
      async () => ({ success: false, errors: { email: "Bad email" } }),
      { onFieldError },
    );
    await submitFn({ email: "bad" }, form);
    expect(onFieldError).toHaveBeenCalledWith("email", "Bad email");
  });
});

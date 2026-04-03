import { describe, it, expect, vi } from "vitest";
import { waitFor, waitForElementToBeRemoved } from "../src/wait-for.js";

describe("waitFor()", () => {
  it("resolves immediately if callback succeeds on the first try", async () => {
    const result = await waitFor(() => 42);
    expect(result).toBe(42);
  });

  it("retries until callback stops throwing", async () => {
    let attempts = 0;
    const result = await waitFor(() => {
      attempts++;
      if (attempts < 3) throw new Error("not yet");
      return "done";
    }, { interval: 10 });
    expect(result).toBe("done");
    expect(attempts).toBeGreaterThanOrEqual(3);
  });

  it("throws a timeout error when callback never succeeds", async () => {
    await expect(
      waitFor(() => { throw new Error("always fails"); }, { timeout: 100, interval: 20 }),
    ).rejects.toThrow(/timed out/i);
  });

  it("resolves with the value returned by an async callback", async () => {
    const result = await waitFor(async () => {
      await Promise.resolve();
      return "async-value";
    });
    expect(result).toBe("async-value");
  });

  it("uses the last error message in the timeout error", async () => {
    await expect(
      waitFor(() => { throw new Error("specific problem"); }, { timeout: 100, interval: 20 }),
    ).rejects.toThrow("specific problem");
  });

  it("works with DOM assertions — resolves when element appears", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    setTimeout(() => {
      container.innerHTML = `<span>ready</span>`;
    }, 30);

    const el = await waitFor(() => {
      const span = container.querySelector("span");
      if (!span) throw new Error("not ready");
      return span;
    }, { timeout: 500, interval: 15 });

    expect(el.textContent).toBe("ready");
  });

  it("supports timeout option", async () => {
    const start = Date.now();
    await expect(
      waitFor(() => { throw new Error("fail"); }, { timeout: 150, interval: 50 }),
    ).rejects.toThrow();
    expect(Date.now() - start).toBeGreaterThanOrEqual(100);
  });
});

describe("waitForElementToBeRemoved()", () => {
  it("resolves when the element is removed", async () => {
    const container = document.createElement("div");
    const el = document.createElement("div");
    el.setAttribute("data-testid", "removable");
    container.appendChild(el);
    document.body.appendChild(container);

    setTimeout(() => {
      el.parentNode?.removeChild(el);
    }, 30);

    await waitForElementToBeRemoved(
      () => container.querySelector<HTMLElement>("[data-testid='removable']"),
      { timeout: 500, interval: 15 },
    );

    expect(container.querySelector("[data-testid='removable']")).toBeNull();
  });

  it("throws if the element is not initially present", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    await expect(
      waitForElementToBeRemoved(() => container.querySelector<HTMLElement>("span")),
    ).rejects.toThrow(/initially/);
  });

  it("throws if the element is never removed", async () => {
    const container = document.createElement("div");
    const el = document.createElement("span");
    container.appendChild(el);
    document.body.appendChild(container);

    await expect(
      waitForElementToBeRemoved(() => container.querySelector<HTMLElement>("span"), {
        timeout: 100,
        interval: 20,
      }),
    ).rejects.toThrow();
  });
});

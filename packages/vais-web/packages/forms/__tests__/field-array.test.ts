/**
 * @vaisx/forms — useFieldArray() tests
 */

import { describe, it, expect } from "vitest";
import { createForm } from "../src/form.js";
import { useFieldArray } from "../src/field-array.js";

type Tag = { label: string };

function makeTagForm(initial: Tag[] = []) {
  return createForm({ defaultValues: { tags: initial as Tag[] } });
}

// ─── append ───────────────────────────────────────────────────────────────────

describe("useFieldArray — append", () => {
  it("appends a single item", () => {
    const form = makeTagForm();
    const arr = useFieldArray({ form, name: "tags" });
    arr.append({ label: "alpha" });
    expect(arr.fields).toEqual([{ label: "alpha" }]);
  });

  it("appends multiple items at once", () => {
    const form = makeTagForm([{ label: "a" }]);
    const arr = useFieldArray({ form, name: "tags" });
    arr.append([{ label: "b" }, { label: "c" }]);
    expect(arr.fields).toHaveLength(3);
    expect(arr.fields[2]).toEqual({ label: "c" });
  });

  it("reflects appended items in form state", () => {
    const form = makeTagForm();
    const arr = useFieldArray({ form, name: "tags" });
    arr.append({ label: "x" });
    expect((form.state.values.tags as Tag[]).length).toBe(1);
  });
});

// ─── remove ───────────────────────────────────────────────────────────────────

describe("useFieldArray — remove", () => {
  it("removes the item at the given index", () => {
    const form = makeTagForm([{ label: "a" }, { label: "b" }, { label: "c" }]);
    const arr = useFieldArray({ form, name: "tags" });
    arr.remove(1);
    expect(arr.fields).toEqual([{ label: "a" }, { label: "c" }]);
  });

  it("does nothing for an out-of-bounds index", () => {
    const form = makeTagForm([{ label: "a" }]);
    const arr = useFieldArray({ form, name: "tags" });
    arr.remove(10);
    expect(arr.fields).toHaveLength(1);
  });

  it("does nothing for a negative index", () => {
    const form = makeTagForm([{ label: "a" }]);
    const arr = useFieldArray({ form, name: "tags" });
    arr.remove(-1);
    expect(arr.fields).toHaveLength(1);
  });
});

// ─── swap ─────────────────────────────────────────────────────────────────────

describe("useFieldArray — swap", () => {
  it("swaps two items", () => {
    const form = makeTagForm([{ label: "a" }, { label: "b" }, { label: "c" }]);
    const arr = useFieldArray({ form, name: "tags" });
    arr.swap(0, 2);
    expect(arr.fields[0]).toEqual({ label: "c" });
    expect(arr.fields[2]).toEqual({ label: "a" });
  });

  it("does nothing for out-of-bounds indices", () => {
    const form = makeTagForm([{ label: "a" }, { label: "b" }]);
    const arr = useFieldArray({ form, name: "tags" });
    const before = [...arr.fields];
    arr.swap(0, 10);
    expect(arr.fields).toEqual(before);
  });
});

// ─── move ─────────────────────────────────────────────────────────────────────

describe("useFieldArray — move", () => {
  it("moves an item from one index to another", () => {
    const form = makeTagForm([{ label: "a" }, { label: "b" }, { label: "c" }]);
    const arr = useFieldArray({ form, name: "tags" });
    arr.move(0, 2);
    expect(arr.fields).toEqual([{ label: "b" }, { label: "c" }, { label: "a" }]);
  });

  it("does nothing for out-of-bounds indices", () => {
    const form = makeTagForm([{ label: "a" }]);
    const arr = useFieldArray({ form, name: "tags" });
    const before = [...arr.fields];
    arr.move(0, 99);
    expect(arr.fields).toEqual(before);
  });
});

// ─── insert ───────────────────────────────────────────────────────────────────

describe("useFieldArray — insert", () => {
  it("inserts an item at the given index", () => {
    const form = makeTagForm([{ label: "a" }, { label: "c" }]);
    const arr = useFieldArray({ form, name: "tags" });
    arr.insert(1, { label: "b" });
    expect(arr.fields).toEqual([{ label: "a" }, { label: "b" }, { label: "c" }]);
  });

  it("clamps to start when index is negative", () => {
    const form = makeTagForm([{ label: "a" }]);
    const arr = useFieldArray({ form, name: "tags" });
    arr.insert(-5, { label: "x" });
    expect(arr.fields[0]).toEqual({ label: "x" });
  });

  it("clamps to end when index exceeds length", () => {
    const form = makeTagForm([{ label: "a" }]);
    const arr = useFieldArray({ form, name: "tags" });
    arr.insert(100, { label: "z" });
    expect(arr.fields[arr.fields.length - 1]).toEqual({ label: "z" });
  });
});

// ─── prepend ──────────────────────────────────────────────────────────────────

describe("useFieldArray — prepend", () => {
  it("prepends a single item to the beginning", () => {
    const form = makeTagForm([{ label: "b" }]);
    const arr = useFieldArray({ form, name: "tags" });
    arr.prepend({ label: "a" });
    expect(arr.fields[0]).toEqual({ label: "a" });
    expect(arr.fields).toHaveLength(2);
  });

  it("prepends multiple items preserving order", () => {
    const form = makeTagForm([{ label: "c" }]);
    const arr = useFieldArray({ form, name: "tags" });
    arr.prepend([{ label: "a" }, { label: "b" }]);
    expect(arr.fields).toEqual([{ label: "a" }, { label: "b" }, { label: "c" }]);
  });
});

// ─── replace ──────────────────────────────────────────────────────────────────

describe("useFieldArray — replace", () => {
  it("replaces all items", () => {
    const form = makeTagForm([{ label: "a" }, { label: "b" }]);
    const arr = useFieldArray({ form, name: "tags" });
    arr.replace([{ label: "x" }, { label: "y" }, { label: "z" }]);
    expect(arr.fields).toEqual([{ label: "x" }, { label: "y" }, { label: "z" }]);
  });

  it("can replace with an empty array", () => {
    const form = makeTagForm([{ label: "a" }]);
    const arr = useFieldArray({ form, name: "tags" });
    arr.replace([]);
    expect(arr.fields).toHaveLength(0);
  });
});

// ─── fields getter ────────────────────────────────────────────────────────────

describe("useFieldArray — fields getter", () => {
  it("always returns the latest state from the form", () => {
    const form = makeTagForm();
    const arr = useFieldArray({ form, name: "tags" });
    expect(arr.fields).toHaveLength(0);
    arr.append({ label: "new" });
    expect(arr.fields).toHaveLength(1);
  });

  it("starts with an empty array when form default is not set", () => {
    const form = createForm({ defaultValues: { tags: [] as Tag[] } });
    const arr = useFieldArray({ form, name: "tags" });
    expect(arr.fields).toEqual([]);
  });
});

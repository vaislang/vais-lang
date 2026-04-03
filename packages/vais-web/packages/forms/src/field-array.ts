/**
 * useFieldArray() — dynamic list management for @vaisx/forms.
 *
 * Provides append, remove, swap, move, insert, prepend and replace operations
 * on a field that holds an array value inside a parent form.
 *
 * The field array keeps its own internal list and notifies the parent form via
 * setValue() so that the form's validation and dirty/touched tracking continues
 * to work correctly.
 */

import type { FieldValues, UseFieldArrayReturn, UseFormReturn } from "./types.js";

/**
 * Options for useFieldArray().
 */
export interface FieldArrayOptions<
  TFieldValues extends FieldValues,
  TName extends keyof TFieldValues,
> {
  /** The parent form controller. */
  form: UseFormReturn<TFieldValues>;
  /** The name of the field in the form that holds the array. */
  name: TName;
}

/**
 * Create a field array controller for a list field inside a form.
 *
 * ```ts
 * const { fields, append, remove } = useFieldArray({ form, name: 'tags' });
 * ```
 */
export function useFieldArray<
  TFieldValues extends FieldValues,
  TName extends keyof TFieldValues,
  TItem = TFieldValues[TName] extends (infer U)[] ? U : unknown,
>(
  options: FieldArrayOptions<TFieldValues, TName>,
): UseFieldArrayReturn<TItem> {
  const { form, name } = options;

  // Initialise from the current form value (must be an array)
  function getCurrentItems(): TItem[] {
    const raw = form.state.values[name];
    return Array.isArray(raw) ? [...raw] as TItem[] : [];
  }

  function commit(items: TItem[]): void {
    form.setValue(name, items as TFieldValues[TName]);
  }

  function append(value: TItem | TItem[]): void {
    const current = getCurrentItems();
    const toAdd = Array.isArray(value) ? value : [value];
    commit([...current, ...toAdd]);
  }

  function remove(index: number): void {
    const current = getCurrentItems();
    if (index < 0 || index >= current.length) return;
    const next = [...current];
    next.splice(index, 1);
    commit(next);
  }

  function swap(indexA: number, indexB: number): void {
    const current = getCurrentItems();
    if (
      indexA < 0 ||
      indexB < 0 ||
      indexA >= current.length ||
      indexB >= current.length
    ) {
      return;
    }
    const next = [...current];
    const tmp = next[indexA];
    next[indexA] = next[indexB];
    next[indexB] = tmp;
    commit(next);
  }

  function move(from: number, to: number): void {
    const current = getCurrentItems();
    if (
      from < 0 ||
      to < 0 ||
      from >= current.length ||
      to >= current.length
    ) {
      return;
    }
    const next = [...current];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    commit(next);
  }

  function insert(index: number, value: TItem): void {
    const current = getCurrentItems();
    const clampedIndex = Math.max(0, Math.min(index, current.length));
    const next = [...current];
    next.splice(clampedIndex, 0, value);
    commit(next);
  }

  function prepend(value: TItem | TItem[]): void {
    const current = getCurrentItems();
    const toAdd = Array.isArray(value) ? value : [value];
    commit([...toAdd, ...current]);
  }

  function replace(items: TItem[]): void {
    commit([...items]);
  }

  // Return an object whose `fields` getter always reads the latest values
  const controller: UseFieldArrayReturn<TItem> = {
    get fields() {
      return getCurrentItems();
    },
    append,
    remove,
    swap,
    move,
    insert,
    prepend,
    replace,
  };

  return controller;
}

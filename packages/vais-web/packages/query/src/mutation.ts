/**
 * createMutation — reactive mutation primitive for @vaisx/query.
 *
 * Manages the lifecycle of a single async side-effect (POST, PUT, DELETE, …)
 * and exposes reactive state (isLoading, isError, data, …).
 *
 * Usage:
 *   const createPost = createMutation({
 *     mutationFn: (body) => fetch("/api/posts", { method: "POST", body: JSON.stringify(body) }).then(r => r.json()),
 *     onSuccess: (data) => { console.log("Created:", data); },
 *   });
 *
 *   createPost.mutate({ title: "Hello" });
 *   createPost.isLoading; // true while in-flight
 *   createPost.data;      // Post | undefined after success
 */

import { createSignal } from "@vaisx/runtime";
import type { MutationOptions, MutationResult, MutationStatus } from "./types.js";

// ─── createMutation ───────────────────────────────────────────────────────────

/**
 * Create a reactive mutation with full lifecycle callbacks.
 *
 * @param options - Mutation configuration including mutationFn and callbacks.
 * @returns A MutationResult object with reactive getters and mutate methods.
 */
export function createMutation<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TContext = unknown,
>(
  options: MutationOptions<TData, TError, TVariables, TContext>,
): MutationResult<TData, TError, TVariables, TContext> {
  // ── Reactive signals ────────────────────────────────────────────────────────
  const $data      = createSignal<TData | undefined>(undefined);
  const $error     = createSignal<TError | null>(null);
  const $status    = createSignal<MutationStatus>("idle");

  // ── Core mutation executor ──────────────────────────────────────────────────
  async function execute(variables: TVariables): Promise<TData> {
    $status.set("loading");
    $error.set(null);

    // onMutate — may return a context for optimistic updates
    let context: TContext | undefined;
    try {
      context = await Promise.resolve(options.onMutate?.(variables));
    } catch {
      // If onMutate fails, proceed without context
      context = undefined;
    }

    const retryCount = options.retry === false ? 0 : (options.retry ?? 0);
    const retryDelay = options.retryDelay ?? 0;

    let lastError: unknown;
    let succeeded = false;
    let result: TData | undefined;

    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        result    = await options.mutationFn(variables);
        succeeded = true;
        break;
      } catch (err) {
        lastError = err;
        if (attempt < retryCount && retryDelay > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    }

    if (succeeded && result !== undefined) {
      $data.set(result);
      $status.set("success");

      try {
        await Promise.resolve(options.onSuccess?.(result, variables, context));
      } catch {
        // suppress onSuccess errors to avoid masking the mutation result
      }
      try {
        await Promise.resolve(options.onSettled?.(result, null, variables, context));
      } catch {
        // suppress
      }

      return result;
    } else {
      $error.set(lastError as TError);
      $status.set("error");

      try {
        await Promise.resolve(options.onError?.(lastError as TError, variables, context));
      } catch {
        // suppress
      }
      try {
        await Promise.resolve(options.onSettled?.(undefined, lastError as TError, variables, context));
      } catch {
        // suppress
      }

      throw lastError;
    }
  }

  // ── Build MutationResult ────────────────────────────────────────────────────
  const mutationResult: MutationResult<TData, TError, TVariables, TContext> = {
    mutate(variables: TVariables): void {
      void execute(variables);
    },

    mutateAsync(variables: TVariables): Promise<TData> {
      return execute(variables);
    },

    get data()      { return $data(); },
    get error()     { return $error(); },
    get status()    { return $status(); },
    get isLoading() { return $status() === "loading"; },
    get isError()   { return $status() === "error"; },
    get isSuccess() { return $status() === "success"; },
    get isIdle()    { return $status() === "idle"; },

    reset(): void {
      $data.set(undefined);
      $error.set(null);
      $status.set("idle");
    },
  };

  return mutationResult;
}

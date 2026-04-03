/**
 * RuleEngine — core accessibility scanning engine for @vaisx/a11y.
 *
 * Design: axe-core-style; rules are registered independently and the engine
 * queries the DOM, runs each rule against each matching node, and produces
 * a structured A11yReport.
 */

import type { A11yRule, A11yConfig, A11yReport, Violation } from "./types.js";

/**
 * Options accepted by RuleEngine.run().
 * Allows per-scan overrides of the base config.
 */
export interface RunOptions {
  /** Root element to scan (defaults to document.documentElement). */
  root?: Element | Document;
  /** CSS selector used to collect candidate nodes (defaults to "*"). */
  selector?: string;
  /** Additional rules to merge for this run only. */
  extraRules?: A11yRule[];
}

/**
 * RuleEngine manages a registry of A11yRules and orchestrates DOM scanning.
 *
 * Usage:
 * ```ts
 * const engine = new RuleEngine({ rules: builtinRules, level: "AA" });
 * const report = engine.run({ root: document.body });
 * ```
 */
export class RuleEngine {
  private readonly rules: Map<string, A11yRule> = new Map();
  private readonly config: A11yConfig;

  constructor(config: A11yConfig) {
    this.config = config;
    for (const rule of config.rules) {
      this.rules.set(rule.id, rule);
    }
  }

  // ─── Rule Registration ──────────────────────────────────────────────────────

  /**
   * Register a single rule.
   * Overwrites any existing rule with the same id.
   */
  addRule(rule: A11yRule): this {
    this.rules.set(rule.id, rule);
    return this;
  }

  /**
   * Register multiple rules at once.
   */
  addRules(rules: A11yRule[]): this {
    for (const rule of rules) {
      this.addRule(rule);
    }
    return this;
  }

  /**
   * Remove a rule by id. Returns true if the rule existed.
   */
  removeRule(id: string): boolean {
    return this.rules.delete(id);
  }

  /**
   * Returns a snapshot of all currently registered rules.
   */
  getRules(): A11yRule[] {
    return [...this.rules.values()];
  }

  /**
   * Returns a single rule by id, or undefined if not found.
   */
  getRule(id: string): A11yRule | undefined {
    return this.rules.get(id);
  }

  // ─── Scanning ───────────────────────────────────────────────────────────────

  /**
   * Run all registered rules against the DOM scope defined by options.
   * Returns a complete A11yReport.
   */
  run(options: RunOptions = {}): A11yReport {
    const { root = typeof document !== "undefined" ? document.documentElement : null, selector = "*", extraRules = [] } = options;

    if (!root) {
      return this.emptyReport();
    }

    // Merge per-run rules (do not mutate the registry).
    const ruleMap = new Map(this.rules);
    for (const rule of extraRules) {
      ruleMap.set(rule.id, rule);
    }

    // Collect candidate nodes.
    const nodes = this.collectNodes(root, selector);

    // Apply exclusion filter from config.
    const excluded = this.resolveExclusions(root);
    const candidates = nodes.filter((n) => !excluded.has(n));

    const violations: Violation[] = [];
    let passes = 0;
    let incomplete = 0;

    for (const rule of ruleMap.values()) {
      for (const node of candidates) {
        let result;
        try {
          result = rule.check(node);
        } catch {
          incomplete++;
          continue;
        }

        if (result.pass) {
          passes++;
        } else {
          violations.push({
            rule,
            element: node,
            impact: rule.impact,
            message: result.message ?? rule.description,
            suggestion: result.suggestion,
          });
        }
      }
    }

    return {
      violations,
      passes,
      incomplete,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Run a single rule against a single node.
   * Useful for targeted checks without a full DOM scan.
   */
  checkNode(ruleId: string, node: Element): Violation | null {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`[a11y] Rule "${ruleId}" is not registered.`);
    }

    const result = rule.check(node);
    if (result.pass) return null;

    return {
      rule,
      element: node,
      impact: rule.impact,
      message: result.message ?? rule.description,
      suggestion: result.suggestion,
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private collectNodes(root: Element | Document, selector: string): Element[] {
    try {
      const scope = root instanceof Document ? root.documentElement : root;
      // Include the root element itself if it is an Element.
      const fromQuery = Array.from(scope.querySelectorAll(selector));
      if (root instanceof Element && root.matches(selector)) {
        return [root, ...fromQuery];
      }
      return fromQuery;
    } catch {
      return [];
    }
  }

  private resolveExclusions(root: Element | Document): Set<Element> {
    const excluded = new Set<Element>();
    const { exclude } = this.config;
    if (!exclude) return excluded;

    const scope = root instanceof Document ? root : root.ownerDocument ?? (typeof document !== "undefined" ? document : null);
    if (!scope) return excluded;

    if (typeof exclude === "string") {
      const contextRoot = root instanceof Document ? root.documentElement : root;
      for (const el of Array.from(contextRoot.querySelectorAll(exclude))) {
        excluded.add(el);
      }
    } else {
      for (const el of exclude) {
        excluded.add(el);
      }
    }

    return excluded;
  }

  private emptyReport(): A11yReport {
    return {
      violations: [],
      passes: 0,
      incomplete: 0,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Convenience factory — creates a RuleEngine pre-loaded with the given rules.
 */
export function createEngine(config: A11yConfig): RuleEngine {
  return new RuleEngine(config);
}

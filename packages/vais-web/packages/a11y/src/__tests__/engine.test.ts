/**
 * @vaisx/a11y — RuleEngine tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RuleEngine, createEngine } from "../engine.js";
import type { A11yRule, A11yConfig } from "../types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeElement(html: string): Element {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.firstElementChild!;
}

function makePassRule(id = "always-pass"): A11yRule {
  return {
    id,
    description: "Always passes",
    impact: "minor",
    check: () => ({ pass: true }),
  };
}

function makeFailRule(id = "always-fail", message = "fail"): A11yRule {
  return {
    id,
    description: "Always fails",
    impact: "serious",
    check: (node) => ({ pass: false, element: node, message }),
  };
}

function makeConfig(rules: A11yRule[] = []): A11yConfig {
  return { rules, level: "AA" };
}

// ─── Construction ─────────────────────────────────────────────────────────────

describe("RuleEngine — construction", () => {
  it("initialises with the rules provided in config", () => {
    const rule = makePassRule();
    const engine = new RuleEngine(makeConfig([rule]));
    expect(engine.getRules()).toHaveLength(1);
    expect(engine.getRules()[0].id).toBe("always-pass");
  });

  it("createEngine factory returns a RuleEngine instance", () => {
    const engine = createEngine(makeConfig());
    expect(engine).toBeInstanceOf(RuleEngine);
  });
});

// ─── Rule registration ────────────────────────────────────────────────────────

describe("RuleEngine — rule registration", () => {
  let engine: RuleEngine;

  beforeEach(() => {
    engine = new RuleEngine(makeConfig());
  });

  it("addRule registers a new rule", () => {
    engine.addRule(makePassRule("r1"));
    expect(engine.getRule("r1")).toBeDefined();
  });

  it("addRule returns the engine for chaining", () => {
    const result = engine.addRule(makePassRule("r2"));
    expect(result).toBe(engine);
  });

  it("addRule overwrites an existing rule with the same id", () => {
    engine.addRule({ ...makePassRule("r3"), description: "original" });
    engine.addRule({ ...makePassRule("r3"), description: "replaced" });
    expect(engine.getRule("r3")?.description).toBe("replaced");
  });

  it("addRules registers multiple rules at once", () => {
    engine.addRules([makePassRule("r4"), makePassRule("r5")]);
    expect(engine.getRule("r4")).toBeDefined();
    expect(engine.getRule("r5")).toBeDefined();
  });

  it("removeRule deletes a registered rule and returns true", () => {
    engine.addRule(makePassRule("r6"));
    expect(engine.removeRule("r6")).toBe(true);
    expect(engine.getRule("r6")).toBeUndefined();
  });

  it("removeRule returns false for an unknown rule id", () => {
    expect(engine.removeRule("nonexistent")).toBe(false);
  });

  it("getRules returns a snapshot array (not the internal map)", () => {
    engine.addRule(makePassRule("snap"));
    const rules = engine.getRules();
    expect(Array.isArray(rules)).toBe(true);
  });
});

// ─── Running ──────────────────────────────────────────────────────────────────

describe("RuleEngine — run()", () => {
  it("returns an empty report when no rules are registered", () => {
    const engine = new RuleEngine(makeConfig());
    const report = engine.run({ root: document.body });
    expect(report.violations).toHaveLength(0);
    expect(report.passes).toBe(0);
    expect(typeof report.timestamp).toBe("string");
  });

  it("counts passes when a rule passes on a node", () => {
    document.body.innerHTML = "<p>hello</p>";
    const engine = new RuleEngine(makeConfig([makePassRule()]));
    const report = engine.run({ root: document.body, selector: "p" });
    expect(report.passes).toBeGreaterThan(0);
    expect(report.violations).toHaveLength(0);
  });

  it("records a violation when a rule fails on a node", () => {
    document.body.innerHTML = "<p>hello</p>";
    const engine = new RuleEngine(makeConfig([makeFailRule("f1", "bad!")]));
    const report = engine.run({ root: document.body, selector: "p" });
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0].rule.id).toBe("f1");
    expect(report.violations[0].message).toBe("bad!");
  });

  it("report.timestamp is a valid ISO string", () => {
    const engine = new RuleEngine(makeConfig());
    const report = engine.run();
    expect(() => new Date(report.timestamp)).not.toThrow();
    expect(new Date(report.timestamp).toISOString()).toBe(report.timestamp);
  });

  it("extraRules are merged for the run without mutating the registry", () => {
    const engine = new RuleEngine(makeConfig());
    document.body.innerHTML = "<span>x</span>";
    const report = engine.run({
      root: document.body,
      selector: "span",
      extraRules: [makeFailRule("extra")],
    });
    expect(report.violations.some((v) => v.rule.id === "extra")).toBe(true);
    // Registry must remain clean.
    expect(engine.getRule("extra")).toBeUndefined();
  });

  it("increments incomplete when a rule check throws", () => {
    const throwingRule: A11yRule = {
      id: "thrower",
      description: "throws",
      impact: "minor",
      check: () => { throw new Error("oops"); },
    };
    document.body.innerHTML = "<div></div>";
    const engine = new RuleEngine(makeConfig([throwingRule]));
    const report = engine.run({ root: document.body, selector: "div" });
    expect(report.incomplete).toBeGreaterThan(0);
  });
});

// ─── checkNode ────────────────────────────────────────────────────────────────

describe("RuleEngine — checkNode()", () => {
  it("returns null when the node passes the rule", () => {
    const engine = new RuleEngine(makeConfig([makePassRule("pass")]));
    const el = makeElement("<div></div>");
    expect(engine.checkNode("pass", el)).toBeNull();
  });

  it("returns a Violation when the node fails the rule", () => {
    const engine = new RuleEngine(makeConfig([makeFailRule("fail", "oops")]));
    const el = makeElement("<div></div>");
    const violation = engine.checkNode("fail", el);
    expect(violation).not.toBeNull();
    expect(violation?.rule.id).toBe("fail");
    expect(violation?.message).toBe("oops");
  });

  it("throws when the rule id is not registered", () => {
    const engine = new RuleEngine(makeConfig());
    const el = makeElement("<div></div>");
    expect(() => engine.checkNode("missing", el)).toThrow(/missing/);
  });
});

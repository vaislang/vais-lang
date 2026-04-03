import { describe, it, expect } from "vitest";
import type { ResolvedRoute } from "../src/router/resolver.js";
import type { RouteDefinition } from "../src/index.js";
import {
  renderHtmlShell,
  detectComponentType,
  renderServerComponent,
  renderClientComponent,
  renderToString,
  renderToStream,
} from "../src/ssr/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResolvedRoute(overrides: Partial<ResolvedRoute> = {}): ResolvedRoute {
  const route: RouteDefinition = {
    pattern: "/",
    segments: [{ type: "static", value: "" }],
    page: "/app/page.vaisx",
    middleware: [],
    children: [],
  };
  return {
    route,
    params: {},
    layoutChain: [],
    errorBoundary: null,
    loading: null,
    middlewareChain: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// html.ts — renderHtmlShell
// ---------------------------------------------------------------------------

describe("renderHtmlShell", () => {
  it("produces a valid HTML5 document structure", () => {
    const html = renderHtmlShell({ body: "<p>Hello</p>" });
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html lang=\"en\">");
    expect(html).toContain("<head>");
    expect(html).toContain("</head>");
    expect(html).toContain("<body>");
    expect(html).toContain("</body>");
    expect(html).toContain("</html>");
  });

  it("injects body content", () => {
    const html = renderHtmlShell({ body: "<main>content</main>" });
    expect(html).toContain("<main>content</main>");
  });

  it("uses custom lang attribute", () => {
    const html = renderHtmlShell({ body: "", lang: "ko" });
    expect(html).toContain('<html lang="ko">');
  });

  it("defaults lang to 'en'", () => {
    const html = renderHtmlShell({ body: "" });
    expect(html).toContain('<html lang="en">');
  });

  it("injects script tags as type=module", () => {
    const html = renderHtmlShell({ body: "", scripts: ["/app.js", "/vendor.js"] });
    expect(html).toContain('<script type="module" src="/app.js"></script>');
    expect(html).toContain('<script type="module" src="/vendor.js"></script>');
  });

  it("injects stylesheet link tags", () => {
    const html = renderHtmlShell({ body: "", styles: ["/main.css", "/theme.css"] });
    expect(html).toContain('<link rel="stylesheet" href="/main.css">');
    expect(html).toContain('<link rel="stylesheet" href="/theme.css">');
  });

  it("serializes state as application/json script with correct id", () => {
    const html = renderHtmlShell({ body: "", state: { count: 0, user: "alice" } });
    expect(html).toContain('id="__vaisx_state__"');
    expect(html).toContain('type="application/json"');
    expect(html).toContain('"count":0');
    expect(html).toContain('"user":"alice"');
  });

  it("omits state script when state is not provided", () => {
    const html = renderHtmlShell({ body: "" });
    expect(html).not.toContain("__vaisx_state__");
  });

  it("injects additional head content", () => {
    const html = renderHtmlShell({ body: "", head: "<meta name=\"description\" content=\"test\">" });
    expect(html).toContain('<meta name="description" content="test">');
  });

  // Security tests
  it("sanitizes </script> in JSON state to prevent XSS injection", () => {
    const html = renderHtmlShell({
      body: "x",
      state: { xss: "</script><script>alert(1)</script>" },
    });
    // Extract content between the state script tags
    const stateScriptMatch = html.match(
      /<script id="__vaisx_state__"[^>]*>([\s\S]*?)<\/script>/
    );
    expect(stateScriptMatch).not.toBeNull();
    const stateContent = stateScriptMatch![1];
    expect(stateContent).not.toContain("</script>");
    expect(stateContent).toContain("\\u003c");
  });

  it("escapes double quotes in script src attributes", () => {
    const html = renderHtmlShell({ body: "", scripts: ['/app.js"onload="alert(1)'] });
    expect(html).not.toContain('"onload="');
    expect(html).toContain("&quot;");
  });

  it("escapes double quotes in style href attributes", () => {
    const html = renderHtmlShell({ body: "", styles: ['/style.css"onload="xss'] });
    expect(html).not.toContain('"onload="');
    expect(html).toContain("&quot;");
  });

  it("escapes special chars in lang attribute", () => {
    const html = renderHtmlShell({ body: "", lang: 'en"><script>alert(1)</script><html x="' });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&quot;");
  });
});

// ---------------------------------------------------------------------------
// component.ts — detectComponentType
// ---------------------------------------------------------------------------

describe("detectComponentType", () => {
  // --- scriptTag-based detection (priorities 1-2) ---

  it("detects context=\"client\" on scriptTag as client (priority 1)", () => {
    expect(detectComponentType("", '<script context="client">')).toBe("client");
  });

  it("detects context='client' (single quotes) on scriptTag as client", () => {
    expect(detectComponentType("", "<script context='client'>")).toBe("client");
  });

  it("detects context=\"server\" on scriptTag as server when no reactive markers (priority 2)", () => {
    expect(detectComponentType("let data = 42;", '<script context="server">')).toBe("server");
  });

  it("returns conflict when context=\"server\" on scriptTag but $state in content", () => {
    expect(detectComponentType("count := $state(0)", '<script context="server">')).toBe("conflict");
  });

  it("returns conflict when context=\"server\" on scriptTag but $derived in content", () => {
    expect(detectComponentType("doubled := $derived(count * 2)", '<script context="server">')).toBe("conflict");
  });

  it("returns conflict when context=\"server\" on scriptTag but $effect in content", () => {
    expect(detectComponentType("$effect(() => {})", '<script context="server">')).toBe("conflict");
  });

  it("returns conflict when context=\"server\" on scriptTag but @event binding in content", () => {
    expect(detectComponentType('<button @click="fn">', '<script context="server">')).toBe("conflict");
  });

  // --- scriptContent-based detection (priority 3, no scriptTag) ---

  it("detects $state in scriptContent as client (priority 3, backward compat)", () => {
    expect(detectComponentType("count := $state(0)")).toBe("client");
  });

  it("detects $derived in scriptContent as client (priority 3)", () => {
    expect(detectComponentType("const doubled = $derived(count * 2);")).toBe("client");
  });

  it("detects $effect in scriptContent as client (priority 3)", () => {
    expect(detectComponentType("$effect(() => { console.log('effect'); });")).toBe("client");
  });

  it("detects @click in scriptContent as client (priority 3)", () => {
    expect(detectComponentType('<button @click="handleClick">')).toBe("client");
  });

  it("detects @input in scriptContent as client (priority 3)", () => {
    expect(detectComponentType('<input @input="handleInput">')).toBe("client");
  });

  it("detects @submit in scriptContent as client (priority 3)", () => {
    expect(detectComponentType('<form @submit="handleSubmit">')).toBe("client");
  });

  it("detects @keydown in scriptContent as client (priority 3)", () => {
    expect(detectComponentType('<input @keydown="handleKey">')).toBe("client");
  });

  it("detects :value= binding in scriptContent as client (priority 3)", () => {
    expect(detectComponentType('<input :value="name">')).toBe("client");
  });

  it("detects :checked= binding in scriptContent as client (priority 3)", () => {
    expect(detectComponentType('<input :checked="isOn">')).toBe("client");
  });

  it("defaults to server when no markers found (priority 4)", () => {
    expect(detectComponentType("<h1>Hello, world!</h1>")).toBe("server");
  });

  it("plain server component with simple assignment defaults to server", () => {
    expect(detectComponentType("data := 42")).toBe("server");
  });

  it("context=\"client\" on scriptTag takes priority over reactive markers in content", () => {
    expect(detectComponentType("$state $effect", '<script context="client">')).toBe("client");
  });
});

// ---------------------------------------------------------------------------
// component.ts — renderServerComponent / renderClientComponent
// ---------------------------------------------------------------------------

describe("renderServerComponent", () => {
  it("returns HTML as-is", () => {
    const html = "<p>Server content</p>";
    expect(renderServerComponent(html)).toBe(html);
  });
});

describe("renderClientComponent", () => {
  it("wraps HTML with data-vx and data-vx-state attributes", () => {
    const result = renderClientComponent("<button>Click</button>", "c0:click");
    expect(result).toContain('data-vx="c0:click"');
    expect(result).toContain("data-vx-state=");
    expect(result).toContain("<button>Click</button>");
  });

  it("encodes state as base64", () => {
    const state = { count: 0 };
    const result = renderClientComponent("<span>0</span>", "counter", state);
    const expected = btoa(JSON.stringify(state));
    expect(result).toContain(`data-vx-state="${expected}"`);
  });

  it("uses empty object when no state provided", () => {
    const result = renderClientComponent("<div></div>", "comp");
    const expected = btoa(JSON.stringify({}));
    expect(result).toContain(`data-vx-state="${expected}"`);
  });

  it("wraps with a div element", () => {
    const result = renderClientComponent("<span>hi</span>", "x");
    expect(result).toMatch(/^<div /);
    expect(result).toMatch(/<\/div>$/);
  });
});

// ---------------------------------------------------------------------------
// renderer.ts — renderToString
// ---------------------------------------------------------------------------

describe("renderToString", () => {
  it("returns status 200 and content-type header", async () => {
    const resolved = makeResolvedRoute();
    const result = await renderToString({
      route: resolved,
      renderComponent: async () => "<p>page</p>",
    });
    expect(result.status).toBe(200);
    expect(result.headers["content-type"]).toContain("text/html");
  });

  it("renders page content in the HTML body", async () => {
    const resolved = makeResolvedRoute();
    const result = await renderToString({
      route: resolved,
      renderComponent: async () => "<main>Hello SSR</main>",
    });
    expect(result.html).toContain("<main>Hello SSR</main>");
  });

  it("wraps page in layout chain using {slot} placeholder", async () => {
    const resolved = makeResolvedRoute({
      layoutChain: ["/app/layout.vaisx"],
    });
    const result = await renderToString({
      route: resolved,
      renderComponent: async (path) => {
        if (path === "/app/layout.vaisx") return "<layout>{slot}</layout>";
        return "<page>content</page>";
      },
    });
    expect(result.html).toContain("<layout><page>content</page></layout>");
  });

  it("wraps in nested layout chain (outermost wraps innermost)", async () => {
    const resolved = makeResolvedRoute({
      layoutChain: ["/app/layout.vaisx", "/app/blog/layout.vaisx"],
    });
    const result = await renderToString({
      route: resolved,
      renderComponent: async (path) => {
        if (path === "/app/layout.vaisx") return "<outer>{slot}</outer>";
        if (path === "/app/blog/layout.vaisx") return "<inner>{slot}</inner>";
        return "<page/>";
      },
    });
    expect(result.html).toContain("<outer><inner><page/></inner></outer>");
  });

  it("includes scripts from options", async () => {
    const resolved = makeResolvedRoute();
    const result = await renderToString({
      route: resolved,
      renderComponent: async () => "",
      scripts: ["/bundle.js"],
    });
    expect(result.html).toContain('<script type="module" src="/bundle.js"></script>');
  });

  it("includes styles from options", async () => {
    const resolved = makeResolvedRoute();
    const result = await renderToString({
      route: resolved,
      renderComponent: async () => "",
      styles: ["/styles.css"],
    });
    expect(result.html).toContain('<link rel="stylesheet" href="/styles.css">');
  });

  it("returns empty body when page path is undefined", async () => {
    const resolved = makeResolvedRoute({
      route: {
        pattern: "/",
        segments: [],
        middleware: [],
        children: [],
        // no page property
      },
    });
    const result = await renderToString({
      route: resolved,
      renderComponent: async () => "<should-not-appear/>",
    });
    // body between <body> tags should be empty (no page HTML injected)
    const bodyMatch = result.html.match(/<body>(.*?)<\/body>/s);
    expect(bodyMatch?.[1]).toBe("");
  });
});

// ---------------------------------------------------------------------------
// stream.ts — renderToStream
// ---------------------------------------------------------------------------

describe("renderToStream", () => {
  async function collectStream(stream: ReadableStream<Uint8Array>): Promise<string> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let result = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
    }
    return result;
  }

  it("returns status 200 and content-type header", () => {
    const resolved = makeResolvedRoute();
    const result = renderToStream({
      route: resolved,
      renderComponent: async () => "<p>streamed</p>",
    });
    expect(result.status).toBe(200);
    expect(result.headers["content-type"]).toContain("text/html");
  });

  it("returns a ReadableStream", () => {
    const resolved = makeResolvedRoute();
    const result = renderToStream({
      route: resolved,
      renderComponent: async () => "",
    });
    expect(result.stream).toBeInstanceOf(ReadableStream);
  });

  it("streams a valid HTML document", async () => {
    const resolved = makeResolvedRoute();
    const result = renderToStream({
      route: resolved,
      renderComponent: async () => "<p>page</p>",
    });
    const html = await collectStream(result.stream);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html");
    expect(html).toContain("<head>");
    expect(html).toContain("<body>");
    expect(html).toContain("<p>page</p>");
    expect(html).toContain("</body>");
    expect(html).toContain("</html>");
  });

  it("streams scripts after body content", async () => {
    const resolved = makeResolvedRoute();
    const result = renderToStream({
      route: resolved,
      renderComponent: async () => "<p>content</p>",
      scripts: ["/app.js"],
    });
    const html = await collectStream(result.stream);
    const bodyPos = html.indexOf("</body>");
    const scriptPos = html.indexOf('<script type="module"');
    expect(scriptPos).toBeGreaterThanOrEqual(0);
    expect(scriptPos).toBeGreaterThan(html.indexOf("<p>content</p>"));
    // scripts are placed after body content (before or after closing tag depending on impl)
    expect(bodyPos).toBeGreaterThan(-1);
  });

  it("streams layout-wrapped page content", async () => {
    const resolved = makeResolvedRoute({
      layoutChain: ["/app/layout.vaisx"],
    });
    const result = renderToStream({
      route: resolved,
      renderComponent: async (path) => {
        if (path === "/app/layout.vaisx") return "<layout>{slot}</layout>";
        return "<page>streamed</page>";
      },
    });
    const html = await collectStream(result.stream);
    expect(html).toContain("<layout><page>streamed</page></layout>");
  });
});

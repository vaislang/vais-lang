import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as http from "node:http";

// Mock the compiler
vi.mock("../src/compiler.js", () => ({
  compileFile: vi.fn((filePath: string) => {
    const source = fs.readFileSync(filePath, "utf-8");
    const name = path.basename(filePath, ".vaisx");
    return {
      ok: true,
      js: `// compiled ${name}\nexport default function ${name}() {}`,
      sourceMap: null,
      warnings: [],
    };
  }),
}));

const { createDevServer } = await import("../src/dev.js");
const { DEFAULT_CONFIG } = await import("../src/config.js");

function httpGet(url: string): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
      res.on("error", reject);
    }).on("error", reject);
  });
}

describe("createDevServer", () => {
  let tmpDir: string;
  let server: Awaited<ReturnType<typeof createDevServer>> | null = null;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vaisx-dev-"));
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "dist"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "public"), { recursive: true });
  });

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("starts and stops cleanly", async () => {
    server = await createDevServer({
      root: tmpDir,
      config: { ...DEFAULT_CONFIG },
      port: 0, // auto-assign
      host: "127.0.0.1",
    });

    expect(server.port).toBeGreaterThan(0);
    expect(server.httpServer.listening).toBe(true);

    await server.close();
    expect(server.httpServer.listening).toBe(false);
    server = null;
  });

  it("serves static files from public/", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "public", "style.css"),
      "body { color: red; }",
    );

    server = await createDevServer({
      root: tmpDir,
      config: { ...DEFAULT_CONFIG },
      port: 0,
      host: "127.0.0.1",
    });

    const res = await httpGet(`http://127.0.0.1:${server.port}/style.css`);
    expect(res.status).toBe(200);
    expect(res.body).toContain("body { color: red; }");
    expect(res.headers["content-type"]).toContain("text/css");
  });

  it("serves compiled JS from outDir", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "dist", "App.js"),
      "export default function App() {}",
    );

    server = await createDevServer({
      root: tmpDir,
      config: { ...DEFAULT_CONFIG },
      port: 0,
      host: "127.0.0.1",
    });

    const res = await httpGet(`http://127.0.0.1:${server.port}/App.js`);
    expect(res.status).toBe(200);
    expect(res.body).toContain("export default function App()");
    expect(res.headers["content-type"]).toContain("application/javascript");
  });

  it("injects HMR script into HTML", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "dist", "index.html"),
      "<html><body><h1>Hello</h1></body></html>",
    );

    server = await createDevServer({
      root: tmpDir,
      config: { ...DEFAULT_CONFIG },
      port: 0,
      host: "127.0.0.1",
    });

    const res = await httpGet(`http://127.0.0.1:${server.port}/`);
    expect(res.status).toBe(200);
    expect(res.body).toContain("__vaisx_hmr");
    expect(res.body).toContain("<h1>Hello</h1>");
  });

  it("returns 404 for unknown paths", async () => {
    server = await createDevServer({
      root: tmpDir,
      config: { ...DEFAULT_CONFIG },
      port: 0,
      host: "127.0.0.1",
    });

    const res = await httpGet(`http://127.0.0.1:${server.port}/nonexistent.txt`);
    expect(res.status).toBe(404);
  });

  it("SPA fallback serves index.html for unknown routes", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "dist", "index.html"),
      "<html><body>SPA</body></html>",
    );

    server = await createDevServer({
      root: tmpDir,
      config: { ...DEFAULT_CONFIG },
      port: 0,
      host: "127.0.0.1",
    });

    const res = await httpGet(`http://127.0.0.1:${server.port}/some/route`);
    expect(res.status).toBe(200);
    expect(res.body).toContain("SPA");
  });
});

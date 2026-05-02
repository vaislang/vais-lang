import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { generateServerEntry } from "../../src/adapters/node.js";
import type { RouteManifest } from "../../src/types.js";

const liveManifest: RouteManifest = {
  routes: [
    {
      pattern: "/",
      segments: [],
      page: "/app/page.vaisx",
      middleware: [],
      children: [
        {
          pattern: "/about",
          segments: [{ type: "static", value: "about" }],
          page: "/app/about/page.vaisx",
          middleware: [],
          children: [],
        },
        {
          pattern: "/products/[sku]",
          segments: [
            { type: "static", value: "products" },
            { type: "dynamic", value: "sku" },
          ],
          page: "/app/products/[sku]/page.vaisx",
          middleware: [],
          children: [],
        },
      ],
    },
  ],
  modules: {
    "/": "/app/page.vaisx",
    "/about": "/app/about/page.vaisx",
    "/products/[sku]": "/app/products/[sku]/page.vaisx",
  },
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address !== "object" || address === null) {
        reject(new Error("failed to allocate a TCP port"));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve(address.port);
        }
      });
    });
  });
}

async function waitForStaticResponse(
  child: ReturnType<typeof spawn>,
  port: number,
  output: string[]
): Promise<void> {
  const deadline = Date.now() + 5_000;
  const exitPromise = new Promise<never>((_, reject) => {
    child.once("exit", (code, signal) => {
      reject(
        new Error(
          `generated server exited before it was ready: code=${code} signal=${signal}\n${output.join("")}`
        )
      );
    });
  });

  const readyPromise = (async () => {
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/about/`);
        const body = await response.text();
        if (response.status === 200 && body.includes("STATIC_ABOUT")) {
          return;
        }
      } catch (error) {
        lastError = error;
      }
      await delay(50);
    }

    throw new Error(
      `generated server did not become ready: ${String(lastError)}\n${output.join("")}`
    );
  })();

  await Promise.race([readyPromise, exitPromise]);
}

async function stopServer(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const closed = new Promise<void>((resolve) => {
    child.once("close", () => resolve());
  });
  child.kill("SIGTERM");
  const timedOut = delay(1_000).then(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
  });

  await Promise.race([closed, timedOut]);
  await closed;
}

describe("E2E - vais-web node live adapter", () => {
  it("writes generated server output and serves static plus dynamic routes from a live Node process", async () => {
    const port = await getFreePort();
    const tempDir = await mkdtemp(join(tmpdir(), "vais-web-node-live-"));
    const serverDir = join(tempDir, "server");
    const clientDir = join(tempDir, "client");
    const output: string[] = [];
    let child: ReturnType<typeof spawn> | undefined;

    try {
      await mkdir(serverDir, { recursive: true });
      await mkdir(join(clientDir, "about"), { recursive: true });
      await writeFile(
        join(serverDir, "index.mjs"),
        generateServerEntry(liveManifest, {
          port,
          host: "127.0.0.1",
          staticDir: "../client",
          serverDir: ".",
        }),
        "utf8"
      );
      await writeFile(
        join(clientDir, "about", "index.html"),
        "<!DOCTYPE html><html><body>STATIC_ABOUT</body></html>",
        "utf8"
      );
      await writeFile(
        join(clientDir, "404.html"),
        "<!DOCTYPE html><html><body>STATIC_404</body></html>",
        "utf8"
      );

      child = spawn(process.execPath, [join(serverDir, "index.mjs")], {
        cwd: tempDir,
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => output.push(String(chunk)));
      child.stderr?.on("data", (chunk) => output.push(String(chunk)));

      await waitForStaticResponse(child, port, output);

      const staticResponse = await fetch(`http://127.0.0.1:${port}/about/`);
      expect(staticResponse.status).toBe(200);
      expect(staticResponse.headers.get("content-type")).toBe(
        "text/html; charset=utf-8"
      );
      expect(await staticResponse.text()).toContain("STATIC_ABOUT");

      const dynamicResponse = await fetch(
        `http://127.0.0.1:${port}/products/sku-42`
      );
      expect(dynamicResponse.status).toBe(200);
      expect(dynamicResponse.headers.get("content-type")).toBe(
        "text/html; charset=utf-8"
      );
      expect(await dynamicResponse.text()).toContain('<div id="app"></div>');

      const missingResponse = await fetch(
        `http://127.0.0.1:${port}/does-not-exist`
      );
      expect(missingResponse.status).toBe(404);
      expect(missingResponse.headers.get("content-type")).toBe(
        "text/html; charset=utf-8"
      );
      expect(await missingResponse.text()).toContain("STATIC_404");
    } finally {
      if (child) {
        await stopServer(child);
      }
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 10_000);
});

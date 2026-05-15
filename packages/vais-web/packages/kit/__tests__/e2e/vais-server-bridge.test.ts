import { describe, expect, it } from "vitest";

import {
  createSsrService,
  type SsrRenderRequest,
  type SsrRenderResponse,
  type SsrServiceConfig,
  type SsrServiceHandle,
} from "../../src/ssr/server-bridge.js";

async function startService(
  overrides: Partial<SsrServiceConfig> = {}
): Promise<SsrServiceHandle> {
  return createSsrService({
    port: 0,
    host: "127.0.0.1",
    renderComponent: async () => "<main>fallback</main>",
    resolveRoute: async () => null,
    ...overrides,
  });
}

async function postRender(
  service: SsrServiceHandle,
  request: SsrRenderRequest
): Promise<{ httpStatus: number; body: SsrRenderResponse }> {
  const response = await fetch(`${service.url}/ssr/render`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  return {
    httpStatus: response.status,
    body: (await response.json()) as SsrRenderResponse,
  };
}

describe("E2E — vais-server SSR bridge", () => {
  it("accepts a vais-server render request and returns SSR HTML", async () => {
    let resolvedPath = "";
    const service = await startService({
      resolveRoute: async (path) => {
        resolvedPath = path;
        return {
          page: "/app/dashboard/page.vaisx",
          layoutChain: ["/app/layout.vaisx"],
          params: { section: "dashboard" },
        };
      },
      renderComponent: async (filePath, props) => {
        if (filePath.endsWith("layout.vaisx")) {
          return '<div data-layout="root">{slot}</div>';
        }
        return `<main data-page="${filePath}" data-user="${String(
          props?.user
        )}">Dashboard</main>`;
      },
    });

    try {
      expect(service.port).toBeGreaterThan(0);

      const { httpStatus, body } = await postRender(service, {
        route: "/dashboard",
        props: { user: "Ada" },
        head: "<title>Dashboard</title>",
        scripts: ["/entry.js"],
        styles: ["/app.css"],
      });

      expect(httpStatus).toBe(200);
      expect(resolvedPath).toBe("/dashboard");
      expect(body.status).toBe(200);
      expect(body.headers["content-type"]).toBe("text/html; charset=utf-8");
      expect(body.html).toContain("<!DOCTYPE html>");
      expect(body.html).toContain('<link rel="stylesheet" href="/app.css">');
      expect(body.html).toContain("<title>Dashboard</title>");
      expect(body.html).toContain('<div data-layout="root">');
      expect(body.html).toContain('data-page="/app/dashboard/page.vaisx"');
      expect(body.html).toContain('data-user="Ada"');
      expect(body.html).toContain(
        '<script type="module" src="/entry.js"></script>'
      );
    } finally {
      await service.close();
    }
  });

  it("returns a protocol-level 404 response for unresolved routes", async () => {
    const service = await startService();

    try {
      const { httpStatus, body } = await postRender(service, {
        route: "/missing",
      });

      expect(httpStatus).toBe(200);
      expect(body.status).toBe(404);
      expect(body.headers["content-type"]).toBe("text/html; charset=utf-8");
      expect(body.html).toContain("404 Not Found");
    } finally {
      await service.close();
    }
  });

  it("rejects non-render endpoints at the HTTP layer", async () => {
    const service = await startService();

    try {
      const response = await fetch(`${service.url}/health`);
      const body = (await response.json()) as { error: string };

      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toContain(
        "application/json"
      );
      expect(body.error).toBe("Not found");
    } finally {
      await service.close();
    }
  });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createVercelAdapter } from "../../src/adapters/vercel.js";
import type { AdapterBuildResult, RouteManifest } from "../../src/types.js";

type GeneratedBuildResult = AdapterBuildResult & {
  generatedFiles?: Record<string, string>;
};

// Mirror the cloudflare manifest so root + dynamic-route probes share the
// same surface across platforms. This is what makes the two live-deploy
// smokes mutually corroborating.
const vercelManifest: RouteManifest = {
  routes: [
    {
      pattern: "/",
      segments: [],
      page: "/app/page.vaisx",
      middleware: [],
      children: [
        {
          pattern: "/blog/[slug]",
          segments: [
            { type: "static", value: "blog" },
            { type: "dynamic", value: "slug" },
          ],
          page: "/app/blog/[slug]/page.vaisx",
          middleware: [],
          children: [],
        },
      ],
    },
  ],
  modules: {
    "/": "/app/page.vaisx",
    "/blog/[slug]": "/app/blog/[slug]/page.vaisx",
  },
};

const tokenSet = !!process.env.VERCEL_TOKEN;
const liveEnabled = tokenSet;

// CI default: skip when no token. With a token, the runner deploys to Vercel,
// probes the *.vercel.app URL, and tears the deployment down on `afterAll`
// (the shell script also has a cleanup trap as a belt-and-braces measure if
// the test runner crashes mid-flight). Mirrors the cloudflare suite layout.
const describeMaybe = liveEnabled ? describe : describe.skip;

describeMaybe("E2E - vais-web vercel LIVE deploy", () => {
  let distDir: string;
  let projectName: string;
  let deployUrl: string | null = null;
  let scriptOutput: string = "";

  beforeAll(async () => {
    const vercelBuild = (await createVercelAdapter().build(
      vercelManifest,
      { type: "vercel" }
    )) as GeneratedBuildResult;

    if (!vercelBuild.generatedFiles) {
      throw new Error("vercel adapter did not return generatedFiles");
    }

    distDir = mkdtempSync(join(tmpdir(), "vais-web-vc-live-"));

    // The vercel adapter emits a tree of `.vercel/output/...` paths. Write
    // each file at the relative path it claims; this reproduces the layout
    // `vercel deploy --prebuilt` expects.
    for (const [relativePath, content] of Object.entries(
      vercelBuild.generatedFiles
    )) {
      const target = join(distDir, relativePath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }

    projectName = `vais-web-live-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const scriptPath = resolve(
      __dirname,
      "scripts",
      "vercel-live-deploy.sh"
    );

    try {
      const stdout = execFileSync("bash", [scriptPath], {
        env: {
          ...process.env,
          VAIS_VERCEL_LIVE_DIST: distDir,
          VAIS_VERCEL_LIVE_NAME: projectName,
        },
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
        // 180s budget: npx fetch (~30s cold) + deploy (~30s) + propagation
        // (~20s) + probes (~5s). Vercel cold deploy is slower than CF.
        timeout: 180_000,
      });
      scriptOutput = stdout;
      const urlMatch = stdout.match(/^DEPLOY_URL=(.+)$/m);
      if (urlMatch) {
        deployUrl = urlMatch[1];
      }
    } catch (err: unknown) {
      const e = err as { stdout?: Buffer | string; stderr?: Buffer | string };
      const stdout = typeof e.stdout === "string" ? e.stdout : e.stdout?.toString() ?? "";
      const stderr = typeof e.stderr === "string" ? e.stderr : e.stderr?.toString() ?? "";
      scriptOutput = `[stdout]\n${stdout}\n[stderr]\n${stderr}`;
      throw err;
    }
  }, 200_000);

  afterAll(() => {
    if (distDir) {
      rmSync(distDir, { recursive: true, force: true });
    }
    // The deploy script's `trap cleanup EXIT` already removes the deployment
    // and project on its own normal/error exit, so no extra teardown call is
    // needed here.
  });

  it("script reports DEPLOY_URL on *.vercel.app", () => {
    expect(deployUrl).toBeTruthy();
    expect(deployUrl).toMatch(/^https:\/\/[a-zA-Z0-9.-]+\.vercel\.app$/);
  });

  it("script reports root probe success (200 or 404 — both prove edge is live)", () => {
    expect(scriptOutput).toMatch(/^PROBE_OK=root:(200|404):[0-9a-f]{0,64}$/m);
  });

  it("script reports dynamic-route probe success (any HTTP status from a real Vercel edge)", () => {
    expect(scriptOutput).toMatch(/^PROBE_DYN=\d{3}:/m);
  });

  it("root body line emitted (Vercel always responds with some HTML or 404 page)", () => {
    expect(scriptOutput).toMatch(/^ROOT_BODY_FIRST_120=/m);
  });
});

if (!liveEnabled) {
  // Surfaces the skip reason in vitest output without polluting passing runs.
  // eslint-disable-next-line no-console
  console.warn(
    "[vais-web-vercel-live-deploy] skipped: VERCEL_TOKEN env var must be set."
  );
}

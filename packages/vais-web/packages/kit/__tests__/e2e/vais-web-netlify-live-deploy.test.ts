import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createNetlifyAdapter } from "../../src/adapters/netlify.js";
import type { AdapterBuildResult, RouteManifest } from "../../src/types.js";

type GeneratedBuildResult = AdapterBuildResult & {
  generatedFiles?: Record<string, string>;
};

// Mirror the cloudflare/vercel manifest so root + dynamic-route probes share
// the same surface across platforms. This makes all three live-deploy smokes
// mutually corroborating.
const netlifyManifest: RouteManifest = {
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

const tokenSet = !!process.env.NETLIFY_AUTH_TOKEN;
const liveEnabled = tokenSet;

// CI default: skip when no token. With a token, the runner creates a Netlify
// site, deploys to production, probes the *.netlify.app URL, and tears the
// site down on `afterAll` (the shell script also has a cleanup trap as a
// belt-and-braces measure if the test runner crashes mid-flight). Mirrors the
// cloudflare and vercel suite layouts.
const describeMaybe = liveEnabled ? describe : describe.skip;

describeMaybe("E2E - vais-web netlify LIVE deploy", () => {
  let distDir: string;
  let siteName: string;
  let deployUrl: string | null = null;
  let scriptOutput: string = "";

  beforeAll(async () => {
    const netlifyBuild = (await createNetlifyAdapter().build(
      netlifyManifest,
      { type: "netlify" }
    )) as GeneratedBuildResult;

    if (!netlifyBuild.generatedFiles) {
      throw new Error("netlify adapter did not return generatedFiles");
    }

    distDir = mkdtempSync(join(tmpdir(), "vais-web-ntl-live-"));

    // The netlify adapter emits a tree of paths (dist/functions/handler.js,
    // dist/static/_redirects, dist/netlify.toml). Write each file at the
    // relative path it claims; this reproduces the layout the deploy script
    // expects under VAIS_NETLIFY_LIVE_DIST.
    for (const [relativePath, content] of Object.entries(
      netlifyBuild.generatedFiles
    )) {
      const target = join(distDir, relativePath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }

    siteName = `vais-web-live-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const scriptPath = resolve(
      __dirname,
      "scripts",
      "netlify-live-deploy.sh"
    );

    try {
      const stdout = execFileSync("bash", [scriptPath], {
        env: {
          ...process.env,
          VAIS_NETLIFY_LIVE_DIST: distDir,
          VAIS_NETLIFY_LIVE_NAME: siteName,
        },
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
        // 180s budget: npx fetch (~30s cold) + site create (~5s) + deploy
        // (~30s) + propagation (~20s) + probes (~5s).
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
    // The deploy script's `trap cleanup EXIT` already deletes the Netlify site
    // on its own normal/error exit, so no extra teardown call is needed here.
  });

  it("script reports DEPLOY_URL on *.netlify.app", () => {
    expect(deployUrl).toBeTruthy();
    expect(deployUrl).toMatch(/^https:\/\/[a-zA-Z0-9.-]+\.netlify\.app$/);
  });

  it("script reports root probe success (200 or 404 — both prove edge is live)", () => {
    expect(scriptOutput).toMatch(/^PROBE_OK=root:(200|404):[0-9a-f]{0,64}$/m);
  });

  it("script reports dynamic-route probe success (any HTTP status from a real Netlify edge)", () => {
    expect(scriptOutput).toMatch(/^PROBE_DYN=\d{3}:/m);
  });

  it("root body line emitted (Netlify always responds with some HTML or 404 page)", () => {
    expect(scriptOutput).toMatch(/^ROOT_BODY_FIRST_120=/m);
  });
});

if (!liveEnabled) {
  // Surfaces the skip reason in vitest output without polluting passing runs.
  // eslint-disable-next-line no-console
  console.warn(
    "[vais-web-netlify-live-deploy] skipped: NETLIFY_AUTH_TOKEN env var must be set."
  );
}

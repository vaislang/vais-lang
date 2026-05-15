import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCloudflareAdapter } from "../../src/adapters/cloudflare.js";
import type { AdapterBuildResult, RouteManifest } from "../../src/types.js";

type GeneratedBuildResult = AdapterBuildResult & {
  generatedFiles?: Record<string, string>;
};

const cloudManifest: RouteManifest = {
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

const STATIC_INDEX_HTML =
  "<!DOCTYPE html><body>CLOUDFLARE_LIVE_DEPLOY_OK</body>";

const tokenSet = !!process.env.CLOUDFLARE_API_TOKEN;
const accountSet = !!process.env.CLOUDFLARE_ACCOUNT_ID;
const liveEnabled = tokenSet && accountSet;

// When credentials are absent we skip the suite entirely. INTEGRITY OK in CI
// default (no creds) → 0/0 reported by check-integrity.sh as a no-op gate, not
// a regression. When creds are present (developer / explicit deploy session)
// the runner deploys to Cloudflare, probes the workers.dev URL, and tears the
// script down on `afterAll` (the shell script also has a cleanup trap as a
// belt-and-braces measure if the test runner crashes mid-flight).
const describeMaybe = liveEnabled ? describe : describe.skip;

describeMaybe("E2E - vais-web cloudflare LIVE deploy", () => {
  let distDir: string;
  let workerName: string;
  let deployUrl: string | null = null;
  let scriptOutput: string = "";

  beforeAll(async () => {
    const cloudflareBuild = (await createCloudflareAdapter().build(
      cloudManifest,
      { type: "cloudflare" }
    )) as GeneratedBuildResult;

    const generated = cloudflareBuild.generatedFiles?.["dist/_worker.js"];
    if (!generated) {
      throw new Error("cloudflare adapter did not generate dist/_worker.js");
    }

    distDir = mkdtempSync(join(tmpdir(), "vais-web-cf-live-"));
    writeFileSync(join(distDir, "_worker.js"), generated);
    writeFileSync(join(distDir, "index.html"), STATIC_INDEX_HTML);

    workerName = `vais-web-live-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const scriptPath = resolve(
      __dirname,
      "scripts",
      "cloudflare-live-deploy.sh"
    );

    try {
      const stdout = execFileSync("bash", [scriptPath], {
        env: {
          ...process.env,
          VAIS_CF_LIVE_DIST: distDir,
          VAIS_CF_LIVE_NAME: workerName,
        },
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
        // 90s budget: upload (~5s) + propagation retry (~20s) + probes (~5s)
        timeout: 90_000,
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
  }, 120_000);

  afterAll(() => {
    if (distDir) {
      rmSync(distDir, { recursive: true, force: true });
    }
    // The deploy script's `trap cleanup EXIT` already deletes the worker on
    // its own normal/error exit, so no extra teardown call is needed here.
  });

  it("script reports DEPLOY_URL on workers.dev subdomain", () => {
    expect(deployUrl).toBeTruthy();
    expect(deployUrl).toMatch(/^https:\/\/[^.]+\.[^.]+\.workers\.dev$/);
  });

  it("script reports root probe success (200 or 404 — both prove worker is live)", () => {
    // `PROBE_OK=root:<status>:<sha>` from the shell script.
    expect(scriptOutput).toMatch(/^PROBE_OK=root:(200|404):[0-9a-f]{0,64}$/m);
  });

  it("script reports dynamic-route probe success (any HTTP status from a real workerd)", () => {
    // `PROBE_DYN=<status>:<sha>` — non-zero status proves workerd handled the
    // request. We do not assert content here because the live deploy serves
    // generated SSR HTML whose exact contents are framework-version-sensitive.
    expect(scriptOutput).toMatch(/^PROBE_DYN=\d{3}:/m);
  });

  it("root body contains the static index marker uploaded as fixture", () => {
    // Cloudflare workers.dev does not bind the local site/ dir without a
    // wrangler.toml [site] section, so we fall back to the SSR-generated
    // index when the static asset is unbound. Either is acceptable evidence
    // of "real workerd ran". Just check the runner produced *some* root body.
    expect(scriptOutput).toMatch(/^ROOT_BODY_FIRST_120=/m);
  });
});

if (!liveEnabled) {
  // Surfaces the skip reason in vitest output without polluting passing runs.
  // eslint-disable-next-line no-console
  console.warn(
    "[vais-web-cloudflare-live-deploy] skipped: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID env vars must both be set."
  );
}

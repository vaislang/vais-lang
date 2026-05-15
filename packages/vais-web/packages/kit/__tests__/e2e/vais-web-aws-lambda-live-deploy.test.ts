import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAwsLambdaAdapter } from "../../src/adapters/aws-lambda.js";
import type { AdapterBuildResult, RouteManifest } from "../../src/types.js";

type GeneratedBuildResult = AdapterBuildResult & {
  generatedFiles?: Record<string, string>;
};

// Mirror the manifest used by cloudflare/vercel suites so root + dynamic-route
// probes share the same surface across platforms.
const lambdaManifest: RouteManifest = {
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

const liveEnabled =
  !!process.env.AWS_ACCESS_KEY_ID &&
  !!process.env.AWS_SECRET_ACCESS_KEY &&
  !!process.env.AWS_LAMBDA_ROLE_ARN;

// CI default: skip when no credentials. With credentials the runner creates a
// Lambda function + Function URL, probes the generated URL, and tears the
// function down on `afterAll` (the shell script also has a cleanup trap as a
// belt-and-braces measure if the test runner crashes mid-flight).
// Mirrors the cloudflare/vercel suite layout.
const describeMaybe = liveEnabled ? describe : describe.skip;

describeMaybe("E2E - vais-web aws-lambda LIVE deploy", () => {
  let distDir: string;
  let functionName: string;
  let deployUrl: string | null = null;
  let scriptOutput: string = "";

  beforeAll(async () => {
    const lambdaBuild = (await createAwsLambdaAdapter().build(
      lambdaManifest,
      { type: "aws-lambda" }
    )) as GeneratedBuildResult;

    if (!lambdaBuild.generatedFiles) {
      throw new Error("aws-lambda adapter did not return generatedFiles");
    }

    distDir = mkdtempSync(join(tmpdir(), "vais-web-aws-live-"));

    // The aws-lambda adapter emits paths rooted at "dist/". Write each file at
    // the relative path it claims; this reproduces the layout the deploy script
    // expects (dist/handler.js under VAIS_AWS_LIVE_DIST).
    for (const [relativePath, content] of Object.entries(
      lambdaBuild.generatedFiles
    )) {
      const target = join(distDir, relativePath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }

    functionName = `vais-web-live-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const scriptPath = resolve(
      __dirname,
      "scripts",
      "aws-lambda-live-deploy.sh"
    );

    try {
      const stdout = execFileSync("bash", [scriptPath], {
        env: {
          ...process.env,
          VAIS_AWS_LIVE_DIST: distDir,
          VAIS_AWS_LIVE_NAME: functionName,
        },
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
        // 240s budget: function create (~15s) + active wait (~10s) + Function
        // URL propagation + cold start (~30s) + probe retries (~54s) + margin.
        timeout: 240_000,
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
  }, 270_000);

  afterAll(() => {
    if (distDir) {
      rmSync(distDir, { recursive: true, force: true });
    }
    // The deploy script's `trap cleanup EXIT` already deletes the Lambda
    // function (and its Function URL) on its own normal/error exit, so no
    // extra teardown call is needed here.
  });

  it("script reports DEPLOY_URL on lambda-url domain", () => {
    expect(deployUrl).toBeTruthy();
    expect(deployUrl).toMatch(/^https:\/\//);
  });

  it("script reports root probe success (200 or 404 — both prove function is live)", () => {
    expect(scriptOutput).toMatch(/^PROBE_OK=root:(200|404):[0-9a-f]{0,64}$/m);
  });

  it("script reports dynamic-route probe success (any HTTP status from a real Lambda invocation)", () => {
    expect(scriptOutput).toMatch(/^PROBE_DYN=\d{3}:/m);
  });

  it("root body line emitted (Lambda always responds with some HTML or 404 body)", () => {
    expect(scriptOutput).toMatch(/^ROOT_BODY_FIRST_120=/m);
  });
});

if (!liveEnabled) {
  // Surfaces the skip reason in vitest output without polluting passing runs.
  // eslint-disable-next-line no-console
  console.warn(
    "[vais-web-aws-lambda-live-deploy] skipped: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_LAMBDA_ROLE_ARN env vars must all be set."
  );
}

#!/usr/bin/env node

/**
 * VaisX CLI entry point.
 *
 * Usage:
 *   vaisx build [--src <dir>] [--out <dir>] [--dev] [--source-map]
 *   vaisx dev [--src <dir>] [--port <port>] [--host <host>]
 *   vaisx new <project-name> [--template <name>] [--no-install]
 */

import { Command } from "commander";
import * as path from "node:path";
import * as fs from "node:fs";

import { loadConfig } from "./config.js";
import { build } from "./build.js";
import { createDevServer } from "./dev.js";
import { scaffold } from "./scaffold.js";
import * as logger from "./logger.js";

const pkg = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
) as { version: string };

const program = new Command();

program
  .name("vaisx")
  .description("VaisX CLI — build tools for .vaisx components")
  .version(pkg.version);

// ── vaisx build ──────────────────────────────────────────────────────────

program
  .command("build")
  .description("Compile .vaisx files and bundle for production")
  .option("--src <dir>", "Source directory (default: from config or 'src')")
  .option("--out <dir>", "Output directory (default: from config or 'dist')")
  .option("--dev", "Enable dev mode (extra debug info)")
  .option("--source-map", "Generate source maps")
  .option("--target <target>", "esbuild target (default: es2022)")
  .action(async (opts: {
    src?: string;
    out?: string;
    dev?: boolean;
    sourceMap?: boolean;
    target?: string;
  }) => {
    const root = process.cwd();

    // Load config file and merge with CLI flags
    const config = await loadConfig(root);

    if (opts.src) config.srcDir = opts.src;
    if (opts.out) config.outDir = opts.out;
    if (opts.dev) config.devMode = true;
    if (opts.sourceMap) config.sourceMap = true;
    if (opts.target) config.target = opts.target;

    const srcDir = path.resolve(root, config.srcDir);
    if (!fs.existsSync(srcDir)) {
      logger.error(`Source directory not found: ${config.srcDir}/`);
      process.exit(1);
    }

    const result = await build(root, config);

    if (result.errors.length > 0) {
      logger.error(
        `Build completed with ${result.errors.length} error${result.errors.length > 1 ? "s" : ""}`,
      );
      process.exit(1);
    }
  });

// ── vaisx dev ───────────────────────────────────────────────────────────

program
  .command("dev")
  .description("Start development server with file watching and HMR")
  .option("--src <dir>", "Source directory (default: from config or 'src')")
  .option("--out <dir>", "Output directory (default: from config or 'dist')")
  .option("--port <port>", "Server port (default: 5173)", "5173")
  .option("--host <host>", "Server host (default: localhost)", "localhost")
  .action(async (opts: {
    src?: string;
    out?: string;
    port: string;
    host: string;
  }) => {
    const root = process.cwd();
    const config = await loadConfig(root);

    if (opts.src) config.srcDir = opts.src;
    if (opts.out) config.outDir = opts.out;
    config.devMode = true;
    config.sourceMap = true;

    const srcDir = path.resolve(root, config.srcDir);
    if (!fs.existsSync(srcDir)) {
      logger.error(`Source directory not found: ${config.srcDir}/`);
      process.exit(1);
    }

    // Initial build
    logger.info("Running initial build...");
    await build(root, config);

    // Start dev server
    const server = await createDevServer({
      root,
      config,
      port: parseInt(opts.port, 10),
      host: opts.host,
    });

    // Graceful shutdown
    const shutdown = async () => {
      logger.info("Shutting down...");
      await server.close();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });

// ── vaisx new ───────────────────────────────────────────────────────────

program
  .command("new")
  .description("Create a new VaisX project")
  .argument("<project-name>", "Name of the project to create")
  .option("--template <name>", "Template to use (default: 'default')", "default")
  .option("--no-install", "Skip package installation")
  .action((projectName: string, opts: { template: string; install: boolean }) => {
    try {
      const result = scaffold({
        projectName,
        template: opts.template,
        install: opts.install,
      });

      logger.success(`Project created at ${result.projectDir}`);
      logger.info("");
      logger.info("Next steps:");
      logger.info(`  cd ${projectName}`);
      if (!result.installed) {
        logger.info("  pnpm install");
      }
      logger.info("  pnpm dev");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(msg);
      process.exit(1);
    }
  });

program.parse();

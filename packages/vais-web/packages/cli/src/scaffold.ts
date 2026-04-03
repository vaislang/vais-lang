/**
 * VaisX project scaffolding.
 *
 * Creates a new VaisX project from a built-in template.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import * as logger from "./logger.js";

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

export interface TemplateFile {
  path: string;
  content: string;
}

function defaultTemplate(projectName: string): TemplateFile[] {
  return [
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: projectName,
          version: "0.1.0",
          private: true,
          type: "module",
          scripts: {
            dev: "vaisx dev",
            build: "vaisx build",
          },
          dependencies: {
            "@vaisx/runtime": "^0.1.0",
          },
          devDependencies: {
            "@vaisx/cli": "^0.1.0",
          },
        },
        null,
        2,
      ) + "\n",
    },
    {
      path: "vaisx.config.ts",
      content: `import type { VaisxConfig } from "@vaisx/cli";

const config: Partial<VaisxConfig> = {
  srcDir: "src",
  outDir: "dist",
};

export default config;
`,
    },
    {
      path: "src/App.vaisx",
      content: `<script>
  count := $state(0)

  fn increment() {
    count = count + 1
  }
</script>

<template>
  <div class="app">
    <h1>VaisX Counter</h1>
    <p>Count: {count}</p>
    <button @click={increment}>Increment</button>
  </div>
</template>

<style>
  .app {
    font-family: system-ui, sans-serif;
    max-width: 600px;
    margin: 2rem auto;
    text-align: center;
  }

  button {
    padding: 0.5rem 1rem;
    font-size: 1rem;
    cursor: pointer;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
  }

  button:hover {
    background: #f0f0f0;
  }
</style>
`,
    },
    {
      path: "public/index.html",
      content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectName}</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/App.js"></script>
</body>
</html>
`,
    },
    {
      path: ".gitignore",
      content: `node_modules/
dist/
*.local
`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Scaffold
// ---------------------------------------------------------------------------

export interface ScaffoldOptions {
  /** Project name (also used as directory name). */
  projectName: string;
  /** Parent directory to create the project in. Default: cwd. */
  parentDir?: string;
  /** Whether to run pnpm install after scaffolding. Default: true. */
  install?: boolean;
  /** Template name. Default: "default". */
  template?: string;
}

export interface ScaffoldResult {
  /** Absolute path of the created project. */
  projectDir: string;
  /** Number of files created. */
  fileCount: number;
  /** Whether package install ran successfully. */
  installed: boolean;
}

/**
 * Create a new VaisX project.
 */
export function scaffold(options: ScaffoldOptions): ScaffoldResult {
  const {
    projectName,
    parentDir = process.cwd(),
    install = true,
    template = "default",
  } = options;

  // Validate project name
  if (!projectName || !/^[a-zA-Z0-9_-]+$/.test(projectName)) {
    throw new Error(
      `Invalid project name: "${projectName}". Use only letters, numbers, hyphens, and underscores.`,
    );
  }

  const projectDir = path.resolve(parentDir, projectName);

  // Check if directory already exists
  if (fs.existsSync(projectDir)) {
    throw new Error(`Directory already exists: ${projectDir}`);
  }

  // Get template files
  let files: TemplateFile[];
  if (template === "default") {
    files = defaultTemplate(projectName);
  } else {
    throw new Error(`Unknown template: "${template}". Available: default`);
  }

  // Create project directory and write files
  fs.mkdirSync(projectDir, { recursive: true });

  for (const file of files) {
    const filePath = path.join(projectDir, file.path);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, file.content, "utf-8");
  }

  logger.success(`Created ${files.length} files in ${projectName}/`);

  // Run pnpm install
  let installed = false;
  if (install) {
    try {
      logger.info("Installing dependencies...");
      execSync("pnpm install", {
        cwd: projectDir,
        stdio: "inherit",
      });
      installed = true;
      logger.success("Dependencies installed");
    } catch {
      logger.warn("Failed to install dependencies. Run 'pnpm install' manually.");
    }
  }

  return { projectDir, fileCount: files.length, installed };
}

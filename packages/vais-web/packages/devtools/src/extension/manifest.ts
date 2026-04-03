// Chrome manifest v3 type definition
export type ChromeManifest = {
  manifest_version: 3;
  name: string;
  version: string;
  description: string;
  devtools_page: string;
  permissions: string[];
  content_scripts: Array<{
    matches: string[];
    js: string[];
    run_at: string;
  }>;
  icons: Record<string, string>;
};

export function generateChromeManifest(): ChromeManifest {
  return {
    manifest_version: 3,
    name: "VaisX DevTools",
    version: "0.1.0",
    description: "Developer tools for VaisX framework",
    devtools_page: "devtools.html",
    permissions: ["devtools"],
    content_scripts: [
      {
        matches: ["<all_urls>"],
        js: ["content-script.js"],
        run_at: "document_start",
      },
    ],
    icons: {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png",
    },
  };
}

import type { VaisXPlugin } from "../types.js";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"]);

/**
 * Simple hash function used to generate content-hash-based file names in build mode.
 */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Return the file extension including the leading dot, e.g. ".png" */
function extname(filePath: string): string {
  const lastSlash = filePath.lastIndexOf("/");
  const fileName = lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath;
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(dotIndex) : "";
}

/** Return the base file name (with extension) */
function basename(filePath: string, ext?: string): string {
  const lastSlash = filePath.lastIndexOf("/");
  let name = lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath;
  if (ext && name.endsWith(ext)) {
    name = name.slice(0, name.length - ext.length);
  }
  return name;
}

export interface ImagePluginOptions {
  /** Public directory prefix. Defaults to "/assets". */
  publicDir?: string;
  /** When true, generates hashed file names (build mode). Defaults to false (dev mode). */
  isBuild?: boolean;
}

/**
 * Image plugin factory.
 *
 * - load: handles image files (.png, .jpg, .jpeg, .gif, .svg, .webp)
 *   - Dev mode:   `export default "/assets/<basename>"`
 *   - Build mode: `export default "/assets/<name>.<hash><ext>"`
 * - Returns null for non-image files so other plugins can handle them.
 */
export function imagePlugin(options?: ImagePluginOptions): VaisXPlugin {
  const publicDir = options?.publicDir ?? "/assets";
  const isBuild = options?.isBuild ?? false;

  return {
    name: "vaisx:image",

    load(id: string) {
      const ext = extname(id).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) {
        return null;
      }

      let url: string;
      if (isBuild) {
        const name = basename(id, ext);
        const hash = simpleHash(id).slice(0, 8);
        url = `${publicDir}/${name}.${hash}${ext}`;
      } else {
        const name = basename(id);
        url = `${publicDir}/${name}`;
      }

      return {
        code: `export default ${JSON.stringify(url)};`,
        map: null,
      };
    },
  };
}

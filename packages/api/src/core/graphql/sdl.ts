import { readFileSync } from "node:fs";

/**
 * Reads a module's SDL file, resolved from the module's `import.meta.url`; the build
 * copies `.graphql` files next to the compiled code.
 */
export function readSdl(moduleUrl: string, path: string): string {
  return readFileSync(new URL(path, moduleUrl), "utf8");
}

import { defineConfig } from "tsdown";

export default defineConfig({
  // The Excel reader runs as a worker, loaded by URL rather than imported.
  entry: ["src/main.ts", "src/resetSetup.ts", "src/utils/xlsxReader.ts"],
  platform: "node",
  format: "esm",
  // Keep the source layout in dist, so paths resolved from import.meta.url still hold.
  unbundle: true,
  fixedExtension: false,
  sourcemap: true,
  // Modules read their SDL and shipped images, such as demo avatars, from next to their
  // code; the avatars' NOTICE travels with them.
  copy: [
    { from: "src/**/*.graphql", flatten: false },
    { from: "src/**/*.webp", flatten: false },
    { from: "src/modules/demo/avatars/NOTICE", flatten: false },
  ],
});

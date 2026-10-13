import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/main.ts"],
  platform: "node",
  format: "esm",
  // Keep the source layout in dist, so paths resolved from import.meta.url still hold.
  unbundle: true,
  fixedExtension: false,
  sourcemap: true,
  // Modules read their SDL and shipped images, such as demo avatars, from next to their code.
  copy: [
    { from: "src/**/*.graphql", flatten: false },
    { from: "src/**/*.webp", flatten: false },
  ],
});

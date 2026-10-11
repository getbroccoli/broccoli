import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  // Module tables stay inside their module; drizzle-kit finds them by file name.
  schema: ["./src/core/db/schema.ts", "./src/modules/*/db/*-table.ts"],
  out: "./drizzle",
});

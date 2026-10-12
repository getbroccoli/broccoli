import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  // Tables stay inside the folder that owns them; drizzle-kit finds them by file name.
  schema: [
    "./src/core/auth/schema.ts",
    "./src/core/*/db/*Table.ts",
    "./src/modules/*/db/*Table.ts",
  ],
  out: "./drizzle",
});

import { eslintConfig, mutationPayloadsConfig } from "@broccoli/config/eslint";
import { defineConfig } from "eslint/config";

export default defineConfig(eslintConfig(import.meta.dirname), mutationPayloadsConfig());

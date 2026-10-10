import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const MAX_LINES_PER_FILE = 300;

/**
 * Builds the shared ESLint flat config for one package.
 * @param {string} packageDir Absolute path of the package, used to find its tsconfig.json.
 */
export function eslintConfig(packageDir) {
  return defineConfig(
    globalIgnores(["dist/", "coverage/", "**/*.gen.ts"]),
    js.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    {
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir: packageDir },
      },
      rules: {
        "max-lines": [
          "error",
          { max: MAX_LINES_PER_FILE, skipBlankLines: true, skipComments: true },
        ],
      },
    },
    {
      files: ["**/*.js"],
      extends: [tseslint.configs.disableTypeChecked],
    },
  );
}

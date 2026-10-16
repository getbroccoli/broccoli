import js from "@eslint/js";
import checkFile from "eslint-plugin-check-file";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

import { importRulesConfig } from "./importRules.js";

export { mutationPayloadsConfig } from "./mutationPayloads.js";

const MAX_LINES_PER_FILE = 300;

// Letters and digits only: camelCase, or PascalCase for React components and their folders.
const CAMEL_OR_PASCAL_CASE = "+([a-zA-Z0-9])";

/**
 * Builds the shared ESLint flat config for one package.
 * @param {string} packageDir Absolute path of the package, used to find its tsconfig.json.
 */
export function eslintConfig(packageDir) {
  return defineConfig(
    globalIgnores(["dist/", "coverage/", "**/*.gen.ts"]),
    {
      // Scoped to code, so GraphQL documents can use their own parser and rules.
      files: ["**/*.{js,ts,tsx}"],
      extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir: packageDir },
      },
      rules: {
        "max-lines": [
          "error",
          { max: MAX_LINES_PER_FILE, skipBlankLines: true, skipComments: true },
        ],
        // RULE1 and RULE10 in docs/code-quality.md.
        "no-restricted-syntax": [
          "error",
          {
            selector: "ExportAllDeclaration",
            message: "List each export by name, so index.ts states the module's contract.",
          },
          {
            selector:
              "ExportNamedDeclaration > TSTypeAliasDeclaration > TSTypeReference[typeName.name='ReturnType']",
            message:
              "Declare the contract as an exported interface and have the factory return it.",
          },
        ],
      },
    },
    {
      files: ["**/*.js"],
      extends: [tseslint.configs.disableTypeChecked],
    },
    {
      // File and folder names: see RULE4 in docs/code-quality.md.
      files: ["src/**/*.{ts,tsx}", "test/**/*.ts"],
      plugins: { "check-file": checkFile },
      rules: {
        "check-file/filename-naming-convention": [
          "error",
          { "**/*.ts": "CAMEL_CASE", "**/*.tsx": CAMEL_OR_PASCAL_CASE },
          // `getCompany.int.test.ts` is checked as `getCompany`.
          { ignoreMiddleExtensions: true },
        ],
        "check-file/folder-naming-convention": [
          "error",
          { "src/**/": CAMEL_OR_PASCAL_CASE, "test/**/": CAMEL_OR_PASCAL_CASE },
        ],
      },
    },
    // What each folder may import: see the package's importRules.json.
    importRulesConfig(packageDir),
  );
}

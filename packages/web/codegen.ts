import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  // Introspection is off, so the schema comes from the API's SDL files.
  schema: "../api/src/**/*.graphql",
  documents: "src/**/*.graphql",
  ignoreNoDocuments: true,
  generates: {
    "src/__generated__/": {
      preset: "client",
      // Apollo Client's data masking replaces the preset's fragment masking.
      presetConfig: { fragmentMasking: false },
      config: {
        customDirectives: { apolloUnmask: true },
        inlineFragmentTypes: "mask",
        useTypeImports: true,
        enumsAsTypes: true,
        strictScalars: true,
        // Dates stay strings on the web; see docs/architecture.md §8.
        scalars: { Date: "string", DateTime: "string" },
      },
    },
    "src/__generated__/possible-types.ts": { plugins: ["fragment-matcher"] },
    "src/__generated__/type-policies.ts": { plugins: ["./codegen/type-policies.ts"] },
  },
};

export default config;

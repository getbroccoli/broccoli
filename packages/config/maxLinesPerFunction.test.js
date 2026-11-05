import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { expect, it } from "vitest";

import { maxLinesPerFunctionConfig } from "./maxLinesPerFunction.js";

it("reports a function with more lines of code than the limit", () => {
  const { plugins, rules } = maxLinesPerFunctionConfig(3);
  const code = `
    function readCount() {
      const count = 1;
      return count;
    }
  `;

  const messages = new Linter().verify(code, { plugins, rules }, "src/a.js");

  expect(messages).toMatchObject([
    {
      ruleId: "broccoli/max-lines-per-function",
      message:
        "This function has 4 lines of code; the most is 3. Extract its steps into named functions.",
    },
  ]);
});

it("does not count blank and comment lines", () => {
  const { plugins, rules } = maxLinesPerFunctionConfig(3);
  const code = `
    function readCount() {

      // The initial count.
      /* This comment
         spans two lines. */
      return 1; // Count this line once.
    }
  `;

  const messages = new Linter().verify(code, { plugins, rules }, "src/a.js");

  expect(messages).toEqual([]);
});

it("accepts a factory whose methods are each within the limit", () => {
  const { plugins, rules } = maxLinesPerFunctionConfig(3);
  const code = `
    const createCounter = () => ({
      readCount() {
        return 1;
      },
      readTotal: () => {
        return 2;
      },
    });
  `;

  const messages = new Linter().verify(code, { plugins, rules }, "src/a.js");

  expect(messages).toEqual([]);
});

it("accepts a factory whose methods wrapped in satisfies are each within the limit", () => {
  const config = maxLinesPerFunctionConfig(3);
  const code = `
    const createCounter = () => ({
      readCount: (() => {
        return 1;
      }) satisfies () => number,
      readTotal: (() => {
        return 2;
      }) satisfies () => number,
    });
  `;

  const messages = new Linter().verify(
    code,
    { ...config, languageOptions: { parser: tseslint.parser } },
    "src/a.ts",
  );

  expect(messages).toEqual([]);
});

it("counts a multi-line computed method key towards the enclosing function", () => {
  const { plugins, rules } = maxLinesPerFunctionConfig(3);
  const code = `
    const createCounter = () => ({
      [keyOf(
        a,
        b
      )]() {
        return 1;
      },
    });
  `;

  const messages = new Linter().verify(code, { plugins, rules }, "src/a.js");

  expect(messages).toMatchObject([
    {
      ruleId: "broccoli/max-lines-per-function",
      line: 2,
      message:
        "This function has 6 lines of code; the most is 3. Extract its steps into named functions.",
    },
  ]);
});

it("reports a long method inside a factory", () => {
  const { plugins, rules } = maxLinesPerFunctionConfig(3);
  const code = `
    const createCounter = () => ({
      readCount() {
        const count = 1;
        return count;
      },
    });
  `;

  const messages = new Linter().verify(code, { plugins, rules }, "src/a.js");

  expect(messages).toMatchObject([
    {
      ruleId: "broccoli/max-lines-per-function",
      line: 3,
      message:
        "This function has 4 lines of code; the most is 3. Extract its steps into named functions.",
    },
  ]);
});

it("does not count blank lines inside a template literal", () => {
  const { plugins, rules } = maxLinesPerFunctionConfig(4);
  const code = `
    function readText() {
      return \`first

      \t
      last\`;
    }
  `;

  const messages = new Linter().verify(code, { plugins, rules }, "src/a.js");

  expect(messages).toEqual([]);
});

it("counts code sharing a line with a member towards the enclosing function", () => {
  const { plugins, rules } = maxLinesPerFunctionConfig(3);
  const code = `
    function createCounter() {
      const counter = { readCount() {} }; work();
      work();
      return counter;
    }
  `;

  const messages = new Linter().verify(code, { plugins, rules }, "src/a.js");

  expect(messages).toMatchObject([
    {
      ruleId: "broccoli/max-lines-per-function",
      line: 2,
      message:
        "This function has 5 lines of code; the most is 3. Extract its steps into named functions.",
    },
  ]);
});

it("uses the component limit for PascalCase functions and the function limit for camelCase functions", () => {
  const { plugins, rules } = maxLinesPerFunctionConfig(3, 4);
  const code = `
    function Counter() {
      const count = 1;
      return count;
    }
    function readCount() {
      const count = 1;
      return count;
    }
  `;

  const messages = new Linter().verify(code, { plugins, rules }, "src/a.js");

  expect(messages).toMatchObject([
    {
      ruleId: "broccoli/max-lines-per-function",
      line: 6,
      message:
        "This function has 4 lines of code; the most is 3. Extract its steps into named functions.",
    },
  ]);
});

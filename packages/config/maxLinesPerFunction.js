/**
 * ESLint config that limits a function's lines of code in production code (RULE73 in
 * docs/code-quality.md); tests follow `docs/testing.md` instead.
 * @param {number} max Most lines of code a function may have.
 * @param {number} [componentMax] Most lines of a React component: a function with a PascalCase name.
 */
export function maxLinesPerFunctionConfig(max, componentMax = max) {
  return {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    plugins: { broccoli: { rules: { "max-lines-per-function": maxLinesPerFunctionRule } } },
    rules: { "broccoli/max-lines-per-function": ["error", max, componentMax] },
  };
}

/**
 * ESLint's `max-lines-per-function` without blank and comment lines, except that a member (an
 * object's or class's method or property) counts on its own and not towards the functions around
 * it, so a factory is measured by its own code and each of its methods by theirs.
 */
const maxLinesPerFunctionRule = {
  meta: {
    type: "suggestion",
    docs: { description: "Limit a function's lines of code, counting members on their own." },
    schema: [
      { type: "integer", minimum: 1 },
      { type: "integer", minimum: 1 },
    ],
  },
  create(context) {
    const [max, componentMax] = context.options;
    const { sourceCode } = context;
    const memberRanges = new Map();
    const check = (node) => {
      const members = memberRanges.get(node) ?? [];
      const lines = new Set();
      for (const token of sourceCode.getTokens(node)) {
        const inMember = members.some(
          ([start, end]) => token.range[0] >= start && token.range[1] <= end,
        );
        if (!inMember && token.value !== ",") {
          for (let line = token.loc.start.line; line <= token.loc.end.line; line++) {
            // A template literal or JSX text may span blank lines.
            if (sourceCode.lines[line - 1].trim()) lines.add(line);
          }
        }
      }
      const member = memberOf(node);
      if (member) {
        // A computed key is code of the enclosing function, not of the member.
        const range = [member.computed ? member.key.range[1] : member.range[0], member.range[1]];
        for (const outer of enclosingFunctions(node)) {
          memberRanges.set(outer, [...(memberRanges.get(outer) ?? []), range]);
        }
      }
      const most = isComponent(node) ? componentMax : max;
      if (lines.size > most) {
        context.report({
          node,
          message: `This function has ${lines.size} lines of code; the most is ${most}. Extract its steps into named functions.`,
        });
      }
    };
    return {
      "FunctionDeclaration:exit": check,
      "FunctionExpression:exit": check,
      "ArrowFunctionExpression:exit": check,
    };
  },
};

/** The property or method whose value the function is, through any type assertion around it. */
function memberOf(node) {
  let { parent } = node;
  while (TYPE_ASSERTIONS.includes(parent.type)) parent = parent.parent;
  return ["MethodDefinition", "Property", "PropertyDefinition"].includes(parent.type)
    ? parent
    : undefined;
}

const TYPE_ASSERTIONS = [
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
  "TSTypeAssertion",
];

function isComponent(node) {
  const name =
    node.id?.name ?? (node.parent.type === "VariableDeclarator" ? node.parent.id.name : undefined);
  return /^[A-Z]/.test(name ?? "");
}

function* enclosingFunctions(node) {
  for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
    if (/Function(Declaration|Expression)$/.test(ancestor.type)) {
      yield ancestor;
    }
  }
}

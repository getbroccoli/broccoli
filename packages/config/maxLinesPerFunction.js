/**
 * ESLint config that limits a function's lines of code in production code (RULE73 in
 * docs/code-quality.md); tests follow `docs/testing.md` instead.
 * @param {number} max Most lines of code a function may have.
 */
export function maxLinesPerFunctionConfig(max) {
  return {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    plugins: { broccoli: { rules: { "max-lines-per-function": maxLinesPerFunctionRule } } },
    rules: { "broccoli/max-lines-per-function": ["error", max] },
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
    schema: [{ type: "integer", minimum: 1 }],
  },
  create(context) {
    const [max] = context.options;
    const codeLines = linesOf(context.sourceCode.ast.tokens);
    const memberLines = new Map();
    const check = (node) => {
      const own = [...linesOf([node])].filter(
        (line) => codeLines.has(line) && !memberLines.get(node)?.has(line),
      );
      if (isMember(node)) {
        for (const outer of enclosingFunctions(node)) {
          memberLines.set(outer, linesOf([node], memberLines.get(outer)));
        }
      }
      if (own.length > max) {
        context.report({
          node,
          message: `This function has ${own.length} lines of code; the most is ${max}. Extract its steps into named functions.`,
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

/** The line numbers the nodes span, added to `lines`. */
function linesOf(nodes, lines = new Set()) {
  for (const { loc } of nodes) {
    for (let line = loc.start.line; line <= loc.end.line; line++) lines.add(line);
  }
  return lines;
}

function isMember({ parent }) {
  return ["MethodDefinition", "Property", "PropertyDefinition"].includes(parent.type);
}

function* enclosingFunctions(node) {
  for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
    if (/Function(Declaration|Expression)$/.test(ancestor.type)) {
      yield ancestor;
    }
  }
}

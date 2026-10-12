import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import boundaries from "eslint-plugin-boundaries";

const RULES_FILE = "importRules.json";
const SOURCE_EXTENSIONS = ["ts", "tsx"];
const ALL_TESTS = "*";
const TEST = "test";

/**
 * Builds the ESLint config that enforces a package's `importRules.json`: what each element
 * (a folder or a single file) may import, through which entry point, and without cycles.
 * @param {string} packageDir Absolute path of the package that holds `importRules.json`.
 */
export function importRulesConfig(packageDir) {
  const rules = readRules(packageDir);
  validateRules(rules, packageDir);
  const elements = expandElements(rules, packageDir);
  rejectCycles(elements);
  const folders = [...elements].filter(([, { isFile }]) => !isFile).map(([path]) => path);
  const files = [...elements].filter(([, { isFile }]) => isFile).map(([path]) => path);
  return [
    {
      files: ["src/**/*.{ts,tsx}", "test/**/*.ts"],
      plugins: { boundaries },
      settings: {
        "boundaries/root-path": packageDir,
        // The plugin matches the first descriptor, so nested folders come before their parents.
        "boundaries/elements": folders
          .toSorted((a, b) => b.split("/").length - a.split("/").length)
          .map((path) => ({ type: path, pattern: path, partialMatch: false })),
        // A single-file element is a file category, which also covers the file's own tests.
        "boundaries/files": [
          { category: TEST, pattern: `**/*.test.{${SOURCE_EXTENSIONS}}` },
          ...files.map((path) => ({
            category: path,
            pattern: singleFilePatterns(packageDir, path),
          })),
        ],
        "import/resolver": { typescript: { project: join(packageDir, "tsconfig.json") } },
      },
      rules: {
        "boundaries/dependencies": [
          "error",
          { default: "disallow", policies: dependencyPolicies(elements, rules) },
        ],
        "boundaries/no-unknown-dependencies": "error",
        "boundaries/no-unknown-files": "error",
        "no-restricted-syntax": [
          "error",
          {
            selector: "ExportAllDeclaration",
            message: "List each export by name, so index.ts states the module's contract.",
          },
        ],
      },
    },
  ];
}

/** Throws on the first path that does not exist or target that is not an element or layer. */
function validateRules({ elements, layers, deepImports, testsMayImport }, packageDir) {
  const requireElements = (from, targets) => {
    for (const target of targets) {
      requireExisting(packageDir, target);
      if (!Object.hasOwn(elements, target)) {
        fail(`"${from}" lists "${target}", which is not an element`);
      }
    }
  };

  for (const [path, targets] of Object.entries(elements)) {
    requireExisting(packageDir, path);
    requireElements(path, targets);
  }
  for (const [layer, siblings] of Object.entries(layers)) {
    for (const sibling of siblings) {
      if (!Object.hasOwn(layers, sibling)) {
        fail(`layer "${layer}" lists "${sibling}", which is not a layer`);
      }
    }
  }
  deepImports.forEach((path) => requireExisting(packageDir, path));
  for (const [path, targets] of Object.entries(testsMayImport)) {
    if (path !== ALL_TESTS) requireExisting(packageDir, path);
    requireElements(path, targets);
  }
}

/**
 * Returns every element with what it may import. A layer folder inside an element becomes an
 * element of its own (`src/modules/company/app`).
 * @returns {Map<string, { isFile: boolean, allowed: string[] }>}
 */
function expandElements({ elements, layers }, packageDir) {
  const expanded = new Map();
  for (const [path, targets] of Object.entries(elements)) {
    const isFile = !isFolderOnDisk(join(packageDir, path));
    const ownLayers = isFile
      ? []
      : Object.keys(layers).filter((layer) => isFolderOnDisk(join(packageDir, path, layer)));
    expanded.set(path, {
      isFile,
      allowed: [...targets, ...ownLayers.map((layer) => `${path}/${layer}`)],
    });
    for (const layer of ownLayers) {
      const siblings = layers[layer].filter((sibling) => ownLayers.includes(sibling));
      expanded.set(`${path}/${layer}`, {
        isFile: false,
        allowed: [...siblings.map((sibling) => `${path}/${sibling}`), ...targets],
      });
    }
  }
  return expanded;
}

/**
 * One policy per element and one for its tests. The plugin applies the last matching policy, so
 * the general allowances come first.
 */
function dependencyPolicies(elements, { deepImports, testsMayImport }) {
  const isFile = (path) => elements.get(path).isFile;
  const source = (path) =>
    isFile(path) ? { file: { categories: path } } : { element: { type: path } };
  const testSource = (path) =>
    isFile(path)
      ? { file: { categories: { allOf: [path, TEST] } } }
      : { element: { type: path }, file: { categories: TEST } };
  const target = (path) =>
    isFile(path) || deepImports.includes(path)
      ? source(path)
      : { element: { type: path, fileInternalPath: `index.{${SOURCE_EXTENSIONS}}` } };
  const testTargets = (path) => [
    ...(isFile(path) ? [path] : []),
    ...(testsMayImport[ALL_TESTS] ?? []),
    ...(testsMayImport[path] ?? []),
  ];

  const elementPolicies = [...elements]
    .flatMap(([path, { allowed }]) => [
      { from: source(path), targets: allowed },
      { from: testSource(path), targets: [...allowed, ...testTargets(path)] },
    ])
    // The plugin rejects a policy that allows nothing.
    .filter(({ targets }) => targets.length > 0)
    .map(({ from, targets }) => ({ from, allow: { to: targets.map(target) } }));

  return [
    { allow: { dependency: { relationship: { to: "internal" } } } },
    { allow: { to: { module: { origin: ["external", "core"] } } } },
    ...elementPolicies,
  ];
}

function readRules(packageDir) {
  const rules = JSON.parse(readFileSync(join(packageDir, RULES_FILE), "utf8"));
  return { elements: {}, layers: {}, deepImports: [], testsMayImport: {}, ...rules };
}

/** A source file also covers its tests (`logger.test.ts`); another file stands for itself. */
function singleFilePatterns(packageDir, path) {
  if (isFileOnDisk(join(packageDir, path))) return path;
  return [`${path}.{${SOURCE_EXTENSIONS}}`, `${path}.*test.{${SOURCE_EXTENSIONS}}`];
}

/** Throws on the first cycle in the declared graph, naming its elements in order. */
function rejectCycles(elements) {
  const finished = new Set();
  const visit = (path, trail) => {
    if (trail.includes(path)) {
      fail(`import cycle: ${[...trail.slice(trail.indexOf(path)), path].join(" → ")}`);
    }
    if (finished.has(path)) return;
    for (const target of elements.get(path).allowed) visit(target, [...trail, path]);
    finished.add(path);
  };
  for (const path of elements.keys()) visit(path, []);
}

function requireExisting(packageDir, path) {
  const candidates = [path, ...SOURCE_EXTENSIONS.map((extension) => `${path}.${extension}`)];
  if (!candidates.some((candidate) => existsSync(join(packageDir, candidate)))) {
    fail(`"${path}" does not exist`);
  }
}

function isFolderOnDisk(path) {
  return existsSync(path) && statSync(path).isDirectory();
}

function isFileOnDisk(path) {
  return existsSync(path) && statSync(path).isFile();
}

function fail(problem) {
  throw new Error(`${RULES_FILE}: ${problem}`);
}

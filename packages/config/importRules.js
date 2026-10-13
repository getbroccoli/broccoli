import { existsSync, readFileSync, statSync } from "node:fs";
import { join, matchesGlob } from "node:path";
import boundaries from "eslint-plugin-boundaries";

const RULES_FILE = "importRules.json";
const SOURCE_EXTENSIONS = ["ts", "tsx"];
const ALL_TESTS = "*";
const TEST = "test";
// Tells the reader, often an agent, how to fix the import, not only that it is refused.
const IMPORT_REFUSED =
  `${RULES_FILE} does not allow "{{dependency.source}}" here. Import another folder through its ` +
  `index.ts, never its inner files. If this import is intended, add the target to this ` +
  `element's list in ${RULES_FILE}; tests never import test files.`;

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
      files: ["{src,test}/**/*.{js,ts,tsx}"],
      plugins: { boundaries },
      settings: {
        "boundaries/root-path": packageDir,
        // The plugin matches the first descriptor, so nested folders come before their parents.
        "boundaries/elements": folders
          .toSorted((a, b) => b.split("/").length - a.split("/").length)
          .map((path) => ({ type: path, pattern: path, partialMatch: false })),
        // A single-file element is a file category, which also covers the file's own tests.
        "boundaries/files": [
          { category: TEST, pattern: testPatterns(folders, files) },
          ...files.map((path) => ({
            category: path,
            pattern: singleFilePatterns(packageDir, path),
          })),
        ],
        // `import("…")` in a type is a dependency too.
        "boundaries/additional-dependency-nodes": [
          { selector: "TSImportType > Literal.source", kind: "type", name: "import-type" },
        ],
        "import/resolver": { typescript: { project: join(packageDir, "tsconfig.json") } },
      },
      rules: {
        "boundaries/dependencies": [
          "error",
          {
            default: "disallow",
            message: IMPORT_REFUSED,
            // Imports inside an element are checked too, so none of them reaches a test.
            checkInternals: true,
            policies: dependencyPolicies(elements, rules),
          },
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
  // The plugin cannot take a file away from the folder element around it.
  for (const path of Object.keys(elements)) {
    if (isFolderOnDisk(join(packageDir, path))) continue;
    const folder = Object.keys(elements).find((other) => path.startsWith(`${other}/`));
    if (folder) fail(`"${path}" is a file inside element "${folder}"`);
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
 * element of its own (`src/modules/company/app`), owned by that element.
 * @returns {Map<string, { owner: string, isFile: boolean, allowed: string[] }>}
 */
function expandElements({ elements, layers }, packageDir) {
  const expanded = new Map();
  for (const [path, targets] of Object.entries(elements)) {
    const isFile = !isFolderOnDisk(join(packageDir, path));
    const ownLayers = isFile
      ? []
      : Object.keys(layers).filter((layer) => isFolderOnDisk(join(packageDir, path, layer)));
    expanded.set(path, {
      owner: path,
      isFile,
      allowed: [...targets, ...ownLayers.map((layer) => `${path}/${layer}`)],
    });
    for (const layer of ownLayers) {
      const siblings = layers[layer].filter((sibling) => ownLayers.includes(sibling));
      expanded.set(`${path}/${layer}`, {
        owner: path,
        isFile: false,
        allowed: [...siblings.map((sibling) => `${path}/${sibling}`), ...targets],
      });
    }
  }
  return expanded;
}

/**
 * One policy per element and one for its tests. The plugin applies the last matching policy, so
 * the general allowances come first and the ban on importing tests comes last.
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
  const testTargets = (path, owner) => [
    ...(isFile(path) ? [path] : []),
    ...(testsMayImport[ALL_TESTS] ?? []),
    ...(testsMayImport[owner] ?? []),
  ];

  const elementPolicies = [...elements]
    .flatMap(([path, { owner, allowed }]) => [
      { from: source(path), targets: allowed },
      { from: testSource(path), targets: [...allowed, ...testTargets(path, owner)] },
    ])
    // The plugin rejects a policy that allows nothing.
    .filter(({ targets }) => targets.length > 0)
    .map(({ from, targets }) => ({ from, allow: { to: targets.map(target) } }));

  return [
    { allow: { dependency: { relationship: { to: "internal" } } } },
    ...elementPolicies,
    { disallow: { to: { file: { categories: TEST } } } },
  ];
}

/** Reads the rules and replaces each target pattern with the elements it matches. */
function readRules(packageDir) {
  const rules = {
    elements: {},
    layers: {},
    deepImports: [],
    testsMayImport: {},
    ...JSON.parse(readFileSync(join(packageDir, RULES_FILE), "utf8")),
  };
  const paths = Object.keys(rules.elements);
  const expand = (lists) =>
    Object.fromEntries(
      Object.entries(lists).map(([from, targets]) => [from, expandTargets(from, targets, paths)]),
    );
  return {
    ...rules,
    elements: expand(rules.elements),
    testsMayImport: expand(rules.testsMayImport),
  };
}

/**
 * `src/core/*` adds every element it matches except `from` itself; `!src/core/server` removes
 * what it matches. Exact paths pass through for validation.
 */
function expandTargets(from, targets, paths) {
  const expanded = new Set();
  for (const target of targets) {
    const isRemoval = target.startsWith("!");
    const pattern = isRemoval ? target.slice(1) : target;
    const isGlob = /[*?[{]/.test(pattern);
    const matches = isGlob
      ? paths.filter((path) => path !== from && matchesGlob(path, pattern))
      : [pattern];
    if (matches.length === 0) fail(`"${from}" lists "${target}", which matches no element`);
    for (const path of matches) {
      if (isRemoval) expanded.delete(path);
      else expanded.add(path);
    }
  }
  return [...expanded];
}

/** Tests inside a folder element or next to a single-file element; any other test is unknown. */
function testPatterns(folders, files) {
  return [
    ...folders.map((path) => `${path}/**/*.test.{${SOURCE_EXTENSIONS}}`),
    ...files.map((path) => `${path}.*test.{${SOURCE_EXTENSIONS}}`),
  ];
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

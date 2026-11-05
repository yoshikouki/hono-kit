import { unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const merge = (base: unknown, override: unknown): unknown => {
  if (!(isObject(base) && isObject(override))) {
    return override;
  }

  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = key in result ? merge(result[key], value) : value;
  }
  return result;
};

const resolveSchema = (schema: JsonObject, rootSchema: JsonObject): JsonObject => {
  const reference = schema.$ref;
  if (typeof reference !== "string" || !reference.startsWith("#/$defs/")) {
    return schema;
  }

  const definitions = rootSchema.$defs;
  const resolved = isObject(definitions)
    ? definitions[reference.slice("#/$defs/".length)]
    : undefined;
  return isObject(resolved) ? resolveSchema(resolved, rootSchema) : schema;
};

const schemaScore = (value: JsonObject, schema: JsonObject): number => {
  const { properties } = schema;
  if (!isObject(properties)) {
    return 0;
  }
  return Object.keys(value).filter((key) => key in properties).length;
};

const selectSchema = (value: unknown, schema: JsonObject, rootSchema: JsonObject) => {
  const resolved = resolveSchema(schema, rootSchema);
  const alternatives = resolved.anyOf;
  if (!Array.isArray(alternatives)) {
    return resolved;
  }

  const candidates = alternatives
    .filter(isObject)
    .map((candidate) => resolveSchema(candidate, rootSchema));
  if (isObject(value)) {
    return candidates.reduce(
      (best, candidate) =>
        schemaScore(value, candidate) > schemaScore(value, best)
          ? candidate
          : best,
      candidates[0] ?? resolved
    );
  }
  if (Array.isArray(value)) {
    return candidates.find((candidate) => candidate.type === "array") ?? resolved;
  }
  return (
    candidates.find((candidate) => {
      const { type } = candidate;
      return type === typeof value || (Array.isArray(type) && type.includes(typeof value));
    }) ?? resolved
  );
};

const unsupportedKeys = new Set([
  "markdown",
  "noConditionalExpect",
  "noDuplicateFieldDefinitionNames",
  "noDuplicateSelectors",
  "noEmptyObjectKeys",
  "noExcessiveNestedCallbacks",
  "noExcessiveSelectorClasses",
  "noIdenticalTestTitle",
  "noInlineStyles",
  "noLoopFunc",
  "noTopLevelLiterals",
  "noUnnecessaryTemplateExpression",
  "noUntrustedLicenses",
  "tailwind",
  "useArraySome",
  "useBaseline",
  "useConsistentTestIt",
  "useDomNodeTextContent",
  "useDomQuerySelector",
  "useExpect",
  "useGraphqlSortedArguments",
  "useGraphqlSortedDefinitions",
  "useGraphqlSortedVariables",
  "useIframeSandbox",
  "useImportsFirst",
  "useMathMinMax",
  "useNamedCaptureGroup",
  "useReduceTypeParameter",
  "useRegexpTest",
  "useTailwindSortedClasses",
  "useTestHooksInOrder",
  "useTestHooksOnTop",
  "useThisInClassMethods",
  "useUnicodeRegex",
  "useVarsOnTop",
]);

const sanitize = (value: unknown, schema: JsonObject, rootSchema: JsonObject): unknown => {
  const selected = selectSchema(value, schema, rootSchema);
  if (Array.isArray(value)) {
    const itemSchema = selected.items;
    return isObject(itemSchema)
      ? value.map((item) => sanitize(item, itemSchema, rootSchema))
      : value;
  }
  if (!isObject(value)) {
    return value;
  }

  const properties = isObject(selected.properties) ? selected.properties : {};
  const additional = selected.additionalProperties;
  const result: JsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    if (unsupportedKeys.has(key)) {
      continue;
    }
    const childSchema = properties[key];
    if (isObject(childSchema)) {
      result[key] = sanitize(child, childSchema, rootSchema);
    } else if (isObject(additional)) {
      result[key] = sanitize(child, additional, rootSchema);
    } else if (additional !== false && Object.keys(properties).length === 0) {
      result[key] = child;
    }
  }
  return result;
};

const readJsonc = async (path: string) => Bun.JSONC.parse(await Bun.file(path).text());

const rootConfig = (await readJsonc("biome.jsonc")) as JsonObject;
const extensions = Array.isArray(rootConfig.extends)
  ? rootConfig.extends.filter((extension): extension is string => typeof extension === "string")
  : [];
const extensionConfigs = await Promise.all(
  extensions.map((extension) => {
    const extensionPath = fileURLToPath(import.meta.resolve(extension));
    return readJsonc(extensionPath);
  })
);
let mergedConfig: unknown = extensionConfigs.reduce(merge, {});

const { extends: _extensions, ...localConfig } = rootConfig;
mergedConfig = merge(mergedConfig, localConfig);

const schemaPath = fileURLToPath(
  import.meta.resolve("@biomejs/biome/configuration_schema.json")
);
const biomeSchema = (await readJsonc(schemaPath)) as JsonObject;
const compatibleConfig = sanitize(mergedConfig, biomeSchema, biomeSchema) as JsonObject;
compatibleConfig.root = undefined;

const temporaryConfig = join(
  process.cwd(),
  `.biome-compat-${crypto.randomUUID()}.json`
);
await writeFile(temporaryConfig, JSON.stringify(compatibleConfig));

try {
  const biomePath = fileURLToPath(import.meta.resolve("@biomejs/biome/bin/biome"));
  const childProcess = Bun.spawn(
    [biomePath, "check", `--config-path=${temporaryConfig}`, ...Bun.argv.slice(2)],
    { stdin: "inherit", stdout: "inherit", stderr: "inherit" }
  );
  process.exitCode = await childProcess.exited;
} finally {
  await unlink(temporaryConfig);
}

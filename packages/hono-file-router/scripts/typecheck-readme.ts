import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const readmePath = join(packageRoot, "README.md");
const readme = await readFile(readmePath, "utf8");
const examples = [...readme.matchAll(/```(?:ts|typescript)\n([\s\S]*?)\n```/g)].map(
  (match) => match[1] ?? ""
);

if (examples.length === 0) {
  throw new Error("README.md contains no TypeScript examples to verify.");
}

const tempRoot = await mkdtemp(join(packageRoot, ".readme-typecheck-"));

try {
  const exampleFiles = await Promise.all(
    examples.map(async (example, index) => {
      const path = join(tempRoot, `example-${index + 1}.ts`);
      await writeFile(path, example);
      return path;
    })
  );
  const configPath = join(tempRoot, "tsconfig.json");
  const config = {
    compilerOptions: {
      lib: ["ES2023", "DOM", "DOM.Iterable"],
      module: "ESNext",
      moduleResolution: "Bundler",
      noEmit: true,
      paths: {
        "@yoshikouki/hono-file-router": ["../dist/index.d.ts"],
      },
      skipLibCheck: true,
      strict: true,
      target: "ES2022",
      types: ["vite/client"],
    },
    files: exampleFiles,
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const result = spawnSync(
    join(packageRoot, "../../node_modules/.bin/tsc"),
    ["-p", configPath],
    {
      cwd: packageRoot,
      encoding: "utf8",
    }
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${result.stdout}${result.stderr}`);
  }

  process.stdout.write(
    `Type-checked ${examples.length} README TypeScript examples against dist/index.d.ts.\n`
  );
} finally {
  await rm(tempRoot, { force: true, recursive: true });
}

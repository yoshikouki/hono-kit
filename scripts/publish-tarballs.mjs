import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const PUBLISHED_PACKAGES = [
  {
    name: "@yoshikouki/hono-file-router",
    url: "https://registry.npmjs.org/%40yoshikouki%2Fhono-file-router",
  },
  {
    name: "@yoshikouki/hono-mdx-renderer",
    url: "https://registry.npmjs.org/%40yoshikouki%2Fhono-mdx-renderer",
  },
  {
    name: "@yoshikouki/hono-rsc-renderer",
    url: "https://registry.npmjs.org/%40yoshikouki%2Fhono-rsc-renderer",
  },
];

const run = (command, args) =>
  new Promise((resolveProcess, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolveProcess();
        return;
      }
      reject(new Error(`${command} exited with code ${code}`));
    });
  });

const registryVersions = async () =>
  new Map(
    await Promise.all(
      PUBLISHED_PACKAGES.map(async ({ name, url }) => {
        const response = await fetch(url, {
          headers: { accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(
            `Could not read ${name} from npm: ${response.status} ${response.statusText}`
          );
        }

        const metadata = await response.json();
        if (
          !metadata ||
          typeof metadata !== "object" ||
          !("versions" in metadata) ||
          !metadata.versions ||
          typeof metadata.versions !== "object"
        ) {
          throw new Error(`npm returned invalid package metadata for ${name}`);
        }

        return [name, new Set(Object.keys(metadata.versions))];
      })
    )
  );

const published = ({ name, version }, knownVersions) => {
  const versions = knownVersions.get(name);
  if (!versions) {
    throw new Error(`Refusing to publish unexpected package: ${name}`);
  }
  return versions.has(version);
};

const [manifestPath] = process.argv.slice(2);
if (!manifestPath) {
  throw new Error("Usage: node scripts/publish-tarballs.mjs <manifest-path>");
}

const dryRun = process.argv.includes("--dry-run");
const packages = JSON.parse(await readFile(manifestPath, "utf8"));
const versionsByPackage = await registryVersions();
for (const packageRelease of packages) {
  if (published(packageRelease, versionsByPackage)) {
    console.log(
      `Skipping published package ${packageRelease.name}@${packageRelease.version}.`
    );
    continue;
  }

  const tarball = resolve(dirname(manifestPath), packageRelease.filename);
  const operation = dryRun ? "Would publish" : "Publishing";
  console.log(
    `${operation} ${packageRelease.name}@${packageRelease.version} with tag ${packageRelease.tag}...`
  );
  if (dryRun) {
    continue;
  }
  // Publishes are intentionally sequential so retries preserve package state.
  // biome-ignore lint/performance/noAwaitInLoops: release operations are ordered
  await run("npm", [
    "publish",
    tarball,
    "--access",
    "public",
    "--tag",
    packageRelease.tag,
  ]);
}

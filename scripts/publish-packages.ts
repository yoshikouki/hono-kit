import { mkdir, readdir } from "node:fs/promises";
import { distTagForVersion, localPackageSpec } from "./release-contract";
import type { PackageManifest } from "./release-contract";

interface PackedPackage {
  filename: string;
  name: string;
  tag: string;
  version: string;
}

interface NpmPackResult {
  filename: string;
  files: { path: string }[];
  name: string;
  version: string;
}

const RELEASE_ROOT = ".release/packages";
const TARBALL_ROOT = ".release/tarballs";

const packageDirectories = async () =>
  (await readdir(RELEASE_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${RELEASE_ROOT}/${entry.name}`)
    .sort();

const readManifest = async (directory: string) =>
  (await Bun.file(`${directory}/package.json`).json()) as PackageManifest;

const pack = async (directory: string) => {
  const process = Bun.spawn(
    [
      "npm",
      "pack",
      "--json",
      "--pack-destination",
      TARBALL_ROOT,
      localPackageSpec(directory),
    ],
    { stderr: "inherit", stdout: "pipe" }
  );
  const stdout = await new Response(process.stdout).text();
  const exitCode = await process.exited;
  if (exitCode !== 0) {
    throw new Error(`npm pack failed for ${directory} (${exitCode})`);
  }

  const [result] = JSON.parse(stdout) as NpmPackResult[];
  if (!result) {
    throw new Error(`npm pack returned no package for ${directory}`);
  }
  console.log(stdout.trim());

  return result;
};

await mkdir(TARBALL_ROOT, { recursive: true });
const manifests = await Promise.all(
  (await packageDirectories()).map(async (directory) => ({
    directory,
    manifest: await readManifest(directory),
  }))
);
const packed: PackedPackage[] = [];

for (const { directory, manifest } of manifests) {
  // Tarballs are built sequentially so the captured npm output remains
  // attributable to one package at a time.
  // biome-ignore lint/performance/noAwaitInLoops: release operations are ordered
  const result = await pack(directory);
  packed.push({
    filename: `tarballs/${result.filename}`,
    name: result.name,
    tag: distTagForVersion(manifest.version),
    version: result.version,
  });
}

await Bun.write(
  ".release/release-manifest.json",
  `${JSON.stringify(packed, null, 2)}\n`
);

import {
  changedPackageDirectories,
  packageChangeNeedsVersion,
  packageVersionChanged,
} from "./release-contract";
import type { PackageManifest } from "./release-contract";

const ZERO_SHA = /^0+$/u;

const run = (command: string[]) => {
  const result = Bun.spawnSync(command, {
    stderr: "pipe",
    stdout: "pipe",
  });

  return {
    exitCode: result.exitCode,
    stderr: result.stderr.toString(),
    stdout: result.stdout.toString(),
  };
};

const readManifest = async (path: string) =>
  (await Bun.file(path).json()) as PackageManifest;

const readManifestAt = (revision: string, path: string) => {
  const result = run(["git", "show", `${revision}:${path}`]);
  if (result.exitCode !== 0) {
    return;
  }

  return JSON.parse(result.stdout) as PackageManifest;
};

const [baseRevision, headRevision] = Bun.argv.slice(2);
if (!baseRevision) {
  throw new Error(
    "Usage: bun run release:check <base-revision> [head-revision]"
  );
}

if (ZERO_SHA.test(baseRevision)) {
  console.log("Skipping package version check for an empty base revision.");
  process.exit(0);
}

const diffCommand = [
  "git",
  "diff",
  "--name-only",
  "--diff-filter=ACMRT",
  baseRevision,
];
if (headRevision) {
  diffCommand.push(headRevision);
}
diffCommand.push("--", "packages");

const diff = run(diffCommand);
if (diff.exitCode !== 0) {
  throw new Error(diff.stderr || "Failed to inspect changed packages.");
}

const changedPaths = diff.stdout.split("\n").filter(Boolean);
const changedDirectories = changedPackageDirectories(changedPaths);
const changedPackages = await Promise.all(
  changedDirectories.map(async (directory) => {
    const manifestPath = `${directory}/package.json`;
    if (!(await Bun.file(manifestPath).exists())) {
      return;
    }

    return {
      changedPaths: changedPaths.filter((path) =>
        path.startsWith(`${directory}/`)
      ),
      current: await readManifest(manifestPath),
      directory,
      previous: readManifestAt(baseRevision, manifestPath),
    };
  })
);
const violations = changedPackages.flatMap((changedPackage) => {
  if (
    !(
      changedPackage?.previous &&
      packageChangeNeedsVersion(
        changedPackage.directory,
        changedPackage.changedPaths,
        changedPackage.previous,
        changedPackage.current
      )
    ) ||
    packageVersionChanged(changedPackage.previous, changedPackage.current)
  ) {
    return [];
  }

  return [
    `${changedPackage.current.name}: package files changed but version is still ${changedPackage.current.version}`,
  ];
});

if (violations.length > 0) {
  throw new Error(
    `Every changed package must declare a new version:\n${violations.map((violation) => `- ${violation}`).join("\n")}`
  );
}

console.log(
  changedDirectories.length > 0
    ? `Verified version changes for ${changedDirectories.length} package(s).`
    : "No package changes require a version update."
);

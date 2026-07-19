import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { exportTargets, publishedManifest } from "./release-contract";
import type { PackageManifest } from "./release-contract";

const RELEASE_ROOT = ".release/packages";

const sourceDirectories = async () =>
  (await readdir("packages", { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => `packages/${entry.name}`)
    .sort();

const preparePackage = async (sourceDirectory: string) => {
  const packageName = sourceDirectory.split("/").at(-1);
  if (!packageName) {
    throw new Error(`Could not resolve package directory: ${sourceDirectory}`);
  }

  const destination = `${RELEASE_ROOT}/${packageName}`;
  const source = (await Bun.file(`${sourceDirectory}/package.json`).json()) as
    PackageManifest;
  const manifest = publishedManifest(source);

  await mkdir(destination, { recursive: true });
  await Promise.all([
    cp(`${sourceDirectory}/dist`, `${destination}/dist`, { recursive: true }),
    cp(`${sourceDirectory}/README.md`, `${destination}/README.md`),
    cp("LICENSE", `${destination}/LICENSE`),
    Bun.write(
      `${destination}/package.json`,
      `${JSON.stringify(manifest, null, 2)}\n`
    ),
  ]);

  const missingTargets = (
    await Promise.all(
      exportTargets(manifest.exports).map(async (target) => ({
        exists:
          target.startsWith("./") &&
          (await Bun.file(`${destination}/${target.slice(2)}`).exists()),
        target,
      }))
    )
  ).filter(({ exists }) => !exists);
  if (missingTargets.length > 0) {
    throw new Error(
      `${source.name} has missing published exports: ${missingTargets.map(({ target }) => target).join(", ")}`
    );
  }

  console.log(`Prepared ${source.name}@${source.version} in ${destination}.`);
};

await rm(".release", { force: true, recursive: true });
await Promise.all((await sourceDirectories()).map(preparePackage));

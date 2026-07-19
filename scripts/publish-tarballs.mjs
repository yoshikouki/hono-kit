import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const REGISTRY = "https://registry.npmjs.org";

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

const published = async ({ name, version }) => {
  const response = await fetch(
    `${REGISTRY}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`,
    { headers: { accept: "application/json" } }
  );

  if (response.status === 404) {
    return false;
  }
  if (!response.ok) {
    throw new Error(
      `Could not read ${name}@${version} from npm: ${response.status} ${response.statusText}`
    );
  }

  return true;
};

const [manifestPath] = process.argv.slice(2);
if (!manifestPath) {
  throw new Error("Usage: node scripts/publish-tarballs.mjs <manifest-path>");
}

const dryRun = process.argv.includes("--dry-run");
const packages = JSON.parse(await readFile(manifestPath, "utf8"));
for (const packageRelease of packages) {
  // Registry checks and publishes are intentionally sequential so a partial
  // failure can be retried without obscuring which package changed state.
  // biome-ignore lint/performance/noAwaitInLoops: release operations are ordered
  if (await published(packageRelease)) {
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
  await run("npm", [
    "publish",
    tarball,
    "--access",
    "public",
    "--tag",
    packageRelease.tag,
  ]);
}

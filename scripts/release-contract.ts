export interface PackageManifest {
  [key: string]: unknown;
  name: string;
  private?: boolean;
  publishConfig?: {
    access?: string;
    exports?: unknown;
    registry?: string;
  };
  version: string;
}

const PACKAGE_PATH = /^packages\/(?<packageName>[^/]+)\//u;
const VERSION =
  /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<prerelease>[0-9A-Za-z-]+)(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const DIST_TAG = /^[a-z][a-z0-9-]*$/u;

export const changedPackageDirectories = (paths: Iterable<string>) => {
  const directories = new Set<string>();

  for (const path of paths) {
    const packageName = PACKAGE_PATH.exec(path)?.groups?.packageName;
    if (packageName) {
      directories.add(`packages/${packageName}`);
    }
  }

  return [...directories].sort();
};

export const distTagForVersion = (version: string) => {
  const match = VERSION.exec(version);
  if (!match) {
    throw new Error(`Invalid semantic version: ${version}`);
  }

  const prerelease = match.groups?.prerelease;
  if (!prerelease) {
    return "latest";
  }
  if (!DIST_TAG.test(prerelease)) {
    throw new Error(
      `The first prerelease identifier must be a lowercase npm dist-tag: ${version}`
    );
  }

  return prerelease;
};

export const packageVersionChanged = (
  previous: PackageManifest,
  current: PackageManifest
) => previous.version !== current.version;

export const localPackageSpec = (directory: string) =>
  directory.startsWith("./") ? directory : `./${directory}`;

export const publishedManifest = (source: PackageManifest) => {
  const { devDependencies, publishConfig, scripts, ...manifest } = source;
  if (!publishConfig?.exports) {
    throw new Error(`${source.name} must declare publishConfig.exports`);
  }

  const { exports, ...publishedConfig } = publishConfig;
  return {
    ...manifest,
    exports,
    publishConfig: publishedConfig,
  };
};

export const exportTargets = (exports: unknown): string[] => {
  if (typeof exports === "string") {
    return [exports];
  }
  if (!exports || typeof exports !== "object") {
    return [];
  }

  return Object.values(exports).flatMap(exportTargets).sort();
};

export interface NpmPackResult {
  filename: string;
  name: string;
  version: string;
}

const isNpmPackResult = (value: unknown): value is NpmPackResult => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const { filename, name, version } = value as Record<string, unknown>;
  return (
    typeof filename === "string" &&
    typeof name === "string" &&
    typeof version === "string"
  );
};

// npm 11 and earlier print an array of results; npm 12 prints an object keyed
// by package name. Both shapes must describe exactly one packed package.
export const singleNpmPackResult = (output: unknown): NpmPackResult => {
  if (!output || typeof output !== "object") {
    throw new Error("npm pack --json returned an unexpected shape");
  }

  const results = Array.isArray(output) ? output : Object.values(output);
  if (results.length !== 1) {
    throw new Error(
      `npm pack --json returned ${results.length} packages; expected exactly one`
    );
  }

  const [result] = results;
  if (!isNpmPackResult(result)) {
    throw new Error(
      "npm pack --json returned a package without name, version, and filename"
    );
  }

  return result;
};

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

const PACKAGE_PATH = /^packages\/([^/]+)\//;
const VERSION =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?<prerelease>[0-9A-Za-z-]+)(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const DIST_TAG = /^[a-z][a-z0-9-]*$/;

export const changedPackageDirectories = (paths: Iterable<string>) => {
  const directories = new Set<string>();

  for (const path of paths) {
    const packageName = PACKAGE_PATH.exec(path)?.[1];
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

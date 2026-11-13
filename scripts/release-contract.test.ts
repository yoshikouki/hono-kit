import { describe, expect, test as it } from "bun:test";
import {
  changedPackageDirectories,
  distTagForVersion,
  exportTargets,
  localPackageSpec,
  packageVersionChanged,
  publishedManifest,
  singleNpmPackResult,
} from "./release-contract";

describe("changedPackageDirectories", () => {
  it("returns each changed package once", () => {
    expect(
      changedPackageDirectories([
        "README.md",
        "packages/hono-rsc-renderer/src/index.ts",
        "packages/hono-file-router/README.md",
        "packages/hono-rsc-renderer/test/index.test.ts",
      ])
    ).toEqual(["packages/hono-file-router", "packages/hono-rsc-renderer"]);
  });
});

describe("distTagForVersion", () => {
  it("uses latest for a stable version", () => {
    expect(distTagForVersion("0.1.0")).toBe("latest");
  });

  it("uses the first prerelease identifier", () => {
    expect(distTagForVersion("0.1.0-beta.12")).toBe("beta");
    expect(distTagForVersion("1.0.0-rc.1+build.7")).toBe("rc");
  });

  it("rejects invalid versions and unsafe dist-tags", () => {
    expect(() => distTagForVersion("v0.1.0")).toThrow(
      "Invalid semantic version"
    );
    expect(() => distTagForVersion("0.1.0-1")).toThrow(
      "lowercase npm dist-tag"
    );
    expect(() => distTagForVersion("0.1.0-BETA.1")).toThrow(
      "lowercase npm dist-tag"
    );
  });
});

describe("packageVersionChanged", () => {
  it("compares the release contract rather than package contents", () => {
    expect(
      packageVersionChanged(
        { name: "@example/package", version: "0.1.0-beta.0" },
        { name: "@example/package", version: "0.1.0-beta.1" }
      )
    ).toBeTrue();
    expect(
      packageVersionChanged(
        { name: "@example/package", version: "0.1.0-beta.0" },
        { name: "@example/package", version: "0.1.0-beta.0" }
      )
    ).toBeFalse();
  });
});

describe("localPackageSpec", () => {
  it("prevents npm from interpreting a directory as a GitHub shorthand", () => {
    expect(localPackageSpec("packages/example")).toBe("./packages/example");
    expect(localPackageSpec("./packages/example")).toBe("./packages/example");
  });
});

describe("publishedManifest", () => {
  it("replaces development exports and removes development-only fields", () => {
    expect(
      publishedManifest({
        devDependencies: { typescript: "latest" },
        exports: { ".": "./src/index.ts" },
        name: "@example/package",
        publishConfig: {
          access: "public",
          exports: { ".": "./dist/index.js" },
          registry: "https://registry.npmjs.org",
        },
        scripts: { build: "build" },
        version: "0.1.0-beta.0",
      })
    ).toEqual({
      exports: { ".": "./dist/index.js" },
      name: "@example/package",
      publishConfig: {
        access: "public",
        registry: "https://registry.npmjs.org",
      },
      version: "0.1.0-beta.0",
    });
  });

  it("requires an explicit published export contract", () => {
    expect(() =>
      publishedManifest({ name: "@example/package", version: "0.1.0" })
    ).toThrow("must declare publishConfig.exports");
  });
});

describe("exportTargets", () => {
  it("collects nested conditional export targets", () => {
    expect(
      exportTargets({
        ".": {
          import: "./dist/index.js",
          types: "./dist/index.d.ts",
        },
        "./package.json": "./package.json",
      })
    ).toEqual(["./dist/index.d.ts", "./dist/index.js", "./package.json"]);
  });
});

describe("singleNpmPackResult", () => {
  const packed = {
    bundled: [],
    entryCount: 2,
    filename: "example-package-0.1.0-beta.0.tgz",
    files: [
      { mode: 420, path: "dist/index.js", size: 2 },
      { mode: 420, path: "package.json", size: 34 },
    ],
    id: "@example/package@0.1.0-beta.0",
    integrity: "sha512-example",
    name: "@example/package",
    shasum: "874eff8dde131139f0d3ba0b002951e5fadf9297",
    size: 164,
    unpackedSize: 36,
    version: "0.1.0-beta.0",
  };

  it("reads the array printed by npm 11", () => {
    expect(singleNpmPackResult([packed])).toMatchObject({
      filename: "example-package-0.1.0-beta.0.tgz",
      name: "@example/package",
      version: "0.1.0-beta.0",
    });
  });

  it("reads the object keyed by package name printed by npm 12", () => {
    expect(singleNpmPackResult({ "@example/package": packed })).toMatchObject({
      filename: "example-package-0.1.0-beta.0.tgz",
      name: "@example/package",
      version: "0.1.0-beta.0",
    });
  });

  it("requires exactly one packed package", () => {
    expect(() => singleNpmPackResult([])).toThrow("returned 0 packages");
    expect(() => singleNpmPackResult({})).toThrow("returned 0 packages");
    expect(() => singleNpmPackResult([packed, packed])).toThrow(
      "returned 2 packages"
    );
  });

  it("rejects output that does not describe a tarball", () => {
    expect(() => singleNpmPackResult(null)).toThrow("unexpected shape");
    expect(() => singleNpmPackResult([{ name: "@example/package" }])).toThrow(
      "without name, version, and filename"
    );
  });
});

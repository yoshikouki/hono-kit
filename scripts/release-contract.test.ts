import { describe, expect, test } from "bun:test";
import {
  changedPackageDirectories,
  distTagForVersion,
  exportTargets,
  localPackageSpec,
  packageVersionChanged,
  publishedManifest,
} from "./release-contract";

describe("changedPackageDirectories", () => {
  test("returns each changed package once", () => {
    expect(
      changedPackageDirectories([
        "README.md",
        "packages/hono-rsc-renderer/src/index.ts",
        "packages/hono-file-router/README.md",
        "packages/hono-rsc-renderer/test/index.test.ts",
      ])
    ).toEqual([
      "packages/hono-file-router",
      "packages/hono-rsc-renderer",
    ]);
  });
});

describe("distTagForVersion", () => {
  test("uses latest for a stable version", () => {
    expect(distTagForVersion("0.1.0")).toBe("latest");
  });

  test("uses the first prerelease identifier", () => {
    expect(distTagForVersion("0.1.0-beta.12")).toBe("beta");
    expect(distTagForVersion("1.0.0-rc.1+build.7")).toBe("rc");
  });

  test("rejects invalid versions and unsafe dist-tags", () => {
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
  test("compares the release contract rather than package contents", () => {
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
  test("prevents npm from interpreting a directory as a GitHub shorthand", () => {
    expect(localPackageSpec("packages/example")).toBe("./packages/example");
    expect(localPackageSpec("./packages/example")).toBe("./packages/example");
  });
});

describe("publishedManifest", () => {
  test("replaces development exports and removes development-only fields", () => {
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

  test("requires an explicit published export contract", () => {
    expect(() =>
      publishedManifest({ name: "@example/package", version: "0.1.0" })
    ).toThrow("must declare publishConfig.exports");
  });
});

describe("exportTargets", () => {
  test("collects nested conditional export targets", () => {
    expect(
      exportTargets({
        ".": {
          import: "./dist/index.js",
          types: "./dist/index.d.ts",
        },
        "./package.json": "./package.json",
      })
    ).toEqual([
      "./dist/index.d.ts",
      "./dist/index.js",
      "./package.json",
    ]);
  });
});

import type { GlobFiles, HonoRoutesSource } from "../types";
import { dirname, ensureTrailingSlash, normalizePath } from "../route-path";

interface BunGlob {
  scanSync: (options: { cwd: string }) => Iterable<string>;
}

interface BunRuntime {
  Glob: new (pattern: string) => BunGlob;
}

function fileUrlToPath(url: URL): string {
  if (url.protocol !== "file:") {
    throw new Error(`Expected a file URL, got ${url.href}.`);
  }
  return decodeURIComponent(url.pathname);
}

function pathToDirectoryUrl(path: string): URL {
  return new URL(`file://${ensureTrailingSlash(path)}`);
}

function parseStackFile(line: string): string | null {
  const match = line.match(
    /((?:file:\/\/)?\/[^\s)]+?\.[cm]?[jt]sx?)(?::\d+:\d+)?/
  );
  if (!match) {
    return null;
  }

  const withoutLocation = match[1].replace(/:\d+:\d+$/, "");
  return withoutLocation.startsWith("file://")
    ? fileUrlToPath(new URL(withoutLocation))
    : withoutLocation;
}

function inferCallerDirectory(): string | undefined {
  const currentFile = fileUrlToPath(new URL(import.meta.url));
  const internalDirectory = dirname(dirname(currentFile));
  const stack = new Error().stack?.split("\n") ?? [];

  for (const line of stack) {
    const file = parseStackFile(line);
    if (
      file &&
      file !== currentFile &&
      !file.startsWith(`${internalDirectory}/`)
    ) {
      return dirname(file);
    }
  }

  return undefined;
}

function getBunRuntime(): BunRuntime | undefined {
  const candidate = (globalThis as { Bun?: BunRuntime }).Bun;
  return candidate?.Glob ? candidate : undefined;
}

export function createDefaultHonoRouteSource<TModule>(
  base: string
): HonoRoutesSource<TModule> {
  const bun = getBunRuntime();
  if (!bun) {
    throw new Error(
      "createFileRouter({ base }) requires Bun runtime discovery. Pass explicit sources, such as import.meta.glob results, outside Bun."
    );
  }

  const callerDirectory = inferCallerDirectory();
  if (!callerDirectory) {
    throw new Error(
      "createFileRouter({ base }) could not infer the caller directory. Pass explicit sources instead."
    );
  }

  const baseUrl = new URL(
    ensureTrailingSlash(base),
    pathToDirectoryUrl(callerDirectory)
  );
  const basePath = fileUrlToPath(baseUrl);
  const routeFiles: GlobFiles<TModule> = {};
  const normalizedBase = normalizePath(base).replace(/\/+$/, "");

  for (const relativeFile of new bun.Glob("**/*.ts").scanSync({
    cwd: basePath,
  })) {
    if (relativeFile.endsWith(".d.ts")) {
      continue;
    }

    const normalizedFile = normalizePath(relativeFile);
    const file = `${normalizedBase}/${normalizedFile}`;
    const moduleUrl = new URL(normalizedFile, baseUrl).href;
    routeFiles[file] = () => import(moduleUrl) as Promise<TModule>;
  }

  return {
    files: routeFiles,
    routes: { name: "hono-routes" },
  };
}

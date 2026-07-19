import type { RoutePathConvention, RoutePathResult } from "./types";

const RE_DYNAMIC_SEGMENT = /^\[([A-Za-z_$][\w$]*)\]$/;
const RE_CATCH_ALL_SEGMENT = /^\[\.{3}([A-Za-z_$][\w$]*)\]$/;
const RE_PLAIN_DYNAMIC_PATH_SEGMENT = /^:([A-Za-z_$][\w$]*)$/;
const RE_CATCH_ALL_PATH_SEGMENT = /^:([A-Za-z_$][\w$]*)\{\.\+\}$/;
const RE_STATIC_PATH_SEGMENT = /^[^\\:*?{}#]+$/;
const RE_GROUP_SEGMENT = /^\(.+\)$/;
const RE_LEADING_DOT_SLASH = /^\.\/+/;
const RE_ROUTE_EXTENSION = /\.[^.]+$/;
const RE_TRAILING_INDEX = /(^|\/)index$/;

interface RoutePathEntry {
  path: string;
}

type RouteSegmentKind = "static" | "dynamic" | "catch-all";

interface ParsedRouteSegment {
  kind: RouteSegmentKind;
  value: string;
}

const SEGMENT_ORDER: Record<RouteSegmentKind, number> = {
  static: 0,
  dynamic: 1,
  "catch-all": 2,
};

export function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

export function normalizePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/\/+/g, "/");
}

export function dirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function firstCapture(match: RegExpMatchArray | null): string | null {
  return match?.[1] ?? null;
}

function dynamicSegmentName(segment: string, file: string): string | null {
  const catchAllName = firstCapture(segment.match(RE_CATCH_ALL_SEGMENT));
  if (catchAllName) {
    return catchAllName;
  }

  const dynamicName = firstCapture(segment.match(RE_DYNAMIC_SEGMENT));
  if (dynamicName) {
    return dynamicName;
  }

  if (segment.includes("[") || segment.includes("]")) {
    throw new Error(
      `Unsupported dynamic route segment "${segment}" in ${file}. Only single segments like [id] are supported.`
    );
  }

  return null;
}

function segmentToRoutePath(segment: string, file: string): string {
  if (RE_GROUP_SEGMENT.test(segment)) {
    return "";
  }

  const catchAllName = firstCapture(segment.match(RE_CATCH_ALL_SEGMENT));
  if (catchAllName) {
    return `:${catchAllName}{.+}`;
  }

  const paramName = dynamicSegmentName(segment, file);
  if (paramName) {
    return `:${paramName}`;
  }

  return segment;
}

function assertUniqueDynamicSegmentNames(segments: string[], file: string): void {
  const seen = new Set<string>();
  for (const segment of segments) {
    const paramName = dynamicSegmentName(segment, file);
    if (!paramName) {
      continue;
    }
    if (seen.has(paramName)) {
      throw new Error(
        `Duplicate dynamic route param "${paramName}" in ${file}. Use unique names such as [postId].`
      );
    }
    seen.add(paramName);
  }
}

function defaultRouteFileToManifestPath(file: string): RoutePathResult {
  const normalizedFile = trimSlashes(
    normalizePath(file).replace(RE_LEADING_DOT_SLASH, "")
  );
  const withoutExt = normalizedFile.replace(RE_ROUTE_EXTENSION, "");
  const withoutIndex = withoutExt.replace(RE_TRAILING_INDEX, "");
  const segments = withoutIndex.split("/").filter(Boolean);
  assertUniqueDynamicSegmentNames(segments, file);
  const routeSegments = segments
    .map((segment) => segmentToRoutePath(segment, file))
    .filter(Boolean);

  return {
    path: routeSegments.length > 0 ? `/${routeSegments.join("/")}` : "/",
  };
}

export const honoFilePathConvention: RoutePathConvention = {
  name: "hono-file",
  toPath: defaultRouteFileToManifestPath,
};

export function routeFileToManifestPath(
  file: string,
  convention: RoutePathConvention = honoFilePathConvention
): RoutePathResult {
  return convention.toPath(file);
}

export function hasDynamicRouteSegments(path: string): boolean {
  return parseRoutePath(path).some((segment) => segment.kind !== "static");
}

export function routePathToShape(path: string): string {
  const segments = parseRoutePath(path).map((segment) => {
    if (segment.kind === "dynamic") {
      return ":param";
    }
    if (segment.kind === "catch-all") {
      return ":param{.+}";
    }
    return segment.value;
  });

  return segments.length > 0 ? `/${segments.join("/")}` : "/";
}

function invalidRoutePath(path: string, detail: string): Error {
  return new Error(
    `Unsupported file-router path "${path}": ${detail} Supported paths use static segments, plain dynamic segments such as ":id", or one terminal catch-all such as ":slug{.+}".`
  );
}

function parseRoutePath(path: string): ParsedRouteSegment[] {
  if (path === "/") {
    return [];
  }
  if (!path.startsWith("/")) {
    throw invalidRoutePath(path, "Paths must start with \"/\".");
  }
  if (path.endsWith("/")) {
    throw invalidRoutePath(path, "Trailing slashes are not canonical.");
  }

  const rawSegments = path.slice(1).split("/");
  if (rawSegments.some((segment) => segment.length === 0)) {
    throw invalidRoutePath(path, "Empty path segments are not canonical.");
  }

  const paramNames = new Set<string>();
  return rawSegments.map((segment, index) => {
    const dynamicName = segment.match(RE_PLAIN_DYNAMIC_PATH_SEGMENT)?.[1];
    const catchAllName = segment.match(RE_CATCH_ALL_PATH_SEGMENT)?.[1];
    const paramName = dynamicName ?? catchAllName;

    if (paramName) {
      if (paramNames.has(paramName)) {
        throw invalidRoutePath(
          path,
          `Dynamic param "${paramName}" must be unique within one path.`
        );
      }
      paramNames.add(paramName);
    }

    if (dynamicName) {
      return { kind: "dynamic", value: segment };
    }
    if (catchAllName) {
      if (index !== rawSegments.length - 1) {
        throw invalidRoutePath(
          path,
          "A catch-all must be the terminal segment."
        );
      }
      return { kind: "catch-all", value: segment };
    }
    if (RE_STATIC_PATH_SEGMENT.test(segment)) {
      return { kind: "static", value: segment };
    }
    throw invalidRoutePath(
      path,
      `Segment "${segment}" uses unsupported Hono pattern syntax.`
    );
  });
}

export function assertSupportedRoutePath(path: string): void {
  parseRoutePath(path);
}

function compareCanonicalPaths(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

export function compareRouteSpecificity(a: string, b: string): number {
  const aSegments = parseRoutePath(a);
  const bSegments = parseRoutePath(b);
  const length = Math.max(aSegments.length, bSegments.length);
  const aFallbackOrder = Math.max(
    SEGMENT_ORDER.static,
    ...aSegments.map((segment) => SEGMENT_ORDER[segment.kind])
  );
  const bFallbackOrder = Math.max(
    SEGMENT_ORDER.static,
    ...bSegments.map((segment) => SEGMENT_ORDER[segment.kind])
  );

  for (let index = 0; index < length; index += 1) {
    const aSegment = aSegments[index];
    const bSegment = bSegments[index];
    const kindDifference =
      (aSegment ? SEGMENT_ORDER[aSegment.kind] : aFallbackOrder) -
      (bSegment ? SEGMENT_ORDER[bSegment.kind] : bFallbackOrder);
    if (kindDifference !== 0) {
      return kindDifference;
    }
  }

  const lengthDifference = bSegments.length - aSegments.length;
  return lengthDifference === 0
    ? compareCanonicalPaths(a, b)
    : lengthDifference;
}

export function sortRoutesBySpecificity<T extends RoutePathEntry>(
  routes: T[]
): T[] {
  return [...routes].sort((a, b) => compareRouteSpecificity(a.path, b.path));
}

function routeParamName(segment: string): string | null {
  return (
    segment.match(RE_PLAIN_DYNAMIC_PATH_SEGMENT)?.[1] ??
    segment.match(RE_CATCH_ALL_PATH_SEGMENT)?.[1] ??
    null
  );
}

export function pathnameFromRoutePath(
  routePath: string,
  params: Record<string, string>
): string {
  const segments = routePath
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      const paramName = routeParamName(segment);
      if (!paramName) {
        return segment;
      }

      const value = params[paramName];
      return value === undefined ? segment : encodeURIComponent(value);
    });

  return segments.length > 0 ? `/${segments.join("/")}` : "/";
}

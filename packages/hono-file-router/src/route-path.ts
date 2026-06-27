import type {
  RouteParams,
  RoutePathConvention,
  RoutePathResult,
} from "./types";

const RE_DYNAMIC_SEGMENT = /^\[([A-Za-z_$][\w$]*)\]$/;
const RE_CATCH_ALL_SEGMENT = /^\[\.{3}([A-Za-z_$][\w$]*)\]$/;
const RE_HONO_PARAM_NAME = /^[A-Za-z_$][\w$]*/;
const RE_GROUP_SEGMENT = /^\(.+\)$/;
const RE_LEADING_DOT_SLASH = /^\.\/+/;
const RE_ROUTE_EXTENSION = /\.[^.]+$/;
const RE_TRAILING_INDEX = /(^|\/)index$/;

interface RoutePathEntry {
  path: string;
}

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

function dynamicSegmentName(segment: string, file: string): string | null {
  const catchAllMatch = segment.match(RE_CATCH_ALL_SEGMENT);
  if (catchAllMatch) {
    return catchAllMatch[1];
  }

  const match = segment.match(RE_DYNAMIC_SEGMENT);
  if (match) {
    return match[1];
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

  const catchAllMatch = segment.match(RE_CATCH_ALL_SEGMENT);
  if (catchAllMatch) {
    return `:${catchAllMatch[1]}{.+}`;
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
  return path.split("/").some((segment) => segment.startsWith(":"));
}

export function routePathToShape(path: string): string {
  const segments = path
    .split("/")
    .filter(Boolean)
    .map((segment) => (segment.startsWith(":") ? ":param" : segment));

  return segments.length > 0 ? `/${segments.join("/")}` : "/";
}

function pathSegments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function isDynamicSegment(segment: string): boolean {
  return segment.startsWith(":");
}

function hasDynamicSegment(segments: string[]): boolean {
  return segments.some(isDynamicSegment);
}

function routePrefixesCompatible(aSegments: string[], bSegments: string[]): boolean {
  const length = Math.min(aSegments.length, bSegments.length);
  for (let i = 0; i < length; i += 1) {
    const a = aSegments[i];
    const b = bSegments[i];
    if (a !== b && !(isDynamicSegment(a) || isDynamicSegment(b))) {
      return false;
    }
  }
  return true;
}

export function routePathsOverlap(a: string, b: string): boolean {
  const aSegments = pathSegments(a);
  const bSegments = pathSegments(b);
  if (aSegments.length !== bSegments.length) {
    return false;
  }

  return aSegments.every((segment, index) => {
    const other = bSegments[index];
    return (
      segment === other || isDynamicSegment(segment) || isDynamicSegment(other)
    );
  });
}

function compareRouteSpecificity(a: string, b: string): number {
  const aSegments = pathSegments(a);
  const bSegments = pathSegments(b);
  const aHasDynamic = hasDynamicSegment(aSegments);
  const bHasDynamic = hasDynamicSegment(bSegments);

  if (!routePathsOverlap(a, b)) {
    if (aHasDynamic !== bHasDynamic) {
      return aHasDynamic ? 1 : -1;
    }
    if (!(aHasDynamic || bHasDynamic)) {
      return bSegments.length - aSegments.length;
    }
    if (routePrefixesCompatible(aSegments, bSegments)) {
      return bSegments.length - aSegments.length;
    }
    return 0;
  }

  const length = Math.min(aSegments.length, bSegments.length);

  for (let i = 0; i < length; i += 1) {
    const aDynamic = isDynamicSegment(aSegments[i]);
    const bDynamic = isDynamicSegment(bSegments[i]);
    if (aDynamic !== bDynamic) {
      return aDynamic ? 1 : -1;
    }
  }

  return bSegments.length - aSegments.length;
}

export function sortRoutesBySpecificity<T extends RoutePathEntry>(
  routes: T[]
): T[] {
  return routes
    .map((route, index) => ({ index, route }))
    .sort((a, b) => {
      const specificity = compareRouteSpecificity(a.route.path, b.route.path);
      return specificity === 0 ? a.index - b.index : specificity;
    })
    .map(({ route }) => route);
}

function routeParamName(segment: string): string | null {
  if (!segment.startsWith(":")) {
    return null;
  }

  return segment.slice(1).match(RE_HONO_PARAM_NAME)?.[0] ?? null;
}

export function pathnameFromRoutePath(
  routePath: string,
  params: RouteParams
): string {
  const segments = routePath
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      const paramName = routeParamName(segment);
      if (!paramName) {
        return segment;
      }

      return Object.hasOwn(params, paramName)
        ? encodeURIComponent(params[paramName])
        : segment;
    });

  return segments.length > 0 ? `/${segments.join("/")}` : "/";
}

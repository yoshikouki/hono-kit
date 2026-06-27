import type {
  HonoRoute,
  RouteDirectory,
  RouteDirectoryEntry,
  RouteManifest,
} from "./types";
import { dirname, normalizePath, trimSlashes } from "./route-path";

export interface RouteDirectoryAncestorsOptions {
  includeSelf?: boolean;
}

export interface InheritedRouteProvidersOptions<
  TProvider extends RouteDirectoryEntry,
> {
  filter?: (provider: TProvider) => boolean;
  includeSelf?: boolean;
  nearest?: boolean;
}

export function normalizeRouteDirectory(directory: string): string {
  return trimSlashes(normalizePath(directory));
}

export function parentRouteDirectory(directory: string): string | undefined {
  const normalized = normalizeRouteDirectory(directory);
  if (!normalized) {
    return;
  }
  return dirname(normalized);
}

export function routeDirectoryAncestors(
  directory: string,
  options: RouteDirectoryAncestorsOptions = {}
): string[] {
  const includeSelf = options.includeSelf ?? true;
  const ancestors: string[] = [];
  let current = normalizeRouteDirectory(directory);

  if (includeSelf) {
    ancestors.push(current);
  }

  while (current) {
    current = parentRouteDirectory(current) ?? "";
    ancestors.push(current);
  }

  return ancestors;
}

export function findInheritedRouteProviders<
  TConsumer extends Pick<RouteDirectoryEntry, "routeDirectory">,
  TProvider extends RouteDirectoryEntry,
>(
  consumer: TConsumer,
  providers: TProvider[],
  options: InheritedRouteProvidersOptions<TProvider> = {}
): TProvider[] {
  const includeSelf = options.includeSelf ?? true;
  const nearest = options.nearest ?? false;
  const ancestorSet = new Set(
    routeDirectoryAncestors(consumer.routeDirectory, { includeSelf })
  );
  const providersByDirectory = new Map<string, TProvider[]>();

  for (const provider of providers) {
    if (options.filter && !options.filter(provider)) {
      continue;
    }
    const directory = normalizeRouteDirectory(provider.routeDirectory);
    if (!ancestorSet.has(directory)) {
      continue;
    }
    const directoryProviders = providersByDirectory.get(directory) ?? [];
    directoryProviders.push(provider);
    providersByDirectory.set(directory, directoryProviders);
  }

  const inherited: TProvider[] = [];
  for (const directory of ancestorSet) {
    const directoryProviders = providersByDirectory.get(directory) ?? [];
    if (directoryProviders.length === 0) {
      continue;
    }
    inherited.push(...directoryProviders);
    if (nearest) {
      break;
    }
  }

  return inherited;
}

export function findNearestInheritedRouteProvider<
  TConsumer extends Pick<RouteDirectoryEntry, "routeDirectory">,
  TProvider extends RouteDirectoryEntry,
>(
  consumer: TConsumer,
  providers: TProvider[],
  options: Omit<InheritedRouteProvidersOptions<TProvider>, "nearest"> = {}
): TProvider | undefined {
  return findInheritedRouteProviders(consumer, providers, {
    ...options,
    nearest: true,
  })[0];
}

export function createRouteDirectories<
  TManifest extends Pick<RouteManifest, "handlers" | "routes">,
>(manifest: TManifest): RouteDirectory[] {
  const directories = new Map<string, RouteDirectory>();

  const ensureDirectory = (directory: string) => {
    const normalized = normalizeRouteDirectory(directory);
    const existing = directories.get(normalized);
    if (existing) {
      return existing;
    }

    const parent = parentRouteDirectory(normalized);
    const created: RouteDirectory = {
      directory: normalized,
      handlers: [],
      parent,
      routes: [],
    };
    directories.set(normalized, created);
    if (parent !== undefined) {
      ensureDirectory(parent);
    }
    return created;
  };

  for (const route of manifest.routes) {
    ensureDirectory(route.routeDirectory).routes.push(route);
  }

  for (const handler of manifest.handlers as HonoRoute[]) {
    ensureDirectory(handler.routeDirectory).handlers.push(handler);
  }

  return [...directories.values()].sort((a, b) =>
    a.directory.localeCompare(b.directory)
  );
}

import { Hono } from "hono";
import type { Env, Handler } from "hono";

export type FileRouteKind =
  | "page"
  | "content"
  | "handler"
  | (string & {});

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "ALL";
export type RouteParams = Record<string, string>;
export type GlobValue<T = unknown> = T | (() => T | Promise<T>);
export type GlobFiles<T = unknown> = Record<string, GlobValue<T>>;

export interface FileRoute<TModule = unknown, TData = unknown> {
  file: string;
  id: string;
  kind: FileRouteKind;
  load?: () => Promise<TModule>;
  metadata?: TData;
  path: string;
  rendererName?: string;
  routeDirectory: string;
}

export interface MatchedRoute<
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
> {
  context: TContext;
  params: RouteParams;
  pathname: string;
  request: Request;
  route: FileRoute<TModule, TData>;
  url: URL;
}

export interface RenderInput<
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
> extends MatchedRoute<TContext, TModule, TData> {
  generatedRoute?: GeneratedRoute<TContext, TModule, TData>;
}

export interface GeneratedRoute<
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
> {
  kind?: string;
  method?: HttpMethod;
  owner: string;
  path: string;
  render: (
    input: RenderInput<TContext, TModule, TData>
  ) => Response | Promise<Response>;
}

export interface FileRouteSource<TModule = unknown> {
  contents?: string;
  file: string;
  kind?: FileRouteKind;
  load?: () => Promise<TModule>;
}

export interface FileRouteAdapter<TModule = unknown, TData = unknown> {
  accepts: (source: FileRouteSource<TModule>) => boolean;
  name: string;
  toRoutes: (
    source: FileRouteSource<TModule>
  ) =>
    | FileRoute<TModule, TData>
    | FileRoute<TModule, TData>[]
    | null
    | undefined;
}

export interface FileRouteRenderer<
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
> {
  accepts: (route: FileRoute<TModule, TData>) => boolean;
  generatedRoutes?: (
    route: FileRoute<TModule, TData>
  ) => GeneratedRoute<TContext, TModule, TData>[];
  name: string;
  render: (
    input: RenderInput<TContext, TModule, TData>
  ) => Response | Promise<Response>;
}

export interface HonoRoutesProducer {
  name: string;
}

export interface HonoRouteModule {
  default?: HonoLikeApp;
}

export interface HonoLikeApp {
  fetch: (request: Request, env?: unknown) => Response | Promise<Response>;
}

export interface HonoRoute<TModule = unknown> {
  file: string;
  id: string;
  load: () => Promise<TModule>;
  path: string;
  routeDirectory: string;
  routesName: string;
}

export type RendererSource<
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
> = {
  dynamicRoutes?: boolean;
  files: GlobFiles<TModule>;
  kind?: FileRouteKind;
  renderer: FileRouteRenderer<TContext, TModule, TData>;
  routes?: never;
};

export type HonoRoutesSource<TModule = unknown> = {
  dynamicRoutes?: boolean;
  files: GlobFiles<TModule>;
  kind?: FileRouteKind;
  renderer?: never;
  routes: HonoRoutesProducer;
};

export type RouteSource<
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
> =
  | RendererSource<TContext, TModule, TData>
  | HonoRoutesSource<TModule>;

export interface RouteManifestConfig<
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
> {
  base: string;
  sources: RouteSource<TContext, TModule, TData>[];
}

export interface DefaultRouteManifestConfig {
  base: string;
  sources?: never;
}

export interface RouteManifest<
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
> {
  generatedRoutes: GeneratedRoute<TContext, TModule, TData>[];
  handlers: HonoRoute<TModule>[];
  renderers: FileRouteRenderer<TContext, TModule, TData>[];
  routes: FileRoute<TModule, TData>[];
}

export type FileRouterInput<
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
> =
  | RouteManifestConfig<TContext, TModule, TData>
  | DefaultRouteManifestConfig
  | { manifest: RouteManifest<TContext, TModule, TData> };

export interface FileRouterOptions<TContext = unknown> {
  createContext?: (request: Request) => TContext | Promise<TContext>;
  strict?: boolean;
}

export type CreateFileRouterOptions<
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
> = FileRouterInput<TContext, TModule, TData> & FileRouterOptions<TContext>;

export type MountFileRoutesOptions<
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
> = FileRouterInput<TContext, TModule, TData> & FileRouterOptions<TContext>;

const RE_DYNAMIC_SEGMENT = /^\[([A-Za-z_$][\w$]*)\]$/;
const RE_HONO_PARAM_NAME = /^[A-Za-z_$][\w$]*/;
const RE_ROUTE_EXTENSION = /\.[^.]+$/;
const RE_TRAILING_INDEX = /(^|\/)index$/;

interface RoutePathEntry {
  path: string;
}

interface RoutePathResult {
  path: string;
  routeDirectory: string;
}

interface RegisteredRoutePath {
  generated?: boolean;
  ownerPath: string;
  path: string;
  source: string;
}

interface BunGlob {
  scanSync: (options: { cwd: string }) => Iterable<string>;
}

interface BunRuntime {
  Glob: new (pattern: string) => BunGlob;
}

function toLoader<TModule>(value: GlobValue<TModule>): () => Promise<TModule> {
  return async () => {
    if (typeof value === "function") {
      return (await (value as () => TModule | Promise<TModule>)()) as TModule;
    }
    return value;
  };
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/\/+/g, "/");
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeBase(base: string): string {
  return trimSlashes(normalizePath(base).replace(/^\.\/+/, ""));
}

function stripBase(file: string, base: string): string {
  const normalizedFile = normalizePath(file).replace(/^\.\/+/, "");
  const normalizedBase = normalizeBase(base);
  const prefix = `${normalizedBase}/`;

  if (normalizedFile === normalizedBase) {
    return "";
  }

  if (normalizedFile.startsWith(prefix)) {
    return normalizedFile.slice(prefix.length);
  }

  const nestedIndex = normalizedFile.indexOf(`/${prefix}`);
  if (nestedIndex !== -1) {
    return normalizedFile.slice(nestedIndex + prefix.length + 1);
  }

  throw new Error(`Route file "${file}" is not under base "${base}".`);
}

function dirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
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
  const stack = new Error().stack?.split("\n") ?? [];

  for (const line of stack) {
    const file = parseStackFile(line);
    if (file && file !== currentFile) {
      return dirname(file);
    }
  }

  return undefined;
}

function getBunRuntime(): BunRuntime | undefined {
  const candidate = (globalThis as { Bun?: BunRuntime }).Bun;
  return candidate?.Glob ? candidate : undefined;
}

function createDefaultHonoRouteSource<TModule>(
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

function dynamicSegmentName(segment: string, file: string): string | null {
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

export function routeFileToManifestPath(
  file: string,
  options: { base: string }
): RoutePathResult {
  const withoutBase = stripBase(file, options.base);
  const withoutExt = withoutBase.replace(RE_ROUTE_EXTENSION, "");
  const withoutIndex = withoutExt.replace(RE_TRAILING_INDEX, "");
  const segments = withoutIndex.split("/").filter(Boolean);
  assertUniqueDynamicSegmentNames(segments, file);
  const routeSegments = segments.map((segment) =>
    segmentToRoutePath(segment, file)
  );

  return {
    path: routeSegments.length > 0 ? `/${routeSegments.join("/")}` : "/",
    routeDirectory: RE_TRAILING_INDEX.test(withoutExt)
      ? withoutIndex
      : dirname(withoutExt),
  };
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
  const length = Math.min(aSegments.length, bSegments.length);

  for (let i = 0; i < length; i += 1) {
    const aDynamic = isDynamicSegment(aSegments[i]);
    const bDynamic = isDynamicSegment(bSegments[i]);
    if (aDynamic !== bDynamic) {
      return aDynamic ? 1 : -1;
    }
    if (!aDynamic && aSegments[i] !== bSegments[i]) {
      return 0;
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

function assertDynamicRoutePolicy(
  path: string,
  file: string,
  dynamicRoutes: boolean
): void {
  if (!dynamicRoutes && hasDynamicRouteSegments(path)) {
    throw new Error(
      `Dynamic route "${path}" from ${file} is disabled for this source.`
    );
  }
}

function routeId(kind: string, file: string): string {
  return `${kind}:${file}`;
}

function isRendererSource<
  TContext,
  TModule,
  TData,
>(
  source: RouteSource<TContext, TModule, TData>
): source is RendererSource<TContext, TModule, TData> {
  return "renderer" in source;
}

function hasExplicitSources<
  TContext,
  TModule,
  TData,
>(
  input:
    | RouteManifestConfig<TContext, TModule, TData>
    | DefaultRouteManifestConfig
): input is RouteManifestConfig<TContext, TModule, TData> {
  return Array.isArray(
    (input as RouteManifestConfig<TContext, TModule, TData>).sources
  );
}

function isRscRoute(path: string): boolean {
  return path === "/__rsc" || path.startsWith("/__rsc/");
}

function generatedRoutesConflict(
  a: RegisteredRoutePath,
  b: RegisteredRoutePath
): boolean {
  if (!((a.generated || b.generated) && routePathsOverlap(a.path, b.path))) {
    return false;
  }

  if (
    a.generated &&
    b.generated &&
    routePathsOverlap(a.ownerPath, b.ownerPath) &&
    !(isRscRoute(a.ownerPath) || isRscRoute(b.ownerPath))
  ) {
    return false;
  }

  if (isRscRoute(a.path) || isRscRoute(b.path)) {
    return true;
  }

  return a.path === b.path;
}

function assertNoGeneratedCollision(
  candidate: RegisteredRoutePath,
  registered: RegisteredRoutePath[]
): void {
  const collision = registered.find((entry) =>
    generatedRoutesConflict(candidate, entry)
  );
  if (collision) {
    throw new Error(
      `Duplicate route "${candidate.path}": ${collision.source} and ${candidate.source}`
    );
  }
}

export function createRouteManifest<
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
>(
  config: RouteManifestConfig<TContext, TModule, TData>
): RouteManifest<TContext, TModule, TData> {
  if (config.sources.length === 0) {
    throw new Error("createRouteManifest requires at least one route source.");
  }

  const generatedRoutes: GeneratedRoute<TContext, TModule, TData>[] = [];
  const handlers: HonoRoute<TModule>[] = [];
  const primaryShapes = new Map<string, string>();
  const registered: RegisteredRoutePath[] = [];
  const renderers: FileRouteRenderer<TContext, TModule, TData>[] = [];
  const routes: FileRoute<TModule, TData>[] = [];

  for (const source of config.sources) {
    const dynamicRoutes = source.dynamicRoutes ?? true;
    if (isRendererSource(source)) {
      renderers.push(source.renderer);
    }

    for (const [file, value] of Object.entries(source.files)) {
      const manifestPath = routeFileToManifestPath(file, {
        base: config.base,
      });
      assertDynamicRoutePolicy(manifestPath.path, file, dynamicRoutes);

      if (isRendererSource(source)) {
        const route: FileRoute<TModule, TData> = {
          file,
          id: routeId(source.renderer.name, file),
          kind: source.kind ?? "page",
          load: toLoader(value),
          path: manifestPath.path,
          rendererName: source.renderer.name,
          routeDirectory: manifestPath.routeDirectory,
        };
        if (!source.renderer.accepts(route)) {
          throw new Error(
            `Renderer "${source.renderer.name}" does not accept ${file}.`
          );
        }
        routes.push(route);

        const shape = routePathToShape(route.path);
        const duplicate = primaryShapes.get(shape);
        if (duplicate) {
          throw new Error(
            `Duplicate route "${route.path}": ${duplicate} and ${file}`
          );
        }
        primaryShapes.set(shape, file);

        const primaryEntry = {
          ownerPath: route.path,
          path: route.path,
          source: file,
        };
        assertNoGeneratedCollision(primaryEntry, registered);
        registered.push(primaryEntry);

        for (const generatedRoute of source.renderer.generatedRoutes?.(route) ??
          []) {
          const generatedEntry = {
            generated: true,
            ownerPath: route.path,
            path: generatedRoute.path,
            source: `${file} generated route ${generatedRoute.path}`,
          };
          assertNoGeneratedCollision(generatedEntry, registered);
          generatedRoutes.push(generatedRoute);
          registered.push(generatedEntry);
        }
        continue;
      }

      const handler: HonoRoute<TModule> = {
        file,
        id: routeId(source.routes.name, file),
        load: toLoader(value),
        path: manifestPath.path,
        routeDirectory: manifestPath.routeDirectory,
        routesName: source.routes.name,
      };

      const shape = routePathToShape(handler.path);
      const duplicate = primaryShapes.get(shape);
      if (duplicate) {
        throw new Error(
          `Duplicate route "${handler.path}": ${duplicate} and ${file}`
        );
      }
      primaryShapes.set(shape, file);

      const handlerEntry = {
        ownerPath: handler.path,
        path: handler.path,
        source: file,
      };
      assertNoGeneratedCollision(handlerEntry, registered);
      handlers.push(handler);
      registered.push(handlerEntry);
    }
  }

  return {
    generatedRoutes,
    handlers: sortRoutesBySpecificity(handlers),
    renderers,
    routes: sortRoutesBySpecificity(routes),
  };
}

function resolveManifest<
  TContext,
  TModule,
  TData,
>(
  input: FileRouterInput<TContext, TModule, TData>
): RouteManifest<TContext, TModule, TData> {
  if ("manifest" in input) {
    return input.manifest;
  }

  if (hasExplicitSources(input)) {
    return createRouteManifest(input);
  }

  return createRouteManifest({
    base: input.base,
    sources: [createDefaultHonoRouteSource<TModule>(input.base)],
  });
}

function rendererForRoute<
  TContext,
  TModule,
  TData,
>(
  manifest: RouteManifest<TContext, TModule, TData>,
  route: FileRoute<TModule, TData>
): FileRouteRenderer<TContext, TModule, TData> {
  const renderer = manifest.renderers.find(
    (candidate) =>
      candidate.name === route.rendererName || candidate.accepts(route)
  );
  if (!renderer) {
    throw new Error(`No renderer registered for route "${route.path}".`);
  }
  return renderer;
}

async function createRenderInput<
  TContext,
  TModule,
  TData,
>(
  request: Request,
  route: FileRoute<TModule, TData>,
  params: RouteParams,
  options: FileRouterOptions<TContext>,
  generatedRoute?: GeneratedRoute<TContext, TModule, TData>
): Promise<RenderInput<TContext, TModule, TData>> {
  const context = options.createContext
    ? await options.createContext(request)
    : (undefined as TContext);
  return {
    context,
    generatedRoute,
    params,
    pathname: pathnameFromRoutePath(route.path, params),
    request,
    route,
    url: new URL(request.url),
  };
}

function registerGeneratedRoute<E extends Env>(
  app: Hono<E>,
  path: string,
  method: HttpMethod,
  handler: Handler<E>
): void {
  switch (method) {
    case "GET":
      app.get(path, handler);
      return;
    case "POST":
      app.post(path, handler);
      return;
    case "PUT":
      app.put(path, handler);
      return;
    case "PATCH":
      app.patch(path, handler);
      return;
    case "DELETE":
      app.delete(path, handler);
      return;
    case "ALL":
      app.all(path, handler);
      return;
  }
}

function honoAppFromModule(module: unknown): HonoLikeApp {
  const candidate =
    module && typeof module === "object" && "default" in module
      ? (module as HonoRouteModule).default
      : module;

  if (!candidate || typeof (candidate as HonoLikeApp).fetch !== "function") {
    throw new Error("Hono route modules must default export a Hono app.");
  }

  return candidate as HonoLikeApp;
}

function stripMountPath(pathname: string, mountPath: string): string {
  if (mountPath === "/") {
    return pathname;
  }
  if (pathname === mountPath) {
    return "/";
  }
  if (pathname.startsWith(`${mountPath}/`)) {
    return pathname.slice(mountPath.length) || "/";
  }
  return pathname;
}

function requestForMount(request: Request, mountPath: string): Request {
  const url = new URL(request.url);
  url.pathname = stripMountPath(url.pathname, mountPath);
  return new Request(url, request);
}

function isRoutableHonoApp(
  value: HonoLikeApp
): value is HonoLikeApp & { routes: unknown[] } {
  return Array.isArray((value as { routes?: unknown }).routes);
}

function mountedHonoApp<E extends Env>(
  mountPath: string,
  routeApp: HonoLikeApp
): HonoLikeApp {
  if (!isRoutableHonoApp(routeApp)) {
    return {
      fetch: (request, env) =>
        routeApp.fetch(requestForMount(request, mountPath), env),
    };
  }

  const mounted = new Hono<E>();
  mounted.route(mountPath, routeApp as unknown as Hono<E>);
  return {
    fetch: (request, env) => mounted.fetch(request, env as E["Bindings"]),
  };
}

export function mountFileRoutes<
  E extends Env = Env,
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
>(
  app: Hono<E>,
  options: MountFileRoutesOptions<TContext, TModule, TData>
): Hono<E> {
  const manifest = resolveManifest(options);

  for (const route of manifest.routes) {
    app.get(route.path, async (c) => {
      const renderer = rendererForRoute(manifest, route);
      return renderer.render(
        await createRenderInput(c.req.raw, route, c.req.param(), options)
      );
    });
  }

  const routesById = new Map(manifest.routes.map((route) => [route.id, route]));
  for (const generatedRoute of manifest.generatedRoutes) {
    const owner = routesById.get(generatedRoute.owner);
    if (!owner) {
      throw new Error(
        `Generated route "${generatedRoute.path}" references unknown owner "${generatedRoute.owner}".`
      );
    }
    registerGeneratedRoute(
      app,
      generatedRoute.path,
      generatedRoute.method ?? "GET",
      async (c) =>
        generatedRoute.render(
          await createRenderInput(
            c.req.raw,
            owner,
            c.req.param(),
            options,
            generatedRoute
          )
        )
    );
  }

  for (const handlerRoute of manifest.handlers) {
    let mountedApp: HonoLikeApp | undefined;
    const handler: Handler<E> = async (c) => {
      if (!mountedApp) {
        const module = await handlerRoute.load();
        const routeApp = honoAppFromModule(module);
        mountedApp = mountedHonoApp(handlerRoute.path, routeApp);
      }
      return mountedApp.fetch(c.req.raw, c.env);
    };
    app.all(handlerRoute.path, handler);
    if (handlerRoute.path !== "/") {
      app.all(`${handlerRoute.path}/*`, handler);
    }
  }

  return app;
}

export function createFileRouter<
  E extends Env = Env,
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
>(
  options: CreateFileRouterOptions<TContext, TModule, TData>
): Hono<E> {
  const app = new Hono<E>({ strict: options.strict });
  return mountFileRoutes(app, options);
}

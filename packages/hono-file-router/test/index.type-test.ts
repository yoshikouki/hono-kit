import { Hono } from "hono";
import type { Context } from "hono";
import { Hono as QuickHono } from "hono/quick";
import { Hono as TinyHono } from "hono/tiny";
import {
  type CreateFileRouterOptions,
  createFileRouter,
  createRouteManifest,
  type FileRoute,
  type FileRouteRenderer,
  type GeneratedRoute,
  type HonoRouteSource,
  type HttpMethod,
  type MountFileRoutesOptions,
  mountFileRoutes,
  type RenderInput,
  type RouteManifest,
  type RouteManifestConfig,
  type RoutePathConvention,
  type RoutePathResult,
} from "@yoshikouki/hono-file-router";

interface AppEnv {
  Bindings: {
    prefix: string;
  };
  Variables: {
    userId: string;
  };
}

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() =>
    Value extends Right ? 1 : 2
    ? true
    : false;

type PublicValues = keyof typeof import("@yoshikouki/hono-file-router");
const publicValuesMatch: Equal<
  PublicValues,
  "createFileRouter" | "createRouteManifest" | "mountFileRoutes"
> = true;
String(publicValuesMatch);

const method: HttpMethod = "PATCH";
const route: FileRoute = {
  file: "./users/[id].tsx",
  id: "context-native:./users/[id].tsx",
  path: "/users/:id",
};
const generatedRoute: GeneratedRoute<AppEnv> = {
  method,
  path: "/__data/users/:id",
  render({ c, route: owner }) {
    return c.json({ owner: owner.id });
  },
};

const renderer: FileRouteRenderer<AppEnv> = {
  name: "context-native",
  accepts: () => true,
  generatedRoutes(): GeneratedRoute<AppEnv>[] {
    return [generatedRoute];
  },
  render({ c, route: renderedRoute }) {
    const userId: string = c.var.userId;
    const prefix: string = c.env.prefix;
    const routeParam: string | undefined = c.req.param("id");
    return c.render(
      `${userId}:${prefix}:${routeParam}:${renderedRoute.path}`
    );
  },
};

const conventionResult: RoutePathResult = { path: "/custom" };
const pathConvention: RoutePathConvention = {
  name: "custom",
  toPath: () => conventionResult,
};
const manifestConfig: RouteManifestConfig<AppEnv> = {
  pathConvention,
  sources: [
    {
      files: { "./users/[id].tsx": "user" },
      renderer,
    },
  ],
};
const manifest: RouteManifest<AppEnv> =
  createRouteManifest<AppEnv>(manifestConfig);

const createOptions: CreateFileRouterOptions<AppEnv> = {
  getPath(request, options) {
    const prefix: string | undefined = options?.env?.prefix;
    const { pathname } = new URL(request.url);
    return prefix ? `/${prefix}${pathname}` : pathname;
  },
  manifest,
};
const mountOptions: MountFileRoutesOptions<AppEnv> = { manifest };

const app = new Hono<AppEnv>();
mountFileRoutes(app, mountOptions);
createFileRouter<AppEnv>(createOptions);

mountFileRoutes(app, {
  // @ts-expect-error Existing apps already own their Hono constructor options.
  getPath: (request) => new URL(request.url).pathname,
  manifest,
});

const typedRoute = new Hono<AppEnv>();
typedRoute.get("/", (c) => c.text(`${c.var.userId}:${c.env.prefix}`));
const typedRouteSource: HonoRouteSource<AppEnv> = { default: typedRoute };
createFileRouter<AppEnv>({
  sources: [{ files: { "./users/[id].ts": typedRouteSource } }],
});

const quickDirect = new QuickHono<AppEnv>();
quickDirect.get("/", (c) => c.text(c.var.userId));
const tinyModule = new TinyHono<AppEnv>();
tinyModule.get("/", (c) => c.text(c.env.prefix));
createFileRouter<AppEnv>({
  sources: [
    {
      files: {
        "./quick.ts": quickDirect,
        "./tiny.ts": { default: tinyModule },
      },
    },
  ],
});

// @ts-expect-error Hono route-source modules must be eager.
createFileRouter({ sources: [{ files: { "./lazy.ts": async () => typedRoute } }] });
createFileRouter({
  // @ts-expect-error Hono-like fetch objects are not Hono route modules.
  sources: [{ files: { "./like.ts": { fetch: () => new Response() } } }],
});

const input: RenderInput<AppEnv> = {
  c: {} as Context<AppEnv>,
  route,
};
input.c.req.param("id");

// @ts-expect-error createContext was replaced by Hono middleware and c.var.
createFileRouter({ sources: manifestConfig.sources, createContext: () => ({}) });

// @ts-expect-error RenderInput exposes the raw request as c.req.raw instead.
String(input.request);
// @ts-expect-error RenderInput exposes the URL as c.req.url instead.
String(input.url);
// @ts-expect-error RenderInput exposes params as c.req.param() instead.
String(input.params);
// @ts-expect-error RenderInput exposes the pathname as c.req.path instead.
String(input.pathname);
// @ts-expect-error Router-specific context was replaced by typed c.var.
String(input.context);

// @ts-expect-error Route grammar helpers are internal implementation details.
export type RemovedRouteFileToManifestPath = typeof import("@yoshikouki/hono-file-router").routeFileToManifestPath;
// @ts-expect-error Route ordering helpers are internal implementation details.
export type RemovedSortRoutesBySpecificity = typeof import("@yoshikouki/hono-file-router").sortRoutesBySpecificity;
// @ts-expect-error Route shape helpers are internal implementation details.
export type RemovedRoutePathToShape = typeof import("@yoshikouki/hono-file-router").routePathToShape;
// @ts-expect-error Manifest internals are not public extension points.
export type RemovedManifestGeneratedRoute = import("@yoshikouki/hono-file-router").ManifestGeneratedRoute;
// @ts-expect-error Source normalization aliases are inferred from public options.
export type RemovedRouteSources = import("@yoshikouki/hono-file-router").RouteSources;
// @ts-expect-error Alias-only router inputs were replaced by responsibility-specific options.
export type RemovedFileRouterInput = import("@yoshikouki/hono-file-router").FileRouterInput;
// @ts-expect-error Hono constructor options belong only to CreateFileRouterOptions.
export type RemovedFileRouterOptions = import("@yoshikouki/hono-file-router").FileRouterOptions;
// @ts-expect-error Unused adapter contracts are not part of the package API.
export type RemovedFileRouteAdapter = import("@yoshikouki/hono-file-router").FileRouteAdapter;

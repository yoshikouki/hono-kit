import { Hono } from "hono";
import type { Context } from "hono";
import { Hono as QuickHono } from "hono/quick";
import { Hono as TinyHono } from "hono/tiny";
import {
  type CreateFileRouterOptions,
  createFileRouter,
  createRouteManifest,
  type FileRouteRenderer,
  type FileRouterInput,
  type FileRouterOptions,
  type GeneratedRoute,
  type MountFileRoutesOptions,
  mountFileRoutes,
  type RenderInput,
  type RendererSource,
  type RouteManifest,
  type RouteManifestConfig,
  type RouteSource,
  type RouteSources,
} from "@yoshikouki/hono-file-router";

interface AppEnv {
  Bindings: {
    prefix: string;
  };
  Variables: {
    userId: string;
  };
}

const renderer: FileRouteRenderer<AppEnv> = {
  name: "context-native",
  accepts: () => true,
  generatedRoutes(route): GeneratedRoute<AppEnv>[] {
    return [
      {
        path: `/__data${route.path}`,
        render({ c, route: owner }) {
          const userId: string = c.var.userId;
          const prefix: string = c.env.prefix;
          const routeParam: string | undefined = c.req.param("id");
          return c.render(`${userId}:${prefix}:${routeParam}:${owner.path}`);
        },
      },
    ];
  },
  render({ c, route }) {
    const userId: string = c.var.userId;
    const prefix: string = c.env.prefix;
    const routeParam: string | undefined = c.req.param("id");
    return c.render(`${userId}:${prefix}:${routeParam}:${route.path}`);
  },
};

const source: RendererSource<AppEnv> = {
  files: { "./users/[id].tsx": "user" },
  renderer,
};
const routeSource: RouteSource<AppEnv> = source;
const routeSources: RouteSources<AppEnv> = [routeSource];
const manifestConfig: RouteManifestConfig<AppEnv> = {
  sources: routeSources,
};
const manifest: RouteManifest<AppEnv> = createRouteManifest<AppEnv>({
  sources: [source],
});
const generatedOwner: string | undefined = manifest.generatedRoutes[0]?.owner;
String(generatedOwner);
const routerOptions: FileRouterOptions<AppEnv> = {
  getPath(request, options) {
    const prefix: string | undefined = options?.env?.prefix;
    const { pathname } = new URL(request.url);
    return prefix ? `/${prefix}${pathname}` : pathname;
  },
};
const fileRouterInput: FileRouterInput<AppEnv> = {
  ...routerOptions,
  manifest,
};
const createOptions: CreateFileRouterOptions<AppEnv> = fileRouterInput;
const mountOptions: MountFileRoutesOptions<AppEnv> = fileRouterInput;

const app = new Hono<AppEnv>();
mountFileRoutes(app, mountOptions);
createFileRouter<AppEnv>(createOptions);
createRouteManifest(manifestConfig);

const typedRoute = new Hono<AppEnv>();
typedRoute.get("/", (c) => {
  const userId: string = c.var.userId;
  const prefix: string = c.env.prefix;
  const routeParam: string | undefined = c.req.param("id");
  return c.render(`${userId}:${prefix}:${routeParam}`);
});
createFileRouter<AppEnv>({
  sources: [{ files: { "./users/[id].ts": { default: typedRoute } } }],
});

const quickDirect = new QuickHono<AppEnv>();
quickDirect.get("/", (c) => c.text(c.var.userId));
const quickModule = new QuickHono<AppEnv>();
quickModule.get("/", (c) => c.text(c.env.prefix));
const tinyDirect = new TinyHono<AppEnv>();
tinyDirect.get("/", (c) => c.text(c.var.userId));
const tinyModule = new TinyHono<AppEnv>();
tinyModule.get("/", (c) => c.text(c.env.prefix));
createFileRouter<AppEnv>({
  sources: [
    {
      files: {
        "./quick-direct.ts": quickDirect,
        "./quick-module.ts": { default: quickModule },
        "./tiny-direct.ts": tinyDirect,
        "./tiny-module.ts": { default: tinyModule },
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
  route: {
    file: "./users/[id].tsx",
    id: "context-native:./users/[id].tsx",
    path: "/users/:id",
  },
};
input.c.req.param("id");

// @ts-expect-error createContext was replaced by Hono middleware and c.var.
createFileRouter({ sources: [source], createContext: () => ({}) });

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
// @ts-expect-error Generated routes receive their owner as input.route.
String(input.generatedRoute);

// @ts-expect-error MatchedRoute was removed from the public contract.
export type RemovedMatchedRoute = import("@yoshikouki/hono-file-router").MatchedRoute;
// @ts-expect-error RouteParams was removed in favor of c.req.param().
export type RemovedRouteParams = import("@yoshikouki/hono-file-router").RouteParams;
// @ts-expect-error Route grammar validation remains internal to manifest/plan compilation.
export type RemovedAssertSupportedRoutePath = typeof import("@yoshikouki/hono-file-router").assertSupportedRoutePath;
// @ts-expect-error Route ordering remains internal to registration-plan compilation.
export type RemovedCompareRouteSpecificity = typeof import("@yoshikouki/hono-file-router").compareRouteSpecificity;

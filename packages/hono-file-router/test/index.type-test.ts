import { Hono } from "hono";
import type { Context } from "hono";
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
        owner: route.id,
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

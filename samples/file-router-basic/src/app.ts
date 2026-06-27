import { Hono } from "hono";
import {
  createFileRouter,
  createRouteManifest,
  findNearestInheritedRouteProvider,
  type HonoLikeApp,
  type HonoRouteModule,
} from "@yoshikouki/hono-file-router";

const routeSource = {
  files: {
    "./index.ts": () => import("./routes/index"),
    "./users/[id]/index.ts": () => import("./routes/users/[id]/index"),
    "./users/[id]/posts/[postId].ts": () =>
      import("./routes/users/[id]/posts/[postId]"),
    "./docs/(guides)/[...slug].ts": () =>
      import("./routes/docs/(guides)/[...slug]"),
    "./api.ts": () => import("./routes/api"),
  },
};

const notFoundManifest = createRouteManifest({
  sources: [
    {
      files: {
        "./_404.ts": () => import("./routes/_404"),
        "./users/_404.ts": () => import("./routes/users/_404"),
      },
    },
  ],
});
const notFoundProviders = notFoundManifest.handlers.filter((handler) =>
  handler.file.endsWith("_404.ts")
);

function routeDirectoryForPath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  segments.pop();
  return segments.join("/");
}

async function fetchNotFoundProvider(
  provider: (typeof notFoundProviders)[number],
  request: Request,
  env: unknown
): Promise<Response> {
  const module = (await provider.load()) as HonoRouteModule;
  const routeApp = module.default as HonoLikeApp | undefined;
  if (!routeApp) {
    return new Response("Not Found", { status: 404 });
  }
  return routeApp.fetch(request, env);
}

export const fileBasedRoutes = createFileRouter({
  manifest: createRouteManifest({
    sources: [routeSource],
  }),
});

export const app = new Hono();
app.use("*", async (c, next) => {
  await next();
  if (c.res.status !== 404) {
    return;
  }

  const provider = findNearestInheritedRouteProvider(
    { routeDirectory: routeDirectoryForPath(c.req.path) },
    notFoundProviders
  );
  if (provider) {
    c.res = await fetchNotFoundProvider(provider, c.req.raw, c.env);
  }
});
app.route("/", fileBasedRoutes);

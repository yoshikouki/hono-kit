# @yoshikouki/hono-file-router

File-based routing core for Hono.

This package owns route discovery contracts, renderer registration, generated
route declarations, route-directory metadata, and the Hono router adapter.
Applications and build tools still own file discovery.

## Contract

- `FileRoute` is the durable route unit.
- `MatchedRoute` is the request-time route match with params and context.
- `FileRouteAdapter` turns discovered source files into routes.
- `FileRouteRenderer` renders routes and declares generated routes.
- `GeneratedRoute` lets renderers expose endpoints such as raw Markdown without
  hard-coding renderer semantics into the router core.
- `RoutePathConvention` converts route-root-relative file keys into Hono paths.
- Directory helpers resolve inherited provider routes without hard-coding names
  such as `_404` or `_renderer`.

The implementation includes manifest creation, generated-route collision checks,
`createFileRouter()`, and `mountFileRoutes()`.

## Usage

Pass discovered route modules to `createFileRouter()`. Each Hono route module
must default export a Hono router.

```ts
import { Hono } from "hono";
import { createFileRouter } from "@yoshikouki/hono-file-router";
import { honoRoutes } from "@yoshikouki/hono-file-router/hono-routes";

const fileBasedRoutes = createFileRouter({
  sources: [
    {
      files: import.meta.glob("./**/*.ts", { base: "./routes" }),
      routes: honoRoutes(),
    },
  ],
});

const app = new Hono();
app.route("/", fileBasedRoutes);
```

The default path convention supports `index`, `[id]`, `[...slug]`, and route
groups such as `(marketing)`.

```ts
routeFileToManifestPath("./docs/(guides)/[...slug].ts");
// { path: "/docs/:slug{.+}", routeDirectory: "docs/(guides)" }
```

For app-level conventions such as `_404.ts`, keep the convention outside the
router core and use route-directory helpers to resolve inherited providers.

```ts
const pages = createRouteManifest({ sources: pageSources });
const providers = createRouteManifest({ sources: providerSources });

const notFoundProvider = findNearestInheritedRouteProvider(
  pages.routes[0],
  providers.routes.filter((route) => route.file.endsWith("_404.tsx"))
);
```

Custom file-route renderers can adapt non-Hono route modules without teaching
the router core about that module format.

```ts
import { createFileRouter } from "@yoshikouki/hono-file-router";

const jsonRenderer = {
  name: "json",
  accepts: (route) => route.file.endsWith(".json"),
  async render({ route }) {
    const source = await route.load?.();
    return Response.json(source);
  },
};

const fileBasedRoutes = createFileRouter({
  sources: [
    {
      files: import.meta.glob("./**/*.json", { base: "./routes/data" }),
      renderer: jsonRenderer,
    },
  ],
});
```

For tests and tooling, use `createRouteManifest()` directly and pass the result
to either `createFileRouter({ manifest })` or `mountFileRoutes(app, {
manifest })`.

# @yoshikouki/hono-file-router

File-based routing core for Hono.

This package owns route source contracts, path conventions, manifest creation,
renderer registration, generated route declarations, route-directory metadata,
specificity ordering, collision checks, and the Hono router adapter.
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

## Boundaries

The router core knows Hono, route paths, route params, route directories, source
contracts, and renderer contracts. It avoids React, Vite RSC, Markdown/MDX
parsing, app-specific metadata, authentication policy, layout policy, and file
discovery.

Route file keys are route-root-relative. Callers can use Vite
`import.meta.glob(..., { base })`, explicit module maps, or another build tool,
but the normalized file keys are passed into this package explicitly.

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

Use eager route modules when file-routed Hono routers depend on parent Hono
context state such as `c.var`, `c.render()`, or middleware-provided helpers.
Lazy route modules are useful for plain Hono handlers, but eager modules can be
mounted directly into the parent Hono route graph.

```ts
const rscRoutes = createFileRouter({
  sources: [
    {
      files: import.meta.glob("./**/*.{ts,tsx}", {
        base: "./routes",
        eager: true,
      }),
      routes: honoRoutes(),
    },
  ],
});
```

The default path convention supports `index`, `[id]`, `[...slug]`, and route
groups such as `(marketing)`. It also ignores route-local `_components`
directories so broad route globs can include colocated page components without
turning them into routes.

```ts
routeFileToManifestPath("./docs/(guides)/[...slug].ts");
// { path: "/docs/:slug{.+}", routeDirectory: "docs/(guides)" }

createRouteManifest({
  sources: [
    {
      files: import.meta.glob("./routes/**/*.{ts,tsx}", { base: "./routes" }),
      routes: honoRoutes(),
    },
  ],
});
// ./routes/_components/home-page.tsx is ignored by the default convention.
```

Add `ignore` on a source for app-specific non-route directories.

```ts
createRouteManifest({
  sources: [
    {
      files: import.meta.glob("./**/*.ts", { base: "./routes" }),
      ignore: (file) => file.includes("_fixtures/"),
      routes: honoRoutes(),
    },
  ],
});
```

Applications can replace the convention per manifest:

```ts
const manifest = createRouteManifest({
  pathConvention: {
    name: "app-routes",
    toPath(file) {
      return {
        path: fileToAppPath(file),
        routeDirectory: fileToAppDirectory(file),
      };
    },
  },
  sources,
});
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

`_404`, `_error`, `_middleware`, `_renderer`, `_layout`, and `_auth` are examples
of app-owned provider conventions. They are not reserved router-core filenames.
The router only exposes `routeDirectory` data and generic helper functions such
as:

- `routeDirectoryAncestors(directory)`
- `findInheritedRouteProviders(consumer, providers)`
- `findNearestInheritedRouteProvider(consumer, providers)`
- `createRouteDirectories(manifest)`

## Manifest

`createRouteManifest()` normalizes sources into a statically testable route
manifest. The manifest contains primary `FileRoute` entries, plain Hono route
module entries, renderer-declared `GeneratedRoute` entries, and route-directory
groups.

`FileRoute` is deliberately small: it has a stable `id`, source `file`,
Hono-compatible `path`, source `kind`, optional `load`, optional package-owned
`metadata`, and a filesystem-based `routeDirectory`.

`GeneratedRoute` is explicit instead of hard-coded. It has an owner route id,
method, path, optional kind, and a render function. The core treats generated
routes as route candidates for ordering and collision checks before mounting
anything on Hono.

## Renderer Contract

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

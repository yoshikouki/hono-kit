# @yoshikouki/hono-file-router

File-based routing core for Hono.

This package owns route source contracts, path conventions, manifest creation,
renderer registration, generated route declarations, specificity ordering,
collision checks, and the Hono router adapter. Applications and build tools
still own file discovery.

## Contract

- `FileRoute` is the durable route unit.
- `MatchedRoute` is the request-time route match with params and context.
- `FileRouteAdapter` turns discovered source files into routes.
- `FileRouteRenderer` renders routes and declares generated routes.
- `GeneratedRoute` lets renderers expose endpoints such as raw Markdown without
  hard-coding renderer semantics into the router core.
- `RoutePathConvention` converts route-root-relative file keys into Hono paths.

The implementation includes manifest creation, generated-route collision checks,
`createFileRouter()`, and `mountFileRoutes()`.

## Boundaries

The router core knows Hono, route paths, route params, source contracts, and
renderer contracts. It avoids React, Vite RSC, Markdown/MDX parsing,
app-specific metadata, authentication policy, layout policy, error policy,
not-found policy, and file discovery.

Route file keys are route-root-relative. Callers can use Vite
`import.meta.glob(..., { base })`, explicit module maps, or another build tool,
but the normalized file keys are passed into this package explicitly.

## Usage

Pass discovered route modules to `createFileRouter()`. Each Hono route module
must default export a Hono router. A source without `renderer` is treated as a
Hono route module source.

```ts
import { Hono } from "hono";
import { createFileRouter } from "@yoshikouki/hono-file-router";

const fileBasedRoutes = createFileRouter({
  sources: [
    {
      files: import.meta.glob("./**/*.ts", { base: "./routes" }),
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
    },
  ],
});
```

The default path convention supports `index`, `[id]`, `[...slug]`, and route
groups such as `(marketing)`.

```ts
routeFileToManifestPath("./docs/(guides)/[...slug].ts");
// { path: "/docs/:slug{.+}" }

createRouteManifest({
  sources: [
    {
      files: import.meta.glob("./routes/**/*.{ts,tsx}", { base: "./routes" }),
      ignore: (file) => file.split("/").includes("_components"),
    },
  ],
});
// ./routes/_components/home-page.tsx is ignored by this source.
```

Add `ignore` on a source for app-specific non-route directories.

```ts
createRouteManifest({
  sources: [
    {
      files: import.meta.glob("./**/*.ts", { base: "./routes" }),
      ignore: (file) =>
        file.split("/").includes("_components") || file.includes("_fixtures/"),
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
      };
    },
  },
  sources,
});
```

For app-level conventions such as not-found or error handling, use Hono's app
surface around the mounted file router.

```ts
const app = new Hono();

app.route("/", fileBasedRoutes);
app.notFound((c) => c.text("Not Found", 404));
app.onError((error, c) => c.text(error.message, 500));

// Exclude support files from the route graph with source-local ignore rules.
createFileRouter({
  sources: [
    {
      files: import.meta.glob("./**/*.ts", { base: "./routes" }),
      ignore: (file) => file.startsWith("_") || file.includes("/_"),
    },
  ],
});
```

## Manifest

`createRouteManifest()` normalizes sources into a statically testable route
manifest. The manifest contains primary `FileRoute` entries, plain Hono route
module entries, and renderer-declared `GeneratedRoute` entries.

`FileRoute` is deliberately small: it has a stable `id`, source `file`,
Hono-compatible `path`, optional `load`, and optional package-owned `metadata`.

`GeneratedRoute` is explicit instead of hard-coded. It has an owner route id,
method, path, and a render function. The core treats generated routes as route
candidates for ordering and collision checks before mounting anything on Hono.

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

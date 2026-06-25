# @yoshikouki/hono-file-router

File-based routing core for Hono.

This package owns route discovery contracts, renderer registration, generated
route declarations, and the Hono router adapter. The implementation is currently
a scaffold for the package boundary.

## Contract

- `FileRoute` is the durable route unit.
- `MatchedRoute` is the request-time route match with params and context.
- `FileRouteAdapter` turns discovered source files into routes.
- `FileRouteRenderer` renders routes and declares generated routes.
- `GeneratedRoute` lets renderers expose endpoints such as `/__rsc` without
  hard-coding renderer semantics into the router core.

The implementation includes manifest creation, generated-route collision checks,
`createFileRouter()`, and `mountFileRoutes()`.

## Usage

For Bun-hosted apps, `createFileRouter()` can discover `*.ts` route modules by
convention. Each discovered module must default export a Hono router.

```ts
import { Hono } from "hono";
import { createFileRouter } from "@yoshikouki/hono-file-router";

const fileBasedRoutes = createFileRouter({
  base: "./routes",
});

const app = new Hono();
app.route("/", fileBasedRoutes);
```

For Vite, Workers, and renderer integrations, pass explicit source files such as
`import.meta.glob` results.

```ts
import { createFileRouter } from "@yoshikouki/hono-file-router";
import { honoRoutes } from "@yoshikouki/hono-file-router/hono-routes";

const fileBasedRoutes = createFileRouter({
  base: "./routes",
  sources: [
    {
      files: import.meta.glob("./routes/**/*.ts"),
      routes: honoRoutes(),
    },
  ],
});
```

For tests and tooling, use `createRouteManifest()` directly and pass the result
to either `createFileRouter({ manifest })` or `mountFileRoutes(app, {
manifest })`.

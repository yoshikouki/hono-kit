# Contracts

This repository keeps the file router as the source of truth for route
discovery, route ordering, generated-route collision checks, and Hono mounting.
Renderer packages may declare generated routes, but they must not teach the core
router about RSC, Markdown, or MDX semantics.

## Package Boundaries

```txt
@yoshikouki/hono-file-router
  owns: file path normalization, route manifest, specificity ordering,
        generated-route collision checks, Hono adapter
  knows: Hono, route paths, route params, source and renderer contracts
  avoids: React, Vite RSC, Markdown/MDX parsing, app-specific metadata

@yoshikouki/hono-rsc-renderer
  owns: HTML/RSC rendering, /__rsc generated routes, RSC response headers,
        Vite RSC integration hints
  knows: file-router renderer contract, React, react-dom, @vitejs/plugin-rsc
  avoids: route discovery, layout discovery policy, Markdown source handling

@yoshikouki/hono-mdx-renderer
  owns: .md/.mdx adaptation, frontmatter, optional raw Markdown responses,
        Markdown/MDX page rendering hooks
  knows: file-router adapter and renderer contracts
  avoids: Hono route registration order, RSC transport details
```

## API Shape

The shortest Bun-hosted API is one step. By default, `*.ts` files under `base`
are discovered and treated as Hono route modules:

```ts
import { Hono } from "hono";
import { createFileRouter } from "@yoshikouki/hono-file-router";

const fileBasedRoutes = createFileRouter({
  base: "./routes",
});

const app = new Hono();
app.route("/", fileBasedRoutes);
```

Renderer integrations use explicit source sets so bundlers such as Vite can keep
glob patterns statically visible:

```ts
import { Hono } from "hono";
import { createFileRouter } from "@yoshikouki/hono-file-router";
import { honoRoutes } from "@yoshikouki/hono-file-router/hono-routes";
import { mdRenderer } from "@yoshikouki/hono-mdx-renderer";
import { mdxRenderer } from "@yoshikouki/hono-mdx-renderer";
import { rscRenderer } from "@yoshikouki/hono-rsc-renderer";

const fileBasedRoutes = createFileRouter({
  base: "./routes",
  sources: [
    {
      files: import.meta.glob("./routes/**/*.tsx"),
      renderer: rscRenderer(),
      dynamicRoutes: true,
    },
    {
      files: import.meta.glob("./routes/**/*.ts"),
      routes: honoRoutes(),
    },
    {
      files: import.meta.glob("./routes/**/*.md", {
        query: "?raw",
        import: "default",
        eager: true,
      }),
      renderer: mdRenderer(),
    },
    {
      files: import.meta.glob("./routes/**/*.mdx"),
      renderer: mdxRenderer(),
    },
  ],
});

const app = new Hono();
app.route("/", fileBasedRoutes);
```

`createFileRouter(config)` is convenience. It normalizes the source config into
a manifest, creates a Hono sub-app, and delegates registration to
`mountFileRoutes`.

The explicit form is public for tests, debug tools, and derived outputs:

```ts
import {
  createFileRouter,
  createRouteManifest,
  mountFileRoutes,
} from "@yoshikouki/hono-file-router";

const manifest = createRouteManifest({
  base: "./routes",
  sources,
});

const fileBasedRoutes = createFileRouter({ manifest });

const app = new Hono();
mountFileRoutes(app, { manifest });
```

This keeps the easy path short while preserving a statically testable manifest
layer.

## Core Types

`RouteManifestConfig` is user input. It carries a `base` directory and, for
explicit integrations, one or more source declarations. `createFileRouter({
base })` is a Bun runtime convention for `*.ts` Hono route modules. Renderer
integrations pass Vite's glob result explicitly so Vite can keep the glob
pattern statically visible.

`RouteSource` binds a file set to exactly one route producer. Page-like sources
use `renderer`; plain `.ts` Hono route modules use `routes`. Source-local
options such as `dynamicRoutes` and raw/eager loading behavior belong next to
the corresponding `import.meta.glob` call.

`RouteManifest` is normalized output. It contains primary `FileRoute` entries,
renderer-declared `GeneratedRoute` entries, and enough ownership data to explain
collisions before anything is mounted on a Hono app.

`FileRoute` is the durable route unit. It is deliberately small: a route has a
stable `id`, source `file`, Hono-compatible `path`, source `kind`, optional
`load`, optional package-owned `metadata`, and a filesystem-based
`routeDirectory`.

`MatchedRoute` is a resolved request against a `FileRoute`. It carries
`params`, the concrete request `pathname`, the original `Request`, the parsed
`URL`, and user-provided request `context`.

`FileRouteRenderer` renders primary routes and may declare `GeneratedRoute`
entries for a `FileRoute`. RSC uses this for `/__rsc` routes; Markdown can use
it for `.md` routes. The file router collects these declarations and rejects
collisions before mounting anything.

`GeneratedRoute` is explicit instead of hard-coded. It has an owner route id,
method, path, optional kind, and a render function. The core router treats it as
a route candidate for ordering and collision checks.

## Renderer Contract

A renderer is the public extension point that turns a matched file route into an
HTTP response.

```ts
type FileRouteRenderer<TContext = unknown> = {
  name: string;
  accepts(route: FileRoute): boolean;
  render(input: RenderInput<TContext>): Response | Promise<Response>;
  generatedRoutes?: (route: FileRoute) => GeneratedRoute<TContext>[];
};
```

The router core calls `accepts()` while building the manifest, calls `render()`
for the primary route, and mounts any `generatedRoutes()` returned by the
renderer. Custom renderers are first-class: a user can provide a renderer for
JSON, XML, static HTML, a different component runtime, or any other file module
contract.

The core does not inspect route module exports beyond storing the lazy `load`
function. Export conventions belong to the renderer that owns the source. This
keeps React and MDX out of the route core.

## Standard Module Contracts

`rscRenderer()` handles `.tsx` sources. It expects a default export function,
calls it with `{ context, params, request }`, serializes the returned React node
with `@vitejs/plugin-rsc/rsc`, renders HTML through the package SSR entry, and
exposes `/__rsc...` as a generated Flight route.

```tsx
export default function Page({ params }: PageProps) {
  return <main>{params.id}</main>;
}
```

Vite RSC apps use the package browser entry as the client build input:

```ts
export default defineConfig({
  plugins: [rsc()],
  environments: {
    client: {
      build: {
        rollupOptions: {
          input: {
            index: "@yoshikouki/hono-rsc-renderer/entry.browser",
          },
        },
      },
    },
  },
});
```

`mdRenderer()` handles raw `.md` sources. It expects `import.meta.glob` to provide
raw Markdown strings, usually with `{ query: "?raw", import: "default", eager:
true }`. The primary route renders a simple HTML response, and the generated
`.md` route returns the raw Markdown.

```md
---
title: Readme
---

# Readme
```

`mdxRenderer()` handles `.mdx` sources. It expects a default export function,
matching the same `{ context, params, request }` shape used by the RSC renderer.

```mdx
export default function Page() {
  return "<article>Guide</article>";
}
```

`honoRoutes()` handles plain `.ts` route modules. These modules default export a
Hono app. The file router lazily loads the module and mounts it under the file
route path, preserving dynamic file params such as `[id]` for `c.req.param()`.

```ts
import { Hono } from "hono";

const app = new Hono();
app.get("/ping", (c) => c.json({ ok: true }));

export default app;
```

Source-level glob config is the routing truth. File-local marker strings such as
`export const runtime = "rsc"` are intentionally not part of the initial
contract because they create a second source of truth next to `sources`.

## Route Path Rules

- Route paths use Hono-compatible params such as `/posts/:postId`.
- Source files may use filesystem params such as `routes/posts/[postId].tsx`.
- Dynamic param names must be unique within one route path. For example,
  `users/[id]/posts/[id].ts` is rejected; use `posts/[postId].ts`.
- `.ts` route modules can be mounted as ordinary Hono route modules.
- Layout resolution is based on source directory structure, not URL path.
- Static sibling routes must sort before dynamic siblings.
- Same-shape duplicates are rejected: `/users/:id` and `/users/:name` cannot
  both be primary routes.
- Generated-route collisions are separate from same-shape duplicates. A valid
  static and dynamic sibling can coexist, but a renderer-generated endpoint
  must not shadow an existing primary or generated endpoint.
- Runtime reachability is a Hono adapter concern. Any change that affects route
  ordering needs both manifest-level tests and HTTP-level tests.

## API Cardinality

- `base`: required once per config.
- `sources`: optional for Bun `*.ts` Hono route module discovery. Required and
  non-empty for explicit renderer or `import.meta.glob` integrations.
- `source.files`: required. It is the direct result of `import.meta.glob`.
- `source.renderer`: zero or one. Required for page/content sources.
- `source.routes`: zero or one. Required for plain Hono route module sources.
- `source.renderer` and `source.routes`: mutually exclusive.
- `dynamicRoutes`: optional, default `true` for page-like sources.
- Raw/eager behavior: configured in `import.meta.glob`, not duplicated by the
  router config.

`createFileRouter` accepts `{ base }`, `RouteManifestConfig`, or `{ manifest }`.
`mountFileRoutes` accepts the same shape, but it mutates a caller-owned Hono app
instead of creating a sub-app.

## Current Milestone

The first executable milestone is complete when these checks pass:

```sh
bun run typecheck
bun run test
bun run build
```

The checked surface includes public manifest types, pure route path tests,
generated route collision checks, `mountFileRoutes`, `createFileRouter`, default
`.ts` Hono route module discovery, standard renderers,
`samples/file-router-basic`, `samples/mdx-basic`, and `samples/rsc-basic`.

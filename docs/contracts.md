# Contracts

This repository keeps the file router as the source of truth for route
discovery, route ordering, generated-route collision checks, and Hono mounting.
Custom file-route renderers may declare generated routes, but they must not
teach the core router about domain-specific formats. RSC is exposed as Hono
middleware, and Markdown/MDX are exposed as Hono route handlers, so the router
core does not own presentation or transport semantics.

## Package Boundaries

```txt
@yoshikouki/hono-file-router
  owns: file path normalization, route manifest, specificity ordering,
        generated-route collision checks, Hono adapter
  knows: Hono, route paths, route params, source and renderer contracts
  avoids: React, Vite RSC, Markdown/MDX parsing, app-specific metadata

@yoshikouki/hono-rsc-renderer
  owns: Hono c.render() integration for React Server Components, same-path
        Flight negotiation, RSC response headers, Vite RSC integration hints
  knows: Hono renderer middleware contract, React, react-dom, @vitejs/plugin-rsc
  avoids: route discovery, authorization policy, Markdown source handling

@yoshikouki/hono-mdx-renderer
  owns: Hono route handlers for Markdown and MDX, frontmatter stripping,
        optional raw Markdown responses, Markdown/MDX page rendering hooks
  knows: Hono handler contract, Hono context, raw Markdown strings,
        app-provided MDX route modules
  avoids: route discovery, MDX compilation, layout policy, authorization policy,
        RSC transport details
```

## API Shape

The router core receives explicit route sources. File discovery stays with the
caller or the build tool, so Vite glob options such as `base`, `eager`, `query`,
and `import` remain visible to the application:

```ts
import { Hono } from "hono";
import { createFileRouter } from "@yoshikouki/hono-file-router";
import { honoRoutes } from "@yoshikouki/hono-file-router/hono-routes";

const fileBasedRoutes = createFileRouter({
  sources: {
    files: import.meta.glob("./**/*.ts", { base: "./routes" }),
    routes: honoRoutes(),
  },
});

const app = new Hono();
app.route("/", fileBasedRoutes);
```

Markdown and MDX are ordinary Hono route handlers. The application chooses the
route path, source-loading strategy, raw Markdown endpoint, and rendering hooks:

```ts
import { Hono } from "hono";
import {
  mdRenderer,
  mdxRenderer,
  rawMarkdownRenderer,
} from "@yoshikouki/hono-mdx-renderer";
import guideMdx from "./routes/content/docs/guide.mdx?raw";
import readmeMd from "./routes/content/docs/readme.md?raw";
import { compileMdxRoute } from "./loaders";

const app = new Hono();

app.get("/docs/readme", mdRenderer(readmeMd));
app.get("/docs/readme.md", rawMarkdownRenderer(readmeMd));
app.get("/docs/guide", mdxRenderer(() => compileMdxRoute(guideMdx)));
```

RSC uses Hono's renderer middleware shape instead of the file-route renderer
shape:

```tsx
import { Hono } from "hono";
import { rscRenderer } from "@yoshikouki/hono-rsc-renderer";
import HomePage from "./pages/home";

const app = new Hono();

app.get(
  "*",
  rscRenderer(({ children }) => (
    <html lang="en">
      <body>{children}</body>
    </html>
  ))
);

app.get("/", (c) => c.render(<HomePage />));
```

`createFileRouter(config)` normalizes the source config into a manifest, creates
a Hono sub-app, passes through Hono constructor options such as `strict`,
`router`, and `getPath`, and delegates registration to `mountFileRoutes`.

The explicit form is public for tests, debug tools, and derived outputs:

```ts
import {
  createFileRouter,
  createRouteManifest,
  mountFileRoutes,
} from "@yoshikouki/hono-file-router";

const manifest = createRouteManifest({
  sources,
});

const fileBasedRoutes = createFileRouter({ manifest });

const app = new Hono();
mountFileRoutes(app, { manifest });
```

This keeps the easy path short while preserving a statically testable manifest
layer.

## Core Types

`RouteManifestConfig` is user input. It carries one or more source declarations.
Route file keys are route-root-relative; callers can use Vite's
`import.meta.glob(..., { base })` or explicit module maps to produce those keys.
Renderer integrations pass Vite's glob result explicitly so Vite can keep the
glob pattern statically visible.

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
entries for a `FileRoute`. Custom renderers can use this for package-owned
secondary endpoints. The file router collects these declarations and rejects
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
keeps MDX and other content transforms out of the route core.

## Standard Module Contracts

`rscRenderer()` is Hono middleware. It follows Hono's JSX Renderer shape: the
middleware sets `c.render()`, and ordinary Hono route handlers decide when to
render a React Server Component tree.

```tsx
app.get("*", rscRenderer(({ children }) => <html><body>{children}</body></html>));
app.get("/users/:id", (c) => c.render(<UserPage id={c.req.param("id")} />));
```

Flight uses the same route path as the HTML response. The middleware returns a
Flight response when the request includes `RSC: 1` or accepts
`text/x-component`, and it sets `Vary: RSC, Accept` by default.

```http
GET /users/42
Accept: text/html

GET /users/42
RSC: 1
Accept: text/x-component
```

Vite RSC apps provide an app entry for the `rsc` environment and use the package
browser entry as the `client` build input. The default `ssr` entry is
auto-discovered from `hono-rsc-renderer`'s `import.meta.viteRsc.import()` call.

```ts
export default defineConfig({
  plugins: [rsc()],
  environments: {
    rsc: {
      build: {
        rollupOptions: {
          input: { index: "./src/index.tsx" },
        },
      },
    },
    // The SSR entry is auto-discovered from hono-rsc-renderer's
    // import.meta.viteRsc.import("./entry.ssr", { environment: "ssr" }).
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

`mdRenderer(source)` handles raw Markdown strings as a Hono route handler. The
source may be a string or a function that returns a string. The route renders
HTML through a package default or app-provided `renderMarkdown` hook. Raw
Markdown routes are explicit Hono routes through `rawMarkdownRenderer(source)`.

```md
---
title: Readme
---

# Readme
```

```ts
app.get("/docs/readme", mdRenderer(readmeMd));
app.get("/docs/readme.md", rawMarkdownRenderer(readmeMd));
```

`mdxRenderer(source)` handles app-provided MDX route modules as a Hono route
handler. It expects a default export function that receives `{ c, params,
request }`. The renderer does not compile MDX itself; callers provide
bundle-visible modules and can customize response generation through
`renderMdx`.

```mdx
export default function Page({ params }) {
  return "<article>Guide</article>";
}
```

```ts
app.get("/docs/guide", mdxRenderer(() => loadGuideMdx()));
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

- `sources`: required for source-based router creation. It may be one source or
  an array of sources.
- `manifest`: optional advanced input. It is mutually exclusive with `sources`.
- Route file keys are route-root-relative. Use `import.meta.glob` options such
  as `{ base: "./routes" }` or explicit module maps to produce those keys.
- `source.files`: required. It can be the direct result of `import.meta.glob`
  or an explicit module map with the same shape.
- `source.renderer`: zero or one. Required for page/content sources.
- `source.routes`: zero or one. Required for plain Hono route module sources.
- `source.renderer` and `source.routes`: mutually exclusive.
- `dynamicRoutes`: optional, default `true` for page-like sources.
- Raw/eager behavior: configured in `import.meta.glob`, not duplicated by the
  router config.
- Hono constructor options such as `strict`, `router`, and `getPath` are passed
  through on the top-level `createFileRouter` options object.

`createFileRouter` accepts `{ sources, ...honoOptions }` or
`{ manifest, ...honoOptions }`. `mountFileRoutes` accepts the same shape, but
it mutates a caller-owned Hono app instead of creating a sub-app.

## Current Milestone

The first executable milestone is complete when these checks pass:

```sh
bun run typecheck
bun run test
bun run build
```

The checked surface includes public manifest types, pure route path tests,
generated route collision checks, `mountFileRoutes`, `createFileRouter`,
explicit `.ts` Hono route module sources, Markdown/MDX Hono route handlers,
the RSC Hono renderer middleware,
`samples/file-router-basic`, `samples/mdx-basic`,
`samples/rsc-vite-basic`, and `samples/full-stack-routing`.

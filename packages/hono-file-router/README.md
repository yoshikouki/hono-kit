# @yoshikouki/hono-file-router

File-based routing for Hono with an intentionally small public contract.
Applications and build tools discover files; this package converts those files
into a validated route manifest and applies it to Hono.

## Public API

The package root exports three functions:

- `createFileRouter()` creates a new `Hono` app and accepts Hono constructor
  options in addition to either `sources` or `manifest`.
- `mountFileRoutes()` applies either `sources` or `manifest` to an existing app.
  The existing app already owns its constructor options.
- `createRouteManifest()` validates sources without mutating an application.

The exported types describe these function inputs and the extension points that
applications author: route renderers, generated routes, eager Hono route
sources, manifests, and path conventions. Path parsing, ordering, collision
maps, and registration plans are implementation details.

## Primary usage: eager root-only Hono modules

Pass an eager glob to `createFileRouter()`. The `HonoRouteSource` generic is
required because `{ eager: true }` controls loading but does not tell Vite the
module value type.

```ts
import { Hono } from "hono";
import {
  createFileRouter,
  type HonoRouteSource,
} from "@yoshikouki/hono-file-router";

const fileBasedRoutes = createFileRouter({
  sources: [
    {
      files: import.meta.glob<HonoRouteSource>("./**/*.{ts,tsx}", {
        base: "./routes",
        eager: true,
      }),
    },
  ],
});

const app = new Hono();
app.route("/", fileBasedRoutes);
```

Each route file owns one final filesystem-derived path. It must export an eager
`Hono` app, directly or as the module's default export. The child app must have
at least one route entry, and every entry must use the exact child path `"/"`.
Multiple methods, `ALL`, explicit root middleware, and root handler chains are
supported.

```ts
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";

interface AppEnv {
  Variables: { userId: string };
}

const auth = createMiddleware<AppEnv>(async (c, next) => {
  c.set("userId", "42");
  await next();
});

// routes/users/[id].ts -> /users/:id
const route = new Hono<AppEnv>();
route.get("/", auth, (c) =>
  c.json({ id: c.req.param("id"), viewer: c.var.userId })
);
route.patch("/", (c) => c.json({ updated: c.req.param("id") }));

export default route;
```

Nested child paths, params, regexps, `"*"`, and `"/*"` inside a file-routed
child app are rejected. Put each final endpoint in its corresponding file.
Keep an arbitrary Hono subtree application-owned and compose it outside the file
router:

```ts
import { Hono } from "hono";

const adminApp = new Hono();
adminApp.get("/users/:id", (c) => c.text(c.req.param("id")));

const fileBasedRoutes = new Hono();
fileBasedRoutes.get("/", (c) => c.text("home"));

const app = new Hono();
app.route("/admin", adminApp);
app.route("/", fileBasedRoutes);
```

File-routed child apps are composed with `app.route()`, so the parent and child
share the same request `Context`: middleware variables, bindings, `c.render()`,
params, `c.executionCtx`, and child `onError` keep Hono's native behavior. Lazy
Hono values fail during manifest creation with guidance to add `{ eager: true }`.

## File paths and supported route grammar

The default convention maps route-root-relative file keys as follows:

| File | Route path |
| --- | --- |
| `./index.ts` | `/` |
| `./users/[id]/index.ts` | `/users/:id` |
| `./docs/(guides)/[...slug].ts` | `/docs/:slug{.+}` |

Route groups are omitted. `index` maps to its directory. `[name]` becomes a
plain dynamic segment, and terminal `[...name]` becomes a one-or-more catch-all.

Every renderer, generated route, and Hono-module path must be canonical and use
only:

- static segments without Hono pattern metacharacters;
- plain dynamic segments such as `:id`; and
- one terminal one-or-more catch-all such as `:slug{.+}`.

Dynamic names must be unique ASCII JavaScript-style identifiers. Trailing
slashes, empty segments, URL dot segments, decoding aliases, optional params,
wildcards, arbitrary regexps, and non-terminal catch-alls are rejected. Routes
that need arbitrary Hono patterns belong on an application-owned Hono app.

Applications may supply a custom path convention. Its output is checked by the
same grammar before registration.

```ts
import { Hono } from "hono";
import {
  createRouteManifest,
  type HonoRouteSource,
  type RoutePathConvention,
} from "@yoshikouki/hono-file-router";

const convention: RoutePathConvention = {
  name: "app-routes",
  toPath(file) {
    return { path: file === "./home.ts" ? "/" : "/about" };
  },
};

const home = new Hono();
home.get("/", (c) => c.text("home"));
const files: Record<string, HonoRouteSource> = { "./home.ts": home };

const manifest = createRouteManifest({
  pathConvention: convention,
  sources: [{ files }],
});

String(manifest.handlers[0]?.path);
```

Use source-local `ignore` callbacks to keep colocated support files out of the
route graph:

```ts
import { Hono } from "hono";
import {
  createFileRouter,
  type HonoRouteSource,
} from "@yoshikouki/hono-file-router";

const fileBasedRoutes = createFileRouter({
  sources: [
    {
      files: import.meta.glob<HonoRouteSource>("./**/*.{ts,tsx}", {
        base: "./routes",
        eager: true,
      }),
      ignore: (file) =>
        file.split("/").includes("_components") || file.includes("_fixtures/"),
    },
  ],
});

const app = new Hono();
app.route("/", fileBasedRoutes);
app.notFound((c) => c.text("Not Found", 404));
app.onError((error, c) => c.text(error.message, 500));
```

## Registration order and collisions

Renderer, generated, and root-only Hono-module entries are compiled into one
flat plan. The deterministic total order compares path segments from left to
right as `static < dynamic < terminal catch-all`, then uses depth, canonical
path, method, kind, and source tie-breakers. Source order and JavaScript sort
stability do not affect the result. For example, `/users/settings` is
registered before `/users/:id`, which is registered before
`/users/:rest{.+}`, even across different source categories.

Collision keys normalize dynamic parameter names while preserving their kind:
`/users/:id` and `/users/:name` share a shape, while
`/users/:rest{.+}` has a different shape.

- Primary renderer routes are always `GET` and collide with another `GET` at
  the same shape.
- Generated routes default to `GET`. They may declare `GET`, `POST`, `PUT`,
  `PATCH`, `DELETE`, or `ALL`; different concrete methods may share a shape.
- Generated `ALL` reserves every method at its shape.
- A root-only Hono module is opaque to the file router and reserves every
  method at its shape. Its child routes are neither inspected by method nor
  flattened or replayed.

The package validates source definitions, renderer references, generated owners and
methods, child-module shape, route grammar, ordering inputs, and collisions for
the entire plan before mutating the target app. Configuration errors therefore
leave the target unchanged. Exceptions later thrown by application handlers are
ordinary request-time failures, not transactional registration failures.

## Context-native renderer contract

Custom renderers adapt non-Hono file formats. Their primary route is registered
with `app.get()`, and both primary and generated renderers receive the active
Hono `Context` as `{ c, route }`. Read the request, params, bindings, variables,
and renderer helpers from `c`; the package does not create a parallel request
context.

Renderer-backed file values may be lazy because the renderer owns how their
contents are loaded. The eager-only rule applies to Hono route modules.

```ts
import {
  createFileRouter,
  type FileRouteRenderer,
} from "@yoshikouki/hono-file-router";

const jsonRenderer: FileRouteRenderer = {
  name: "json",
  accepts: (route) => route.file.endsWith(".json"),
  generatedRoutes(route) {
    return [
      {
        method: "GET",
        path: route.path === "/" ? "/__source" : `/__source${route.path}`,
        render: ({ c, route: owner }) => c.text(owner.file),
      },
    ];
  },
  async render({ c, route }) {
    const source = await route.load?.();
    return c.text(JSON.stringify(source));
  },
};

const fileBasedRoutes = createFileRouter({
  sources: [
    {
      files: import.meta.glob<unknown>("./**/*.json", {
        base: "./routes/data",
      }),
      renderer: jsonRenderer,
    },
  ],
});

String(fileBasedRoutes.routes.length);
```

## Manifest-first usage

`createRouteManifest()` is useful for tests and build tooling. Pass its result
to either router entry point; `manifest` and `sources` are mutually exclusive.

```ts
import { Hono } from "hono";
import {
  createFileRouter,
  createRouteManifest,
  mountFileRoutes,
} from "@yoshikouki/hono-file-router";

const route = new Hono();
route.get("/", (c) => c.text("health"));

const manifest = createRouteManifest({
  sources: [{ files: { "./health.ts": route } }],
});

const existingApp = new Hono();
mountFileRoutes(existingApp, { manifest });

const standaloneApp = createFileRouter({ manifest, strict: false });
String(standaloneApp.routes.length);
```

The emitted package declarations are the consumer contract. The package build
type-checks every TypeScript fence in this README against `dist/index.d.ts`.

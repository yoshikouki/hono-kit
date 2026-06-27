# @yoshikouki/hono-rsc-renderer

React Server Components renderer middleware for Hono.

## Contract

This package follows Hono's built-in JSX Renderer shape: install middleware on a
route group, then return `c.render()` from ordinary Hono route handlers. Hono
keeps ownership of the request lifecycle, middleware, authentication,
authorization, params, variables, bindings, redirects, and errors.

The package owns Hono RSC renderer middleware, same-path Flight negotiation, RSC
response headers, and Vite RSC integration hints. It does not own route
discovery, authorization policy, Markdown source handling, or file-router
conventions.

```tsx
import { Hono } from "hono";
import { rscRenderer } from "@yoshikouki/hono-rsc-renderer";
import AboutPage from "./pages/about";

const app = new Hono();

app.get(
  "/page/*",
  rscRenderer(({ children }) => (
    <html lang="en">
      <body>
        <header>Menu</header>
        <main>{children}</main>
      </body>
    </html>
  ))
);

app.get("/page/about", (c) => c.render(<AboutPage />));
```

Flight responses use the same route path as the HTML response. The middleware
returns Flight when the request includes `RSC: 1` or an `Accept` header that
contains `text/x-component`; otherwise it returns HTML.

```http
GET /page/about
Accept: text/html

GET /page/about
RSC: 1
Accept: text/x-component
```

## Vite Setup

Use `@vitejs/plugin-rsc` and provide two explicit build entries:

- `rsc`: your Hono application entry point.
- `client`: this package's browser entry, which fetches same-path Flight
  responses and hydrates the document.

```ts
import rsc from "@vitejs/plugin-rsc";
import { defineConfig } from "vite";

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

You do not need to add an explicit `ssr` entry for the default setup. The
renderer imports its SSR helper with `import.meta.viteRsc.import()`, so Vite RSC
discovers and builds `@yoshikouki/hono-rsc-renderer/entry.ssr` for the `ssr`
environment.

## Type Augmentation

The package augments Hono's `ContextRenderer` with a default RSC signature. Apps
can extend it further when layout props need stricter types:

```ts
declare module "hono" {
  interface ContextRenderer {
    (
      content: React.ReactNode | Promise<React.ReactNode>,
      props?: { title?: string }
    ): Response | Promise<Response>;
  }
}
```

## Adoption Checklist

- Keep auth, authorization, tenant loading, feature flags, and redirects in Hono
  middleware or route handlers. Do not duplicate those policies in RSC page
  modules.
- Apply the same Hono middleware chain to HTML and Flight requests. Same-path
  header negotiation makes this the default as long as both requests hit the
  same route.
- Preserve `Vary: RSC, Accept` on responses that can differ between HTML and
  Flight. The middleware sets this by default; keep it when adding cache
  middleware or CDN rules.
- Treat Flight responses as private request data unless an app has explicitly
  proven otherwise. The middleware sets `Cache-Control: private, no-store` on
  Flight responses by default.
- If a CDN strips custom request headers, either allow the `RSC` header through
  or rely on `Accept: text/x-component` and include `Accept` in the cache key.
- Do not cache HTML and Flight under the same cache key. That can serve Flight
  payloads to document requests or HTML documents to RSC clients.
- Add tests that request the same URL once as HTML and once with `RSC: 1` /
  `Accept: text/x-component`.

The renderer is verified by `samples/rsc-vite-basic`, which now
uses Hono routes directly and checks same-path HTML and Flight responses from
the built Vite RSC handler.

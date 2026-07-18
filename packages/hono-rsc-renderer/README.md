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

Renderer components receive the request `Context` as their second argument.
Provide the app environment type to keep bindings and variables typed. The
`Layout` prop is a props-only React component, so nested renderers compose with
ordinary JSX:

```tsx
type AppEnv = {
  Variables: {
    userName: string;
  };
};

app.get(
  "/account/*",
  rscRenderer<AppEnv>(({ children, Layout }, c) => (
    <Layout>
      <header>{c.var.userName}</header>
      {children}
    </Layout>
  ))
);
```

## Content Security Policy Nonces

Use `getNonce` to pass a request-scoped CSP nonce through the SSR environment.
The renderer resolves it once for each HTML request and gives the same value to
both `@vitejs/plugin-rsc/ssr` and React DOM. React and Vite can then attach it to
the scripts they own without application-level HTML rewriting or a custom
Document component.

`getNonce` must return the raw nonce value, such as `abc123`. Do not return a CSP
source expression such as `'nonce-abc123'`.

Hono's `secureHeaders` middleware stores the raw value in
`secureHeadersNonce`, while `NONCE` formats the matching CSP source expression:

```tsx
import { Hono } from "hono";
import {
  NONCE,
  secureHeaders,
  type SecureHeadersVariables,
} from "hono/secure-headers";
import { rscRenderer } from "@yoshikouki/hono-rsc-renderer";

const app = new Hono<{ Variables: SecureHeadersVariables }>();

app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", NONCE],
    },
  })
);

app.use(
  "*",
  rscRenderer(
    ({ children }) => (
      <html lang="en">
        <body>{children}</body>
      </html>
    ),
    { getNonce: (c) => c.get("secureHeadersNonce") }
  )
);
```

Omit `getNonce` to preserve the previous behavior without nonce attributes.
Because a nonce makes each HTML response request-specific, nonce-bearing HTML
defaults to `Cache-Control: private, no-store`. The renderer preserves an
explicit Hono response header, so applications that need a different private
cache policy can set it before calling `c.render()`:

```tsx
app.get("/page/about", (c) => {
  c.header("Cache-Control", "private, max-age=0, must-revalidate");
  return c.render(<AboutPage />);
});
```

Any override must still prevent nonce-bearing HTML from entering a shared
cache. HTML rendered without a nonce keeps the previous behavior with no
renderer-provided `Cache-Control` header.

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

The default negotiation always emits `Vary: RSC, Accept`. Custom negotiation is
configured as one contract so its predicate cannot be separated from the
headers used by shared caches:

```tsx
app.get(
  "*",
  rscRenderer(undefined, {
    negotiation: {
      isRscRequest: (c) => c.req.header("X-Flight") === "1",
      varyHeaders: ["X-Flight"],
    },
  })
);
```

`varyHeaders` must contain every request header read by `isRscRequest`. The
renderer validates each name as an HTTP field-name token when the middleware is
created, removes case-insensitive duplicates, and merges the result into an
existing `Vary` response header. An existing `Vary: *` is preserved unchanged.

## Rendering Errors

Renderer components and promised children are evaluated by the React RSC
runtime. This preserves React streaming and error semantics instead of resolving
the entire layout before rendering starts.

Rendering can continue after the HTTP response has started, so these errors are
not guaranteed to reach Hono's `app.onError()`. Use `onError` for request-scoped
logging and reporting:

```tsx
app.get(
  "*",
  rscRenderer(
    ({ children }) => <html><body>{children}</body></html>,
    {
      onError: (error, c) => {
        reportRenderError(error, {
          method: c.req.method,
          path: c.req.path,
        });
      },
    }
  )
);
```

Do not rely on `onError` to replace an already-started response. Authentication,
authorization, redirects, and other failures that must choose an HTTP status
belong in Hono middleware or route handlers before `c.render()`.

Custom `renderRsc` implementations receive an unevaluated React tree plus the
request, abort signal, and error callback. They must render that tree rather than
coercing it with `String(node)`:

```tsx
rscRenderer(component, {
  renderRsc: (node, { signal, onError }) =>
    renderToReadableStream(node, { signal, onError }),
});
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

The package augments Hono's `ContextRenderer` with a React-node signature. Apps
define their render props by augmenting `RscRenderProps`:

```ts
import "@yoshikouki/hono-rsc-renderer";

declare module "@yoshikouki/hono-rsc-renderer" {
  interface RscRenderProps {
    title?: string;
  }
}
```

The merged interface is shared by `c.render()` props, renderer component props,
and nested `Layout` props. Undeclared keys are rejected:

```tsx
c.render(<AboutPage />, { title: "About" });
c.render(<AboutPage />, { titel: "About" }); // TypeScript error
```

Without augmentation, `c.render(content)` and `c.render(content, {})` remain
valid, but arbitrary objects and primitive props are rejected. If an augmented
property is required, the props argument becomes required as well:

```ts
declare module "@yoshikouki/hono-rsc-renderer" {
  interface RscRenderProps {
    title: string;
  }
}

c.render(<AboutPage />, { title: "About" });
c.render(<AboutPage />); // TypeScript error
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
- When overriding Flight negotiation, declare the predicate and every matching
  `Vary` header together in `negotiation`.
- Do not cache HTML and Flight under the same cache key. That can serve Flight
  payloads to document requests or HTML documents to RSC clients.
- Add tests that request the same URL once as HTML and once with `RSC: 1` /
  `Accept: text/x-component`.

The renderer is verified by `samples/rsc-vite-basic`, which now
uses Hono routes directly and checks same-path HTML and Flight responses from
the built Vite RSC handler.

import { expect, test } from "bun:test";
import { Hono } from "hono";
import type { Context } from "hono";
import {
  createFileRouter,
  createRouteManifest,
  mountFileRoutes,
  pathnameFromRoutePath,
  routeFileToManifestPath,
  routePathToShape,
  routePathsOverlap,
  sortRoutesBySpecificity,
  type FileRouteRenderer,
} from "../src";

const textRenderer = (name = "text"): FileRouteRenderer => ({
  name,
  accepts: () => true,
  generatedRoutes(route) {
    return [
      {
        owner: route.id,
        path: route.path === "/" ? "/__data" : `/__data${route.path}`,
        render: () => new Response(`generated:${route.path}`),
      },
    ];
  },
  async render(input) {
    const loaded = await input.route.load?.();
    if (
      loaded &&
      typeof loaded === "object" &&
      "default" in loaded &&
      typeof loaded.default === "function"
    ) {
      return new Response(await loaded.default(input.c.req.param()));
    }
    return new Response(String(loaded ?? input.route.path));
  },
});

test("converts route files into Hono paths", () => {
  expect(routeFileToManifestPath("./users/[userId]/index.tsx")).toEqual({
    path: "/users/:userId",
  });
  expect(routeFileToManifestPath("./index.tsx")).toEqual({
    path: "/",
  });
  expect(routeFileToManifestPath("./docs/[...slug].tsx")).toEqual({
    path: "/docs/:slug{.+}",
  });
  expect(routeFileToManifestPath("./docs/(guides)/[slug].tsx")).toEqual({
    path: "/docs/:slug",
  });
});

test("rejects unsupported dynamic segment syntax", () => {
  expect(() => routeFileToManifestPath("./posts/[slug]-edit.tsx")).toThrow(
    /Unsupported dynamic route segment/
  );
});

test("supports custom route path conventions", () => {
  const manifest = createRouteManifest({
    pathConvention: {
      name: "upper",
      toPath(file) {
        return {
          path: `/${file.replace(/^\.\//, "").replace(/\.[^.]+$/, "").toUpperCase()}`,
        };
      },
    },
    sources: [
      {
        files: {
          "./about.tsx": "about",
        },
        renderer: textRenderer(),
      },
    ],
  });

  expect(manifest.routes[0]?.path).toBe("/ABOUT");
});

test("rejects duplicate dynamic segment names in one route path", () => {
  expect(() => routeFileToManifestPath("./users/[id]/posts/[id].ts")).toThrow(
    /Duplicate dynamic route param "id"/
  );
});

test("normalizes route shapes and overlap", () => {
  expect(routePathToShape("/users/:id/books/:bookId")).toBe(
    "/users/:param/books/:param"
  );
  expect(routePathsOverlap("/users/:id", "/users/settings")).toBe(true);
  expect(routePathsOverlap("/users/:id", "/teams/settings")).toBe(false);
});

test("sorts static siblings before dynamic siblings", () => {
  const routes = [
    { path: "/users/:id" },
    { path: "/users/settings" },
    { path: "/users/:id/events/:eventId" },
    { path: "/users/:id/events/settings" },
  ];

  expect(sortRoutesBySpecificity(routes).map((route) => route.path)).toEqual([
    "/users/settings",
    "/users/:id/events/settings",
    "/users/:id/events/:eventId",
    "/users/:id",
  ]);
});

test("sorts deeper static routes before shallower unrelated routes", () => {
  const routes = [{ path: "/about" }, { path: "/api/about.md" }];

  expect(sortRoutesBySpecificity(routes).map((route) => route.path)).toEqual([
    "/api/about.md",
    "/about",
  ]);
});

test("sorts static generated routes before unrelated dynamic routes", () => {
  const routes = [
    { path: "/users/settings" },
    { path: "/users/:id" },
    { path: "/data/users/:id" },
    { path: "/users/settings.md" },
  ];

  expect(sortRoutesBySpecificity(routes).map((route) => route.path)).toEqual([
    "/users/settings",
    "/users/settings.md",
    "/users/:id",
    "/data/users/:id",
  ]);
});

test("builds a route manifest from explicit glob results", () => {
  const manifest = createRouteManifest({
    sources: [
      {
        files: {
          "./about.tsx": "about",
          "./users/[id].tsx": "user",
        },
        renderer: textRenderer(),
      },
    ],
  });

  expect(manifest.routes.map((route) => route.path)).toEqual([
    "/about",
    "/users/:id",
  ]);
  expect(manifest.generatedRoutes.map((route) => route.path)).toEqual([
    "/__data/about",
    "/__data/users/:id",
  ]);
});

test("keeps _components route candidates unless a source ignores them", () => {
  const manifest = createRouteManifest({
    sources: [
      {
        files: {
          "./_components/home.tsx": "home-component",
          "./users/[id].tsx": "user-route",
        },
        renderer: textRenderer(),
      },
    ],
  });

  expect(manifest.routes.map((route) => route.file)).toEqual([
    "./_components/home.tsx",
    "./users/[id].tsx",
  ]);
});

test("supports source-local ignored route files", () => {
  const manifest = createRouteManifest({
    sources: [
      {
        files: {
          "./_components/home.tsx": "home-component",
          "./users/_components/profile.tsx": "profile-component",
          "./users/[id].tsx": "user-route",
        },
        ignore: (file) => file.split("/").includes("_components"),
        renderer: textRenderer(),
      },
    ],
  });

  expect(manifest.routes.map((route) => route.file)).toEqual([
    "./users/[id].tsx",
  ]);
  expect(manifest.routes.map((route) => route.path)).toEqual(["/users/:id"]);
});

test("rejects same-shape primary route duplicates", () => {
  expect(() =>
    createRouteManifest({
      sources: [
        {
          files: {
            "./users/[id].tsx": "a",
            "./users/[name].tsx": "b",
          },
          renderer: textRenderer(),
        },
      ],
    })
  ).toThrow(/Duplicate route/);
});

test("rejects generated routes that collide with primary routes", () => {
  expect(() =>
    createRouteManifest({
      sources: [
        {
          files: {
            "./about.tsx": "about",
            "./__data/about.tsx": "collision",
          },
          renderer: textRenderer(),
        },
      ],
    })
  ).toThrow(/Duplicate route/);
});

test("allows generated routes that only overlap by dynamic shape", () => {
  const renderer: FileRouteRenderer = {
    name: "preview",
    accepts: () => true,
    generatedRoutes(route) {
      return [
        {
          owner: route.id,
          path:
            route.path === "/users/settings"
              ? "/preview/users/settings"
              : `/preview${route.path}`,
          render: () => new Response("preview"),
        },
      ];
    },
    render() {
      return new Response("primary");
    },
  };

  const manifest = createRouteManifest({
    sources: [
      {
        files: {
          "./users/[id].tsx": "user",
          "./users/settings.tsx": "settings",
        },
        renderer,
      },
    ],
  });

  expect(
    manifest.generatedRoutes
      .map((route) => route.path)
      .toSorted((left, right) => left.localeCompare(right))
  ).toEqual(["/preview/users/:id", "/preview/users/settings"]);
});

test("rejects duplicate generated routes for the same owner", () => {
  const renderer: FileRouteRenderer = {
    name: "duplicate-generated",
    accepts: () => true,
    generatedRoutes(route) {
      return [
        {
          owner: route.id,
          path: "/preview/about",
          render: () => new Response("first"),
        },
        {
          owner: route.id,
          path: "/preview/about",
          render: () => new Response("second"),
        },
      ];
    },
    render() {
      return new Response("primary");
    },
  };

  expect(() =>
    createRouteManifest({
      sources: [
        {
          files: {
            "./about.tsx": "about",
          },
          renderer,
        },
      ],
    })
  ).toThrow(/Duplicate route/);
});

test("rejects duplicate generated routes across owners", () => {
  const renderer: FileRouteRenderer = {
    name: "shared-generated",
    accepts: () => true,
    generatedRoutes(route) {
      return [
        {
          owner: route.id,
          path: "/preview/shared",
          render: () => new Response("preview"),
        },
      ];
    },
    render() {
      return new Response("primary");
    },
  };

  expect(() =>
    createRouteManifest({
      sources: [
        {
          files: {
            "./about.tsx": "about",
            "./contact.tsx": "contact",
          },
          renderer,
        },
      ],
    })
  ).toThrow(/Duplicate route/);
});

test("rejects primary collisions between page and Hono route modules", () => {
  const api = new Hono();

  expect(() =>
    createRouteManifest({
      sources: [
        {
          files: {
            "./api.tsx": "page",
          },
          renderer: textRenderer(),
        },
        {
          files: {
            "./api.ts": { default: api },
          },
        },
      ],
    })
  ).toThrow(/Duplicate route/);
});

test("rejects dynamic files when a source disables dynamic routes", () => {
  expect(() =>
    createRouteManifest({
      sources: [
        {
          dynamicRoutes: false,
          files: {
            "./users/[id].tsx": "user",
          },
          renderer: textRenderer(),
        },
      ],
    })
  ).toThrow(/Dynamic route/);
});

test("creates a Hono sub-app from route config", async () => {
  const app = createFileRouter({
    sources: [
      {
        files: {
          "./users/[id].tsx": {
            default: (params: Record<string, string>) => `user:${params.id}`,
          },
        },
        renderer: textRenderer(),
      },
    ],
  });

  const response = await app.request("/users/123");
  expect(await response.text()).toBe("user:123");

  const generated = await app.request("/__data/users/123");
  expect(await generated.text()).toBe("generated:/users/:id");
});

test("mounts file routes onto an existing Hono app", async () => {
  const app = new Hono();
  app.get("/healthz", (c) => c.text("ok"));
  mountFileRoutes(app, {
    sources: [
      {
        files: { "./about.tsx": "about" },
        renderer: textRenderer(),
      },
    ],
  });

  expect(await (await app.request("/healthz")).text()).toBe("ok");
  expect(await (await app.request("/about")).text()).toBe("about");
});

test("passes the request Hono context to primary and generated renderers", async () => {
  interface TestEnv {
    Bindings: {
      prefix: string;
    };
    Variables: {
      requestId: string;
    };
  }

  const middlewareContexts = new Map<string, Context<TestEnv>>();
  const rendererContexts = new Map<string, Context<TestEnv>>();
  const renderer: FileRouteRenderer<TestEnv> = {
    name: "context-native",
    accepts: () => true,
    generatedRoutes(route) {
      return [
        {
          owner: route.id,
          path: "/__data/users/:id",
          render({ c, route: owner }) {
            rendererContexts.set(c.req.path, c);
            return c.render(
              `${c.var.requestId}:${c.env.prefix}:${c.req.param("id")}:${owner.path}`
            );
          },
        },
      ];
    },
    render({ c, route }) {
      rendererContexts.set(c.req.path, c);
      return c.render(
        `${c.var.requestId}:${c.env.prefix}:${c.req.param("id")}:${route.path}`
      );
    },
  };

  const app = new Hono<TestEnv>();
  app.use("*", async (c, next) => {
    middlewareContexts.set(c.req.path, c);
    c.set("requestId", `request:${c.req.path}`);
    c.setRenderer((content) => c.text(`rendered:${content}`));
    await next();
  });
  mountFileRoutes(app, {
    sources: [
      {
        files: { "./users/[id].tsx": "user" },
        renderer,
      },
    ],
  });

  const bindings = { prefix: "env" };
  const primary = await app.request("/users/123", undefined, bindings);
  expect(await primary.text()).toBe(
    "rendered:request:/users/123:env:123:/users/:id"
  );
  expect(rendererContexts.get("/users/123")).toBe(
    middlewareContexts.get("/users/123")
  );

  const generated = await app.request(
    "/__data/users/456",
    undefined,
    bindings
  );
  expect(await generated.text()).toBe(
    "rendered:request:/__data/users/456:env:456:/users/:id"
  );
  expect(rendererContexts.get("/__data/users/456")).toBe(
    middlewareContexts.get("/__data/users/456")
  );
});

test("serves generated static routes before dynamic primary routes", async () => {
  const renderer: FileRouteRenderer = {
    name: "generated-markdown",
    accepts: () => true,
    generatedRoutes(route) {
      if (route.path !== "/users/settings") {
        return [];
      }
      return [
        {
          owner: route.id,
          path: "/users/settings.md",
          render: () => new Response("raw-settings"),
        },
      ];
    },
    render(input) {
      return new Response(`primary:${input.route.path}`);
    },
  };
  const app = createFileRouter({
    sources: [
      {
        files: {
          "./users/[id].tsx": "dynamic",
          "./users/settings.tsx": "settings",
        },
        renderer,
      },
    ],
  });

  expect(await (await app.request("/users/settings.md")).text()).toBe(
    "raw-settings"
  );
});

test("proxies .ts modules as plain Hono route modules", async () => {
  const api = new Hono();
  api.get("/", (c) => c.text("api-root"));
  api.get("/hello/:name", (c) => c.text(`hello:${c.req.param("name")}`));

  const app = createFileRouter({
    sources: [
      {
        files: {
          "./api.ts": { default: api },
        },
      },
    ],
  });

  expect(await (await app.request("/api")).text()).toBe("api-root");
  expect(await (await app.request("/api/hello/codex")).text()).toBe(
    "hello:codex"
  );
});

test("passes params to nested dynamic Hono route modules", async () => {
  const detail = new Hono();
  detail.get("/", (c) => c.text(`post-detail:${c.req.param("id")}`));

  const app = createFileRouter({
    sources: [
      {
        files: {
          "./posts/[id]/detail.ts": { default: detail },
        },
      },
    ],
  });

  expect(await (await app.request("/posts/abc/detail")).text()).toBe(
    "post-detail:abc"
  );
});

test("preserves Hono context variables for eager route modules", async () => {
  interface TestEnv {
    Variables: {
      greeting: string;
    };
  }
  const api = new Hono<TestEnv>();
  api.get("/", (c) => c.text(c.var.greeting));

  const app = new Hono<TestEnv>();
  app.use("*", async (c, next) => {
    c.set("greeting", "hello");
    await next();
  });
  mountFileRoutes(app, {
    sources: [
      {
        files: {
          "./api.ts": api,
        },
      },
    ],
  });

  expect(await (await app.request("/api")).text()).toBe("hello");
});

test("builds request pathnames from dynamic params", () => {
  expect(pathnameFromRoutePath("/users/:id", { id: "a b" })).toBe(
    "/users/a%20b"
  );
});

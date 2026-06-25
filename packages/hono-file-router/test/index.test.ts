import { expect, test } from "bun:test";
import { Hono } from "hono";
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
import { honoRoutes } from "../src/hono-routes";

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
      return new Response(await loaded.default(input.params));
    }
    return new Response(String(loaded ?? input.route.path));
  },
});

test("converts route files into Hono paths", () => {
  expect(
    routeFileToManifestPath("./routes/users/[userId]/index.tsx", {
      base: "./routes",
    })
  ).toEqual({
    path: "/users/:userId",
    routeDirectory: "users/[userId]",
  });
  expect(
    routeFileToManifestPath("./routes/index.tsx", { base: "./routes" })
  ).toEqual({ path: "/", routeDirectory: "" });
});

test("rejects unsupported dynamic segment syntax", () => {
  expect(() =>
    routeFileToManifestPath("./routes/posts/[...slug].tsx", {
      base: "./routes",
    })
  ).toThrow(/Unsupported dynamic route segment/);
});

test("rejects duplicate dynamic segment names in one route path", () => {
  expect(() =>
    routeFileToManifestPath("./routes/users/[id]/posts/[id].ts", {
      base: "./routes",
    })
  ).toThrow(/Duplicate dynamic route param "id"/);
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

test("builds a route manifest from explicit glob results", () => {
  const manifest = createRouteManifest({
    base: "./routes",
    sources: [
      {
        files: {
          "./routes/about.tsx": "about",
          "./routes/users/[id].tsx": "user",
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

test("rejects same-shape primary route duplicates", () => {
  expect(() =>
    createRouteManifest({
      base: "./routes",
      sources: [
        {
          files: {
            "./routes/users/[id].tsx": "a",
            "./routes/users/[name].tsx": "b",
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
      base: "./routes",
      sources: [
        {
          files: {
            "./routes/about.tsx": "about",
            "./routes/__data/about.tsx": "collision",
          },
          renderer: textRenderer(),
        },
      ],
    })
  ).toThrow(/Duplicate route/);
});

test("rejects primary collisions between page and Hono route modules", () => {
  const api = new Hono();

  expect(() =>
    createRouteManifest({
      base: "./routes",
      sources: [
        {
          files: {
            "./routes/api.tsx": "page",
          },
          renderer: textRenderer(),
        },
        {
          files: {
            "./routes/api.ts": { default: api },
          },
          routes: honoRoutes(),
        },
      ],
    })
  ).toThrow(/Duplicate route/);
});

test("rejects dynamic files when a source disables dynamic routes", () => {
  expect(() =>
    createRouteManifest({
      base: "./routes",
      sources: [
        {
          dynamicRoutes: false,
          files: {
            "./routes/users/[id].tsx": "user",
          },
          renderer: textRenderer(),
        },
      ],
    })
  ).toThrow(/Dynamic route/);
});

test("creates a Hono sub-app from route config", async () => {
  const app = createFileRouter({
    base: "./routes",
    sources: [
      {
        files: {
          "./routes/users/[id].tsx": {
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
    base: "./routes",
    sources: [
      {
        files: { "./routes/about.tsx": "about" },
        renderer: textRenderer(),
      },
    ],
  });

  expect(await (await app.request("/healthz")).text()).toBe("ok");
  expect(await (await app.request("/about")).text()).toBe("about");
});

test("proxies .ts modules as plain Hono route modules", async () => {
  const api = new Hono();
  api.get("/", (c) => c.text("api-root"));
  api.get("/hello/:name", (c) => c.text(`hello:${c.req.param("name")}`));

  const app = createFileRouter({
    base: "./routes",
    sources: [
      {
        files: {
          "./routes/api.ts": { default: api },
        },
        routes: honoRoutes(),
      },
    ],
  });

  expect(await (await app.request("/api")).text()).toBe("api-root");
  expect(await (await app.request("/api/hello/codex")).text()).toBe(
    "hello:codex"
  );
});

test("discovers .ts Hono route modules by convention", async () => {
  const app = createFileRouter({
    base: "./fixtures/basic-routes",
  });

  expect(await (await app.request("/")).text()).toBe("fixture-home");
  expect(await (await app.request("/users/42")).text()).toBe("fixture-user:42");
  expect(await (await app.request("/users/42/posts/9")).text()).toBe(
    "fixture-user:42/post:9"
  );
});

test("builds request pathnames from dynamic params", () => {
  expect(pathnameFromRoutePath("/users/:id", { id: "a b" })).toBe(
    "/users/a%20b"
  );
});

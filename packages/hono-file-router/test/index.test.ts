import { expect, test } from "bun:test";
import { Hono } from "hono";
import type { Context } from "hono";
import { Hono as QuickHono } from "hono/quick";
import { Hono as TinyHono } from "hono/tiny";
import {
  createFileRouter,
  createRouteManifest,
  mountFileRoutes,
  type FileRouteRenderer,
  type RouteManifest,
} from "../src";
import {
  assertSupportedRoutePath,
  compareRouteSpecificity,
  pathnameFromRoutePath,
  routeFileToManifestPath,
  routePathToShape,
  sortRoutesBySpecificity,
} from "../src/route-path";
import {
  applyRegistrationPlan,
  compileRegistrationPlan,
} from "../src/registration-plan";

function permutations<T>(values: readonly T[]): T[][] {
  if (values.length <= 1) {
    return [[...values]];
  }
  return values.flatMap((value, index) =>
    permutations(
      values.filter((_, candidateIndex) => candidateIndex !== index)
    ).map((rest) => [value, ...rest])
  );
}

const textRenderer = (name = "text"): FileRouteRenderer => ({
  name,
  accepts: () => true,
  generatedRoutes(route) {
    return [
      {
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

test("accepts exactly the documented file-router path grammar", () => {
  const accepted = [
    "/",
    "/about",
    "/blog/hello-world.html",
    "/reserved%2Fescape",
    "/malformed%ZZescape",
    "/incomplete%E3%81",
    "/%252e",
    "/users/:id",
    "/teams/:teamId/users/:userId",
    "/docs/:slug{.+}",
  ];

  for (const path of accepted) {
    expect(() => assertSupportedRoutePath(path), path).not.toThrow();
  }
});

test("rejects non-canonical and application-owned Hono path patterns", () => {
  const rejected = [
    "users",
    "/users/",
    "/users//settings",
    "/users/:id?",
    "/users/*",
    "/users/:id{[0-9]+}",
    "/users/:path{.*}",
    "/users/:path{.+}/edit",
    "/users/:id/:id",
    "/users/prefix:id",
  ];

  for (const path of rejected) {
    expect(() => assertSupportedRoutePath(path), path).toThrow(
      /Unsupported file-router path/
    );
  }
});

test("rejects URL dot segments in literal, encoded, and mixed forms", () => {
  const rejected = [
    "/.",
    "/..",
    "/a/./b",
    "/a/../b",
    "/%2e/b",
    "/%2E/b",
    "/%2e%2e/b",
    "/.%2e/b",
    "/%2e./b",
    "/%2E%2e/b",
  ];

  for (const path of rejected) {
    expect(() => assertSupportedRoutePath(path), path).toThrow(
      /URL dot segment/
    );
  }
});

test("rejects static segments changed by Hono request-path decoding", () => {
  const rejected = [
    "/%41",
    "/a%20b",
    "/%E3%81%82",
    "/nested/%5C/path",
    "/%41%",
  ];

  for (const path of rejected) {
    expect(() => assertSupportedRoutePath(path), path).toThrow(
      /changes after Hono request-path decoding/
    );
  }
});

test("rejects default-convention files that alias decoded static routes", () => {
  const aliases = [
    ["./%41.tsx", "./A.tsx", "/%41", "/A"],
    ["./a%20b.tsx", "./a b.tsx", "/a%20b", "/a b"],
  ] as const;

  for (const [encodedFile, literalFile, encodedPath, literalPath] of aliases) {
    expect(routeFileToManifestPath(encodedFile)).toEqual({ path: encodedPath });
    expect(routeFileToManifestPath(literalFile)).toEqual({ path: literalPath });

    expect(() =>
      createRouteManifest({
        sources: [
          {
            files: {
              [encodedFile]: "encoded",
              [literalFile]: "literal",
            },
            renderer: textRenderer(),
          },
        ],
      })
    ).toThrow(/changes after Hono request-path decoding/);
  }
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

test("normalizes dynamic names while preserving catch-all shapes", () => {
  expect(routePathToShape("/users/:id/books/:bookId")).toBe(
    "/users/:param/books/:param"
  );
  expect(routePathToShape("/docs/:slug{.+}")).toBe(
    "/docs/:param{.+}"
  );
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
    "/data/users/:id",
    "/users/:id",
  ]);
});

test("defines a non-zero antisymmetric and transitive total path order", () => {
  const paths = [
    "/",
    "/about",
    "/users/settings",
    "/users/:id",
    "/users/:id/edit",
    "/users/:slug{.+}",
    "/teams/:teamId",
    "/teams/:rest{.+}",
  ];

  for (const a of paths) {
    for (const b of paths) {
      const aToB = compareRouteSpecificity(a, b);
      const bToA = compareRouteSpecificity(b, a);
      if (a === b) {
        expect(aToB, `${a} === ${b}`).toBe(0);
      } else {
        expect(aToB, `${a} !== ${b}`).not.toBe(0);
        expect(Math.sign(aToB), `${a} <> ${b}`).toBe(-Math.sign(bToA));
      }
    }
  }

  for (const a of paths) {
    for (const b of paths) {
      for (const c of paths) {
        if (
          compareRouteSpecificity(a, b) <= 0 &&
          compareRouteSpecificity(b, c) <= 0
        ) {
          expect(
            compareRouteSpecificity(a, c),
            `${a} <= ${b} <= ${c}`
          ).toBeLessThanOrEqual(0);
        }
      }
    }
  }
});

test("sorts every source permutation into the same path order", () => {
  const paths = [
    "/docs/:slug{.+}",
    "/docs/:id",
    "/docs/new",
    "/docs/:id/edit",
    "/",
  ];
  const expected = sortRoutesBySpecificity(
    paths.map((path) => ({ path }))
  ).map((route) => route.path);

  for (const permutation of permutations(paths)) {
    expect(
      sortRoutesBySpecificity(permutation.map((path) => ({ path }))).map(
        (route) => route.path
      )
    ).toEqual(expected);
  }
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
  expect(manifest.generatedRoutes.map((route) => route.owner)).toEqual([
    "text:./about.tsx",
    "text:./users/[id].tsx",
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
    generatedRoutes(_route) {
      return [
        {
          path: "/preview/about",
          render: () => new Response("first"),
        },
        {
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
    generatedRoutes(_route) {
      return [
        {
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
  api.get("/", (c) => c.text("api"));

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

function handWrittenManifest(
  overrides: Partial<RouteManifest> = {}
): RouteManifest {
  return {
    generatedRoutes: [],
    handlers: [],
    renderers: [textRenderer()],
    routes: [
      {
        file: "./about.tsx",
        id: "text:./about.tsx",
        path: "/about",
        rendererName: "text",
      },
    ],
    ...overrides,
  };
}

test("sorts every flat-plan permutation independently of route category", () => {
  const catchAll = new Hono();
  catchAll.get("/", (c) => c.text("catch-all"));
  const health = new Hono();
  health.get("/", (c) => c.text("health"));
  const routes: RouteManifest["routes"] = [
    {
      file: "./catalog/[id].tsx",
      id: "text:catalog-id",
      path: "/catalog/:id",
      rendererName: "text",
    },
    {
      file: "./alpha.tsx",
      id: "text:alpha",
      path: "/alpha",
      rendererName: "text",
    },
  ];
  const generatedRoutes: RouteManifest["generatedRoutes"] = [
    {
      owner: "text:catalog-id",
      path: "/catalog/new",
      render: () => new Response("new"),
    },
    {
      method: "POST",
      owner: "text:alpha",
      path: "/actions",
      render: () => new Response("action"),
    },
  ];
  const handlers: RouteManifest["handlers"] = [
    {
      file: "./catalog/[...rest].ts",
      id: "hono:catalog-rest",
      module: catchAll,
      path: "/catalog/:rest{.+}",
    },
    {
      file: "./health.ts",
      id: "hono:health",
      module: health,
      path: "/health",
    },
  ];
  const expected = [
    "generated:GET:/catalog/new",
    "generated:POST:/actions",
    "renderer:GET:/alpha",
    "hono:OPAQUE:/health",
    "renderer:GET:/catalog/:id",
    "hono:OPAQUE:/catalog/:rest{.+}",
  ];

  for (const routeOrder of permutations(routes)) {
    for (const generatedOrder of permutations(generatedRoutes)) {
      for (const handlerOrder of permutations(handlers)) {
        const plan = compileRegistrationPlan({
          generatedRoutes: generatedOrder,
          handlers: handlerOrder,
          renderers: [textRenderer()],
          routes: routeOrder,
        });
        expect(
          plan.map(
            (entry) =>
              `${entry.kind}:${entry.kind === "hono" ? "OPAQUE" : entry.method}:${entry.path}`
          )
        ).toEqual(expected);
      }
    }
  }
});

test("applies static, dynamic, and catch-all precedence across categories", async () => {
  const renderer: FileRouteRenderer = {
    name: "docs",
    accepts: () => true,
    render: ({ c }) => new Response(`dynamic:${c.req.param("id")}`),
  };
  const catchAll = new Hono();
  catchAll.get("/", (c) => c.text(`catch-all:${c.req.param("rest")}`));
  const manifest: RouteManifest = {
    generatedRoutes: [
      {
        owner: "docs:detail",
        path: "/docs/new",
        render: () => new Response("static:generated"),
      },
    ],
    handlers: [
      {
        file: "./docs/[...rest].ts",
        id: "hono:docs-rest",
        module: catchAll,
        path: "/docs/:rest{.+}",
      },
    ],
    renderers: [renderer],
    routes: [
      {
        file: "./docs/[id].tsx",
        id: "docs:detail",
        path: "/docs/:id",
        rendererName: "docs",
      },
    ],
  };
  const app = new Hono();
  applyRegistrationPlan(app, compileRegistrationPlan(manifest));

  expect(await (await app.request("/docs/new")).text()).toBe(
    "static:generated"
  );
  expect(await (await app.request("/docs/guide")).text()).toBe(
    "dynamic:guide"
  );
  expect(await (await app.request("/docs/guides/start")).text()).toBe(
    "catch-all:guides/start"
  );
});

test("allows one path across distinct concrete generated methods", async () => {
  const renderer: FileRouteRenderer = {
    name: "method-aware",
    accepts: () => true,
    generatedRoutes(route) {
      return [
        {
          method: "POST",
          path: route.path,
          render: () => new Response("generated:POST"),
        },
        {
          method: "ALL",
          path: "/events",
          render: ({ c }) => new Response(`generated:ALL:${c.req.method}`),
        },
      ];
    },
    render: () => new Response("renderer:GET"),
  };
  const app = createFileRouter({
    sources: [{ files: { "./resource.tsx": "resource" }, renderer }],
  });

  expect(await (await app.request("/resource")).text()).toBe("renderer:GET");
  expect(
    await (await app.request("/resource", { method: "POST" })).text()
  ).toBe("generated:POST");
  expect(await (await app.request("/events")).text()).toBe(
    "generated:ALL:GET"
  );
  expect(
    await (await app.request("/events", { method: "DELETE" })).text()
  ).toBe("generated:ALL:DELETE");
});

test("rejects duplicate methods and equivalent dynamic shapes", () => {
  const opaque = new Hono();
  opaque.post("/", (c) => c.text("opaque"));
  const duplicateMethod = handWrittenManifest({
    generatedRoutes: [
      {
        method: "POST",
        owner: "text:./about.tsx",
        path: "/preview/:id",
        render: () => new Response("first"),
      },
      {
        method: "POST",
        owner: "text:./about.tsx",
        path: "/preview/:name",
        render: () => new Response("second"),
      },
    ],
  });
  const allMethod = handWrittenManifest({
    generatedRoutes: [
      {
        method: "GET",
        owner: "text:./about.tsx",
        path: "/events",
        render: () => new Response("get"),
      },
      {
        method: "ALL",
        owner: "text:./about.tsx",
        path: "/events",
        render: () => new Response("all"),
      },
    ],
  });
  const opaqueShape = handWrittenManifest({
    handlers: [
      {
        file: "./users/[name].ts",
        id: "hono:users-name",
        module: opaque,
        path: "/users/:name",
      },
    ],
    routes: [
      {
        file: "./users/[id].tsx",
        id: "text:users-id",
        path: "/users/:id",
        rendererName: "text",
      },
    ],
  });

  expect(() => compileRegistrationPlan(duplicateMethod)).toThrow(
    /Duplicate route shape "\/preview\/:param" for POST/
  );
  expect(() => compileRegistrationPlan(allMethod)).toThrow(
    /Duplicate route shape "\/events" for ALL/
  );
  expect(() => compileRegistrationPlan(opaqueShape)).toThrow(
    /Duplicate route shape "\/users\/:param" for opaque Hono methods/
  );
});

test("preflights every configuration error before mutating the target app", () => {
  const invalidChild = new Hono();
  invalidChild.get("/nested", (c) => c.text("invalid"));
  const collidingChild = new Hono();
  collidingChild.get("/", (c) => c.text("collision"));

  const cases: [string, RouteManifest][] = [
    [
      "unknown renderer",
      handWrittenManifest({
        routes: [
          {
            file: "./about.tsx",
            id: "missing:./about.tsx",
            path: "/about",
            rendererName: "missing",
          },
        ],
      }),
    ],
    [
      "duplicate renderer",
      handWrittenManifest({
        renderers: [textRenderer(), textRenderer()],
      }),
    ],
    [
      "empty renderer name",
      handWrittenManifest({
        renderers: [textRenderer(" ")],
      }),
    ],
    [
      "unknown generated owner",
      handWrittenManifest({
        generatedRoutes: [
          {
            owner: "missing:./about.tsx",
            path: "/__data/about",
            render: () => new Response("missing"),
          },
        ],
      }),
    ],
    [
      "unsupported generated method",
      handWrittenManifest({
        generatedRoutes: [
          {
            method: "TRACE" as never,
            owner: "text:./about.tsx",
            path: "/__data/about",
            render: () => new Response("trace"),
          },
        ],
      }),
    ],
    [
      "invalid Hono module",
      handWrittenManifest({
        handlers: [
          {
            file: "./invalid.ts",
            id: "hono:./invalid.ts",
            module: invalidChild,
            path: "/invalid",
          },
        ],
      }),
    ],
    [
      "structural collision",
      handWrittenManifest({
        handlers: [
          {
            file: "./about.ts",
            id: "hono:./about.ts",
            module: collidingChild,
            path: "/about",
          },
        ],
      }),
    ],
    [
      "generated structural collision",
      handWrittenManifest({
        generatedRoutes: [
          {
            owner: "text:./about.tsx",
            path: "/about",
            render: () => new Response("collision"),
          },
        ],
      }),
    ],
    [
      "unsupported file-router grammar",
      handWrittenManifest({
        routes: [
          {
            file: "./optional.tsx",
            id: "text:./optional.tsx",
            path: "/optional/:id?",
            rendererName: "text",
          },
        ],
      }),
    ],
  ];

  for (const [name, manifest] of cases) {
    const app = new Hono();
    app.get("/healthz", (c) => c.text("ok"));
    const originalRoutes = [...app.routes];

    expect(() => mountFileRoutes(app, { manifest }), name).toThrow();
    expect(app.routes, name).toEqual(originalRoutes);
  }
});

test("rejects URL dot segments while compiling and before mount mutation", () => {
  const rejected = [
    "/.",
    "/..",
    "/a/./b",
    "/a/../b",
    "/%2e/b",
    "/%2E/b",
    "/%2e%2e/b",
    "/.%2e/b",
    "/%2e./b",
    "/%2E%2e/b",
  ];

  for (const path of rejected) {
    const manifest = handWrittenManifest({
      routes: [
        {
          file: "./dot-segment.tsx",
          id: "text:./dot-segment.tsx",
          path,
          rendererName: "text",
        },
      ],
    });

    expect(() => compileRegistrationPlan(manifest), path).toThrow(
      /URL dot segment/
    );

    const app = new Hono();
    app.get("/healthz", (c) => c.text("ok"));
    const originalRoutes = [...app.routes];

    expect(() => mountFileRoutes(app, { manifest }), path).toThrow(
      /URL dot segment/
    );
    expect(app.routes, path).toEqual(originalRoutes);
  }
});

test("rejects request-decoded static paths before mount mutation", () => {
  const rejected = ["/%41", "/a%20b", "/%E3%81%82", "/%41%"];

  for (const path of rejected) {
    const manifest = handWrittenManifest({
      routes: [
        {
          file: "./request-decoded.tsx",
          id: "text:./request-decoded.tsx",
          path,
          rendererName: "text",
        },
      ],
    });

    expect(() => compileRegistrationPlan(manifest), path).toThrow(
      /changes after Hono request-path decoding/
    );

    const app = new Hono();
    app.get("/healthz", (c) => c.text("ok"));
    const originalRoutes = [...app.routes];

    expect(() => mountFileRoutes(app, { manifest }), path).toThrow(
      /changes after Hono request-path decoding/
    );
    expect(app.routes, path).toEqual(originalRoutes);
  }
});

test("compiles resolved handlers without renderer searches at request time", async () => {
  let acceptsCalls = 0;
  const renderer: FileRouteRenderer = {
    name: "exact",
    accepts() {
      acceptsCalls += 1;
      throw new Error("accepts must not run for a supplied manifest");
    },
    render: () => new Response("captured"),
  };
  const manifest = handWrittenManifest({
    renderers: [renderer],
    routes: [
      {
        file: "./captured.tsx",
        id: "exact:./captured.tsx",
        path: "/captured",
        rendererName: "exact",
      },
    ],
  });

  const plan = compileRegistrationPlan(manifest);
  manifest.renderers.splice(0, 1, {
    ...renderer,
    render: () => new Response("replacement"),
  });
  const app = new Hono();
  applyRegistrationPlan(app, plan);

  expect(acceptsCalls).toBe(0);
  expect(plan).toMatchObject([
    {
      kind: "renderer",
      method: "GET",
      path: "/captured",
      source: "./captured.tsx",
    },
  ]);
  expect(await (await app.request("/captured")).text()).toBe("captured");
  expect(acceptsCalls).toBe(0);
});

test("applies each Hono registration once as an opaque child app", async () => {
  const child = new Hono();
  child.use("/", async (c, next) => {
    c.header("X-Child", "true");
    await next();
  });
  child.get("/", (c) => c.text("get"));
  child.post("/", (c) => c.text("post"));
  const manifest = handWrittenManifest({
    handlers: [
      {
        file: "./opaque.ts",
        id: "hono:./opaque.ts",
        module: child,
        path: "/opaque",
      },
    ],
    renderers: [],
    routes: [],
  });
  const plan = compileRegistrationPlan(manifest);
  const honoEntries = plan.filter((entry) => entry.kind === "hono");
  expect(honoEntries).toEqual([
    {
      app: child,
      kind: "hono",
      path: "/opaque",
      source: "./opaque.ts",
    },
  ]);

  const app = new Hono();
  const originalRoute = app.route.bind(app);
  let routeCalls = 0;
  app.route = ((path: string, routedApp: Hono) => {
    routeCalls += 1;
    expect(path).toBe("/opaque");
    expect(routedApp).toBe(child);
    return originalRoute(path, routedApp);
  }) as typeof app.route;
  applyRegistrationPlan(app, plan);

  expect(routeCalls).toBe(1);
  const getResponse = await app.request("/opaque");
  expect(await getResponse.text()).toBe("get");
  expect(getResponse.headers.get("X-Child")).toBe("true");
  expect(
    await (await app.request("/opaque", { method: "POST" })).text()
  ).toBe("post");
});

test("does not roll back registrations when a user handler later throws", async () => {
  const renderer: FileRouteRenderer = {
    name: "throwing",
    accepts: () => true,
    render() {
      throw new Error("user handler failed");
    },
  };
  const app = new Hono();
  app.onError((error, c) => c.text(error.message, 500));
  mountFileRoutes(app, {
    manifest: handWrittenManifest({
      renderers: [renderer],
      routes: [
        {
          file: "./failure.tsx",
          id: "throwing:./failure.tsx",
          path: "/failure",
          rendererName: "throwing",
        },
      ],
    }),
  });
  const registeredRoutes = [...app.routes];

  const response = await app.request("/failure");
  expect(response.status).toBe(500);
  expect(await response.text()).toBe("user handler failed");
  expect(app.routes).toEqual(registeredRoutes);
  expect(app.routes.some((route) => route.path === "/failure")).toBe(true);
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
    generatedRoutes(_route) {
      return [
        {
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

test("accepts eager root-only Hono modules with methods and handler chains", async () => {
  interface TestEnv {
    Variables: {
      prefix: string;
    };
  }
  const api = new Hono<TestEnv>();
  api.use("/", async (c, next) => {
    c.set("prefix", "handled");
    await next();
  });
  api.get(
    "/",
    async (c, next) => {
      c.header("X-Route-Middleware", "true");
      await next();
    },
    (c) => c.text(`${c.var.prefix}:get`)
  );
  api.post("/", (c) => c.text(`${c.var.prefix}:post`));

  const direct = new Hono();
  direct.all("/", (c) => c.text(`all:${c.req.method}`));

  const app = createFileRouter<TestEnv>({
    sources: [
      {
        files: {
          "./api.ts": { default: api },
          "./direct.ts": direct,
        },
      },
    ],
  });

  const getResponse = await app.request("/api");
  expect(await getResponse.text()).toBe("handled:get");
  expect(getResponse.headers.get("X-Route-Middleware")).toBe("true");
  expect(
    await (await app.request("/api", { method: "POST" })).text()
  ).toBe("handled:post");
  expect(await (await app.request("/direct")).text()).toBe("all:GET");
});

test("accepts direct and default-export apps from official Hono presets", async () => {
  const quickDirect = new QuickHono();
  quickDirect.get("/", (c) => c.text("quick-direct"));
  const quickModule = new QuickHono();
  quickModule.get("/", (c) => c.text("quick-module"));
  const tinyDirect = new TinyHono();
  tinyDirect.get("/", (c) => c.text("tiny-direct"));
  const tinyModule = new TinyHono();
  tinyModule.get("/", (c) => c.text("tiny-module"));

  const app = createFileRouter({
    sources: [
      {
        files: {
          "./quick-direct.ts": quickDirect,
          "./quick-module.ts": { default: quickModule },
          "./tiny-direct.ts": tinyDirect,
          "./tiny-module.ts": { default: tinyModule },
        },
      },
    ],
  });

  expect(await (await app.request("/quick-direct")).text()).toBe(
    "quick-direct"
  );
  expect(await (await app.request("/quick-module")).text()).toBe(
    "quick-module"
  );
  expect(await (await app.request("/tiny-direct")).text()).toBe("tiny-direct");
  expect(await (await app.request("/tiny-module")).text()).toBe("tiny-module");
});

test("rejects fetch-only route objects", () => {
  expect(() =>
    createRouteManifest({
      sources: [
        {
          files: {
            "./like.ts": {
              fetch: () => new Response("not a Hono app"),
            } as unknown as Hono,
          },
        },
      ],
    })
  ).toThrow(/must export a Hono app/);
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

test("preserves parent Context contracts for eager route modules", async () => {
  interface TestEnv {
    Bindings: {
      prefix: string;
    };
    Variables: {
      greeting: string;
    };
  }
  let childContext: Context<TestEnv> | undefined;
  let parentContext: Context<TestEnv> | undefined;
  const pending: Promise<unknown>[] = [];
  const executionCtx = {
    exports: undefined,
    passThroughOnException() {
      pending.push(Promise.resolve("pass-through"));
    },
    props: {},
    waitUntil(promise: Promise<unknown>) {
      pending.push(promise);
    },
  };

  const profile = new Hono<TestEnv>();
  profile.get("/", (c) => {
    childContext = c;
    c.executionCtx.waitUntil(Promise.resolve());
    return c.render(
      `${c.var.greeting}:${c.env.prefix}:${c.req.param("id")}`
    );
  });

  const app = new Hono<TestEnv>();
  app.use("*", async (c, next) => {
    parentContext = c;
    c.set("greeting", "hello");
    c.setRenderer((content) => c.text(`rendered:${content}`));
    await next();
  });
  mountFileRoutes(app, {
    sources: [
      {
        files: {
          "./users/[id].ts": profile,
        },
      },
    ],
  });

  const response = await app.request(
    "/users/42",
    undefined,
    { prefix: "binding" },
    executionCtx
  );
  expect(await response.text()).toBe("rendered:hello:binding:42");
  expect(childContext).toBe(parentContext);
  expect(pending).toHaveLength(1);
});

test("preserves child onError through app.route composition", async () => {
  const route = new Hono();
  route.get("/", () => {
    throw new Error("route failed");
  });
  route.onError((error, c) => c.text(`child:${error.message}`, 503));

  const app = createFileRouter({
    sources: [{ files: { "./failure.ts": route } }],
  });
  const response = await app.request("/failure");

  expect(response.status).toBe(503);
  expect(await response.text()).toBe("child:route failed");
});

test("rejects lazy Hono route sources with eager glob guidance", () => {
  const route = new Hono();
  route.get("/", (c) => c.text("ok"));

  expect(() =>
    createRouteManifest({
      sources: [
        {
          files: {
            "./lazy.ts": (() =>
              Promise.resolve({ default: route })) as unknown as Hono,
          },
        },
      ],
    })
  ).toThrow(/eager: true/);
});

test("rejects empty Hono route modules", () => {
  expect(() =>
    createRouteManifest({
      sources: [{ files: { "./empty.ts": new Hono() } }],
    })
  ).toThrow(/at least one route at "\/"/);
});

test("rejects every non-root Hono child route shape", () => {
  const starRoute = new Hono();
  starRoute.all("/", (c) => c.text("invalid"));
  const [starEntry] = starRoute.routes;
  if (starEntry) {
    starEntry.path = "*";
  }

  const wildcardRoute = new Hono();
  wildcardRoute.use(async (_c, next) => next());

  const invalidRoutes: [string, Hono][] = [
    ["*", starRoute],
    ["/*", wildcardRoute],
  ];
  for (const path of ["/:id", "/:id{[0-9]+}", "/nested"]) {
    const route = new Hono();
    route.all(path, (c) => c.text("invalid"));
    invalidRoutes.push([path, route]);
  }

  for (const [path, route] of invalidRoutes) {
    expect(() =>
      createRouteManifest({
        sources: [{ files: { [`./${encodeURIComponent(path)}.ts`]: route } }],
      })
    ).toThrow(new RegExp(`found "${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  }
});

test("validates every Hono module before mutating the target app", () => {
  const invalid = new Hono();
  invalid.get("/nested", (c) => c.text("invalid"));
  const app = new Hono();
  app.get("/healthz", (c) => c.text("ok"));
  const originalRoutes = [...app.routes];

  expect(() =>
    mountFileRoutes(app, {
      sources: [
        {
          files: { "./about.tsx": "about" },
          renderer: textRenderer(),
        },
        { files: { "./invalid.ts": invalid } },
      ],
    })
  ).toThrow(/must only define routes at "\/"/);
  expect(app.routes).toEqual(originalRoutes);
});

test("builds request pathnames from dynamic params", () => {
  expect(pathnameFromRoutePath("/users/:id", { id: "a b" })).toBe(
    "/users/a%20b"
  );
});

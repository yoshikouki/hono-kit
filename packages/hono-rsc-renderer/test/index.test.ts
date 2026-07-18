import { expect, test } from "bun:test";
import { Hono } from "hono";
import { createElement, Fragment, isValidElement } from "react";
import type { ReactNode } from "react";
import { rscRenderer } from "../src";

function textStream(value: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
}

function varyTokens(response: Response): string[] {
  return (response.headers.get("Vary") ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .sort();
}

async function renderTestNode(node: ReactNode): Promise<string> {
  const resolvedNode = await node;
  if (!isValidElement(resolvedNode)) {
    return String(resolvedNode ?? "");
  }

  const props = resolvedNode.props as { children?: ReactNode };
  if (resolvedNode.type === Fragment || typeof resolvedNode.type === "string") {
    return renderTestNode(props.children);
  }
  if (typeof resolvedNode.type !== "function") {
    throw new TypeError("The test renderer only supports function components");
  }

  const component = resolvedNode.type as (
    componentProps: typeof resolvedNode.props
  ) => ReactNode | Promise<ReactNode>;
  return renderTestNode(await component(resolvedNode.props));
}

function createTestApp() {
  const app = new Hono();
  app.get(
    "/page/*",
    rscRenderer(
      ({ children, title }) => `${title ?? "Untitled"}:${children ?? ""}`,
      {
        renderHtml: async (rscStream) => rscStream,
        renderRsc: async (node) => textStream(await renderTestNode(node)),
      }
    )
  );
  app.get("/page/about/:name", (c) => {
    if (c.req.header("RSC") === "1") {
      c.status(202);
    }
    c.header("Vary", "Origin, accept");
    c.header("X-Route-Header", "preserved");
    return c.render(c.req.param("name"), { title: "About" });
  });
  return app;
}

test("sets a Hono renderer that serves HTML through c.render", async () => {
  const app = createTestApp();
  const response = await app.request("/page/about/codex");

  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toContain("text/html");
  expect(varyTokens(response)).toEqual(["accept", "origin", "rsc"]);
  expect(response.headers.get("Cache-Control")).toBeNull();
  expect(response.headers.get("X-Route-Header")).toBe("preserved");
  expect(await response.text()).toBe("About:codex");
});

test("serves Flight from the same route when RSC headers are present", async () => {
  const app = createTestApp();
  const response = await app.request("/page/about/codex", {
    headers: { Accept: "text/x-component", RSC: "1" },
  });

  expect(response.status).toBe(202);
  expect(response.headers.get("Content-Type")).toContain("text/x-component");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(varyTokens(response)).toEqual(["accept", "origin", "rsc"]);
  expect(response.headers.get("X-Route-Header")).toBe("preserved");
  expect(await response.text()).toBe("About:codex");
});

test("defers component and promised children evaluation to the RSC renderer", async () => {
  let componentCalls = 0;
  let resolveChildren: (value: string) => void = () => undefined;
  const children = new Promise<string>((resolve) => {
    resolveChildren = resolve;
  });
  const app = new Hono();

  app.get(
    "*",
    rscRenderer(
      ({ children: componentChildren }) => {
        componentCalls += 1;
        return createElement(Fragment, null, componentChildren);
      },
      {
        renderHtml: async (rscStream) => rscStream,
        renderRsc: async (node) => {
          expect(componentCalls).toBe(0);
          resolveChildren("deferred");
          return textStream(await renderTestNode(node));
        },
      }
    )
  );
  app.get("/", (c) => c.render(children));

  const response = await app.request("/");

  expect(componentCalls).toBe(1);
  expect(await response.text()).toBe("deferred");
});

test("passes render errors to the request-scoped error observer", async () => {
  const error = new Error("render failed");
  const calls: Array<{ error: unknown; path: string }> = [];
  const app = new Hono();

  app.get(
    "*",
    rscRenderer(
      () => {
        throw error;
      },
      {
        onError: (caughtError, c) => {
          calls.push({ error: caughtError, path: c.req.path });
        },
        renderHtml: async (rscStream) => rscStream,
        renderRsc: async (node, options) => {
          try {
            return textStream(await renderTestNode(node));
          } catch (caughtError) {
            options.onError?.(caughtError);
            return textStream("render failed");
          }
        },
      }
    )
  );
  app.get("/observed", (c) => c.render("content"));

  const response = await app.request("/observed");

  expect(await response.text()).toBe("render failed");
  expect(calls).toEqual([{ error, path: "/observed" }]);
});

test("keeps custom RSC negotiation and Vary headers in one contract", async () => {
  const app = new Hono();

  app.get(
    "*",
    rscRenderer(undefined, {
      negotiation: {
        isRscRequest: (c) => c.req.header("X-Flight") === "1",
        varyHeaders: ["X-Flight"],
      },
      renderHtml: async (rscStream) => rscStream,
      renderRsc: (node) => textStream(String(node)),
    })
  );
  app.get("/", (c) => c.render("content"));

  const htmlResponse = await app.request("/");
  const rscResponse = await app.request("/", {
    headers: { "X-Flight": "1" },
  });

  expect(htmlResponse.headers.get("Content-Type")).toContain("text/html");
  expect(varyTokens(htmlResponse)).toEqual(["x-flight"]);
  expect(rscResponse.headers.get("Content-Type")).toContain("text/x-component");
  expect(varyTokens(rscResponse)).toEqual(["x-flight"]);
});

test("defaults nonce-bearing HTML to private no-store", async () => {
  const app = new Hono();

  app.get(
    "*",
    rscRenderer(undefined, {
      getNonce: () => "request-nonce",
      renderHtml: async (rscStream) => rscStream,
      renderRsc: (node) => textStream(String(node)),
    })
  );
  app.get("/", (c) => c.render("content"));

  const response = await app.request("/");

  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});

test("preserves an explicit Cache-Control for nonce-bearing HTML", async () => {
  const app = new Hono();

  app.get(
    "*",
    rscRenderer(undefined, {
      getNonce: () => "request-nonce",
      renderHtml: async (rscStream) => rscStream,
      renderRsc: (node) => textStream(String(node)),
    })
  );
  app.get("/", (c) => {
    c.status(201);
    c.header("Cache-Control", "private, max-age=0, must-revalidate");
    return c.render("content");
  });

  const response = await app.request("/");

  expect(response.status).toBe(201);
  expect(response.headers.get("Cache-Control")).toBe(
    "private, max-age=0, must-revalidate"
  );
});

test("resolves a request nonce once and passes its raw value to HTML rendering", async () => {
  const nonces: Array<string | undefined> = [];
  let getNonceCalls = 0;
  const app = new Hono();

  app.get(
    "*",
    rscRenderer(undefined, {
      getNonce: (c) => {
        getNonceCalls += 1;
        return c.req.header("X-Test-Nonce");
      },
      renderHtml: (rscStream, options) => {
        nonces.push(options.nonce);
        return Promise.resolve(rscStream);
      },
      renderRsc: (node) => textStream(String(node)),
    })
  );
  app.get("/", (c) => c.render("content"));

  const response = await app.request("/", {
    headers: { "X-Test-Nonce": "request-nonce" },
  });

  expect(await response.text()).toBe("content");
  expect(getNonceCalls).toBe(1);
  expect(nonces).toEqual(["request-nonce"]);
});

test("does not resolve or pass a nonce for Flight responses", async () => {
  let getNonceCalls = 0;
  const app = new Hono();

  app.get(
    "*",
    rscRenderer(undefined, {
      getNonce: () => {
        getNonceCalls += 1;
        return "unused-nonce";
      },
      renderHtml: () =>
        Promise.reject(new Error("Flight responses must not render HTML")),
      renderRsc: (node) => textStream(String(node)),
    })
  );
  app.get("/", (c) => {
    c.header("Cache-Control", "private, max-age=0, must-revalidate");
    return c.render("content");
  });

  const response = await app.request("/", {
    headers: { Accept: "text/x-component", RSC: "1" },
  });

  expect(await response.text()).toBe("content");
  expect(response.headers.get("Cache-Control")).toBe(
    "private, max-age=0, must-revalidate"
  );
  expect(getNonceCalls).toBe(0);
});

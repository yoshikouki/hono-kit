import { expect, test } from "bun:test";
import { Hono } from "hono";
import { rscRenderer } from "../src";

function textStream(value: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
}

function createTestApp() {
  const app = new Hono();
  app.get(
    "/page/*",
    rscRenderer(
      ({ children, title }) => `${title ?? "Untitled"}:${children ?? ""}`,
      {
        renderHtml: async (rscStream) => rscStream,
        renderRsc: (node) => textStream(String(node)),
      }
    )
  );
  app.get("/page/about/:name", (c) =>
    c.render(c.req.param("name"), { title: "About" })
  );
  return app;
}

test("sets a Hono renderer that serves HTML through c.render", async () => {
  const app = createTestApp();
  const response = await app.request("/page/about/codex");

  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toContain("text/html");
  expect(response.headers.get("Vary")).toContain("RSC");
  expect(response.headers.get("Vary")).toContain("Accept");
  expect(await response.text()).toBe("About:codex");
});

test("serves Flight from the same route when RSC headers are present", async () => {
  const app = createTestApp();
  const response = await app.request("/page/about/codex", {
    headers: { Accept: "text/x-component", RSC: "1" },
  });

  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toContain("text/x-component");
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(response.headers.get("Vary")).toContain("RSC");
  expect(response.headers.get("Vary")).toContain("Accept");
  expect(await response.text()).toBe("About:codex");
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
  app.get("/", (c) => c.render("content"));

  const response = await app.request("/", {
    headers: { Accept: "text/x-component", RSC: "1" },
  });

  expect(await response.text()).toBe("content");
  expect(getNonceCalls).toBe(0);
});

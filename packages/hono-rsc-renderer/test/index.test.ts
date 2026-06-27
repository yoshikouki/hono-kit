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

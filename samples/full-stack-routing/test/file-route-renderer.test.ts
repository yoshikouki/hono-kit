import { expect, test } from "bun:test";
import {
  createFileRouter,
  type FileRouteRenderer,
} from "@yoshikouki/hono-file-router";
import { rscRenderer } from "@yoshikouki/hono-rsc-renderer";
import { Hono } from "hono";
import type { Context } from "hono";

function textStream(value: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
}

test("renders file-route renderer pages through the request-scoped RSC renderer", async () => {
  interface TestEnv {
    Variables: {
      requestId: string;
    };
  }

  interface PageModule {
    default: string;
  }

  const middlewareContexts: Context<TestEnv>[] = [];
  const rendererContexts: Context<TestEnv>[] = [];
  const pageRenderer: FileRouteRenderer<TestEnv, PageModule> = {
    name: "rsc-page",
    accepts: () => true,
    async render({ c, route }) {
      rendererContexts.push(c);
      const page = await route.load?.();
      if (!page) {
        throw new Error(`Missing page module for ${route.file}`);
      }
      return c.render(
        `${page.default}:${c.var.requestId}:${c.req.param("id")}:${route.path}`
      );
    },
  };
  const fileRoutes = createFileRouter<TestEnv>({
    sources: [
      {
        files: {
          "./users/[id].tsx": async () => ({ default: "profile" }),
        },
        renderer: pageRenderer,
      },
    ],
  });

  const app = new Hono<TestEnv>();
  app.use("*", async (c, next) => {
    middlewareContexts.push(c);
    c.set("requestId", `request:${c.req.path}`);
    await next();
  });
  app.get(
    "*",
    rscRenderer<TestEnv>(undefined, {
      renderHtml: async (rscStream) => rscStream,
      renderRsc: (node) => textStream(String(node)),
    })
  );
  app.route("/", fileRoutes);

  const htmlResponse = await app.request("/users/42");
  expect(htmlResponse.status).toBe(200);
  expect(htmlResponse.headers.get("Content-Type")).toContain("text/html");
  expect(await htmlResponse.text()).toBe(
    "profile:request:/users/42:42:/users/:id"
  );

  const flightResponse = await app.request("/users/42", {
    headers: { Accept: "text/x-component", RSC: "1" },
  });
  expect(flightResponse.status).toBe(200);
  expect(flightResponse.headers.get("Content-Type")).toContain(
    "text/x-component"
  );
  expect(flightResponse.headers.get("Vary")).toContain("RSC");
  expect(flightResponse.headers.get("Vary")).toContain("Accept");
  expect(await flightResponse.text()).toBe(
    "profile:request:/users/42:42:/users/:id"
  );

  expect(rendererContexts).toHaveLength(2);
  expect(middlewareContexts).toHaveLength(2);
  expect(rendererContexts[0]).toBe(middlewareContexts[0]);
  expect(rendererContexts[1]).toBe(middlewareContexts[1]);
});

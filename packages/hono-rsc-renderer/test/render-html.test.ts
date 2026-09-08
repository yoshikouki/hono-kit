import { expect, test } from "bun:test";
import type { ReactNode } from "react";
import {
  type RenderHtmlRuntime,
  renderHtmlWithRuntime,
} from "../src/render-html";

function textStream(value: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
}

test("passes the same raw nonce to Vite RSC and React DOM", async () => {
  const rscStream = textStream("rsc");
  const htmlStream = textStream("html");
  const root = "root" as ReactNode;
  const signal = AbortSignal.timeout(1000);
  const onError = () => undefined;
  const calls: Array<{ name: string; options: unknown }> = [];
  const runtime: RenderHtmlRuntime = {
    createFromReadableStream: async (stream, options) => {
      expect(await new Response(stream).text()).toBe("rsc");
      calls.push({ name: "vite-rsc", options });
      return Promise.resolve(root);
    },
    renderToReadableStream: (node, options) => {
      expect(node).toBe(root);
      calls.push({ name: "react-dom", options });
      return htmlStream;
    },
  };

  const result = await renderHtmlWithRuntime(
    rscStream,
    "/assets/entry.browser.js",
    { nonce: "request-nonce", onError, signal },
    runtime
  );

  const html = await new Response(result).text();
  expect(html).toContain("__FLIGHT_DATA");
  expect(html).toContain('nonce="request-nonce"');
  expect(html).toContain('.push("rsc")');
  expect(calls).toEqual([
    { name: "vite-rsc", options: { nonce: "request-nonce" } },
    {
      name: "react-dom",
      options: {
        bootstrapModules: ["/assets/entry.browser.js"],
        nonce: "request-nonce",
        onError,
        signal,
      },
    },
  ]);
});

test("passes undefined to both runtimes when no nonce is configured", async () => {
  const calls: Array<{ name: string; options: unknown }> = [];
  const runtime: RenderHtmlRuntime = {
    createFromReadableStream: (_stream, options) => {
      calls.push({ name: "vite-rsc", options });
      return Promise.resolve("root");
    },
    renderToReadableStream: (_node, options) => {
      calls.push({ name: "react-dom", options });
      return textStream("html");
    },
  };

  const result = await renderHtmlWithRuntime(
    textStream("rsc"),
    "/assets/entry.browser.js",
    {},
    runtime
  );

  expect(await new Response(result).text()).toContain("__FLIGHT_DATA");
  expect(calls[0]).toEqual({
    name: "vite-rsc",
    options: { nonce: undefined },
  });
  expect(calls[1]).toMatchObject({
    name: "react-dom",
    options: { nonce: undefined },
  });
});

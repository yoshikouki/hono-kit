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
    createFromReadableStream: (stream, options) => {
      expect(stream).toBe(rscStream);
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
    Promise.resolve("bootstrap()"),
    { nonce: "request-nonce", onError, signal },
    runtime
  );

  expect(result).toBe(htmlStream);
  expect(calls).toEqual([
    { name: "vite-rsc", options: { nonce: "request-nonce" } },
    {
      name: "react-dom",
      options: {
        bootstrapScriptContent: "bootstrap()",
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

  await renderHtmlWithRuntime(textStream("rsc"), "bootstrap()", {}, runtime);

  expect(calls[0]).toEqual({
    name: "vite-rsc",
    options: { nonce: undefined },
  });
  expect(calls[1]).toMatchObject({
    name: "react-dom",
    options: { nonce: undefined },
  });
});

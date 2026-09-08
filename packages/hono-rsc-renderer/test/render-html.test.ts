import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
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


// Execute the emitted scripts and the real client reader in an isolated browser
// global, including its DOMContentLoaded stream completion path.
async function readEmbeddedFlight(html: string): Promise<Uint8Array> {
  let onLoaded = () => undefined;
  const context = {
    self: {},
    window: {},
    document: {
      readyState: "loading",
      addEventListener: (_event: string, listener: () => undefined) => {
        onLoaded = listener;
      },
    },
    TextEncoder,
    ReadableStream,
    Uint8Array,
    atob,
    result: undefined as ReadableStream<Uint8Array> | undefined,
  };
  context.window = context.self;
  const client = readFileSync(
    new URL(import.meta.resolve("rsc-html-stream/client")),
    "utf8"
  ).replace("export let rscStream", "let rscStream");
  runInNewContext(`${client}\nglobalThis.result = rscStream;`, context);
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    runInNewContext(match[1] ?? "", context);
  }
  onLoaded();
  return new Uint8Array(await new Response(context.result).arrayBuffer());
}

const binary = new Uint8Array(2049).fill(0x61);
binary[2048] = 0xe2;
const text = new TextEncoder();

test.each([
  ["binary followed by Flight text", [text.encode("1:o801,"), binary, text.encode('0:{"bytes":"$1"}\n')]],
  ["incomplete UTF-8 at end of stream", [new Uint8Array([0x61, 0xe2])]],
  ["split Japanese text", [new Uint8Array([0xe3]), new Uint8Array([0x81, 0x82])]],
  ["BOM bytes", [new Uint8Array([0xef, 0xbb, 0xbf, 0x61])]],
  ["large binary chunk", [new Uint8Array(256 * 1024).fill(0xff)]],
  ["script-like text", [text.encode('</script><script>throw new Error("injected")</script><!--')]],
] as const)("preserves %s through the embedded client stream", async (_name, chunks) => {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  let ssrBytes: Uint8Array | undefined;
  const result = await renderHtmlWithRuntime(source, "/entry.js", {}, {
    createFromReadableStream: async (stream) => {
      ssrBytes = new Uint8Array(await new Response(stream).arrayBuffer());
      return "root";
    },
    renderToReadableStream: () => textStream("<html><body>root</body></html>"),
  });
  expect(await readEmbeddedFlight(await new Response(result).text())).toEqual(ssrBytes);
});

import {
  createFromReadableStream,
  getClientEntryUrl,
} from "@vitejs/plugin-rsc/ssr";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.edge";
import {
  type RenderHtmlOptions,
  renderHtmlWithRuntime,
} from "./render-html";

export type { RenderHtmlOptions } from "./render-html";

const clientEntryUrl = getClientEntryUrl();

export function renderHtml(
  rscStream: ReadableStream<Uint8Array>,
  options: RenderHtmlOptions = {}
): Promise<ReadableStream<Uint8Array>> {
  return renderHtmlWithRuntime(rscStream, clientEntryUrl, options, {
    createFromReadableStream: (stream, runtimeOptions) =>
      createFromReadableStream<ReactNode>(stream, runtimeOptions),
    renderToReadableStream: (node, runtimeOptions) =>
      renderToReadableStream(node, runtimeOptions),
  });
}

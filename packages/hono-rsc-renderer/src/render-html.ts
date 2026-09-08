import type { ReactNode } from "react";
import { injectRSCPayload } from "./inject-rsc-payload";

export interface RenderHtmlOptions {
  nonce?: string;
  onError?: (error: unknown) => void;
  signal?: AbortSignal;
}

export interface RenderHtmlRuntime {
  createFromReadableStream: (
    stream: ReadableStream<Uint8Array>,
    options: { nonce?: string }
  ) => Promise<ReactNode>;
  renderToReadableStream: (
    node: ReactNode,
    options: {
      bootstrapModules: string[];
      nonce?: string;
      onError: (error: unknown) => void;
      signal?: AbortSignal;
    }
  ) => ReadableStream<Uint8Array> | Promise<ReadableStream<Uint8Array>>;
}

export async function renderHtmlWithRuntime(
  rscStream: ReadableStream<Uint8Array>,
  clientEntryUrl: string,
  options: RenderHtmlOptions,
  runtime: RenderHtmlRuntime
): Promise<ReadableStream<Uint8Array>> {
  const [forSsr, forPayload] = rscStream.tee();
  const root = await runtime.createFromReadableStream(forSsr, {
    nonce: options.nonce,
  });
  const html = await runtime.renderToReadableStream(root, {
    bootstrapModules: [clientEntryUrl],
    nonce: options.nonce,
    onError: options.onError ?? ((error) => console.error(error)),
    signal: options.signal,
  });
  return html.pipeThrough(injectRSCPayload(forPayload, {
    nonce: options.nonce?.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;"),
  }));
}

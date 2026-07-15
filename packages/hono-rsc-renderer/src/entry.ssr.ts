import { createFromReadableStream } from "@vitejs/plugin-rsc/ssr";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.edge";

const bootstrapScriptContentPromise =
  import.meta.viteRsc.loadBootstrapScriptContent("index");

export interface RenderHtmlOptions {
  nonce?: string;
  onError?: (error: unknown) => void;
  signal?: AbortSignal;
}

export async function renderHtml(
  rscStream: ReadableStream<Uint8Array>,
  options: RenderHtmlOptions = {}
): Promise<ReadableStream<Uint8Array>> {
  const root = await createFromReadableStream<ReactNode>(rscStream, {
    nonce: options.nonce,
  });
  return renderToReadableStream(root, {
    bootstrapScriptContent: await bootstrapScriptContentPromise,
    nonce: options.nonce,
    onError: options.onError ?? ((error) => console.error(error)),
    signal: options.signal,
  });
}

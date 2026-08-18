import type { ReactNode } from "react";

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
  const root = await runtime.createFromReadableStream(rscStream, {
    nonce: options.nonce,
  });
  return runtime.renderToReadableStream(root, {
    bootstrapModules: [clientEntryUrl],
    nonce: options.nonce,
    onError: options.onError ?? ((error) => console.error(error)),
    signal: options.signal,
  });
}

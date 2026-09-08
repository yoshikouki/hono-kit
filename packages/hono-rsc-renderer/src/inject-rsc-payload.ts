/*!
MIT License

Copyright (c) 2024-present Devon Govett

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

// Adapted from rsc-html-stream@0.0.8/server.js. Keep its client wire format.
// Upstream streaming UTF-8 fallback loses buffered bytes on binary chunks.
// Decode each chunk independently until upstream supports byte-exact transport.
const encoder = new TextEncoder();
const trailer = '</body></html>';

export function injectRSCPayload(
  rscStream: ReadableStream<Uint8Array>,
  options?: { nonce?: string }
) {
  const decoder = new TextDecoder();
  let resolveFlightDataPromise: () => void = () => undefined;
  const flightDataPromise = new Promise<void>((resolve) => {
    resolveFlightDataPromise = resolve;
  });
  let startedRSC = false;
  const nonce = options?.nonce;

  // Buffer all HTML chunks enqueued during the current tick of the event loop (roughly)
  // and write them to the output stream all at once. This ensures that we don't generate
  // invalid HTML by injecting RSC in between two partial chunks of HTML.
  const buffered: Uint8Array[] = [];
  let timeout: ReturnType<typeof setTimeout> | null = null;
  function flushBufferedChunks(controller: TransformStreamDefaultController<Uint8Array>) {
    for (const chunk of buffered) {
      let buf = decoder.decode(chunk, {stream: true});
      if (buf.endsWith(trailer)) {
        buf = buf.slice(0, -trailer.length);
      }
      controller.enqueue(encoder.encode(buf));
    }

    let remaining = decoder.decode();
    if (remaining.length) {
      if (remaining.endsWith(trailer)) {
        remaining = remaining.slice(0, -trailer.length);
      }
      controller.enqueue(encoder.encode(remaining));
    }

    buffered.length = 0;
    timeout = null;
  }

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffered.push(chunk);
      if (timeout) {
        return;
      }

      timeout = setTimeout(() => {
        try {
          flushBufferedChunks(controller);
        } catch (e) {
          controller.error(e);
          resolveFlightDataPromise();
          return;
        }
        if (!startedRSC) {
          startedRSC = true;
          writeRSCStream(rscStream, controller, nonce)
            .catch(err => controller.error(err))
            .then(resolveFlightDataPromise);
        }
      }, 0);
    },
    async flush(controller) {
      await flightDataPromise;
      if (timeout) {
        clearTimeout(timeout);
        flushBufferedChunks(controller);
      }
      controller.enqueue(encoder.encode(trailer));
    }
  });
}

async function writeRSCStream(
  rscStream: ReadableStream<Uint8Array>,
  controller: TransformStreamDefaultController<Uint8Array>,
  nonce?: string
) {
  // No streaming decoder state: a partial UTF-8 sequence must fall back with
  // its entire chunk. Preserve BOM bytes too, since Flight may contain binary.
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  for await (const chunk of rscStream) {
    let encoded: string;
    try {
      encoded = JSON.stringify(decoder.decode(chunk));
    } catch {
      // Avoid spreading arbitrary-sized binary chunks onto the call stack.
      let binary = "";
      for (const byte of chunk) {
        binary += String.fromCharCode(byte);
      }
      encoded = `Uint8Array.from(atob(${JSON.stringify(btoa(binary))}), m => m.charCodeAt(0))`;
    }
    writeChunk(encoded, controller, nonce);
  }
}

function writeChunk(chunk: string, controller: TransformStreamDefaultController<Uint8Array>, nonce?: string) {
  controller.enqueue(encoder.encode(`<script${nonce ? ` nonce="${nonce}"` : ""}>${escapeScript(`(self.__FLIGHT_DATA||=[]).push(${chunk})`)}</script>`));
}

// Escape closing script tags and HTML comments in JS content.
// https://www.w3.org/TR/html52/semantics-scripting.html#restrictions-for-contents-of-script-elements
// Avoid replacing </script with <\/script as it would break the following valid JS: 0</script/ (i.e. regexp literal).
// Instead, escape the s character.
function escapeScript(script: string) {
  return script
    .replace(/<!--/g, '<\\!--')
    .replace(/<\/(script)/gi, '</\\$1');
}

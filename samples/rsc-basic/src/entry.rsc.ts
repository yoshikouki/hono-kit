import { Hono } from "hono";
import { createFileRouter } from "@yoshikouki/hono-file-router";
import { rscRenderer } from "@yoshikouki/hono-rsc-renderer";

const routes = createFileRouter({
  sources: [
    {
      files: import.meta.glob("./**/*.tsx", { base: "./routes" }),
      renderer: rscRenderer(),
    },
  ],
});

const app = new Hono();
app.route("/", routes);

export default function handler(
  request: Request
): Response | Promise<Response> {
  return app.fetch(request);
}

if (import.meta.hot) {
  import.meta.hot.accept();
}

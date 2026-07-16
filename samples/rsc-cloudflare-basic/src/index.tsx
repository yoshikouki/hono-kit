import { rscRenderer } from "@yoshikouki/hono-rsc-renderer";
import { Hono } from "hono";

const app = new Hono();

app.get(
  "*",
  rscRenderer(({ children }) => (
    <html lang="en">
      <head>
        <title>RSC on Cloudflare Workers</title>
      </head>
      <body>
        <header>RSC on Cloudflare Workers</header>
        <main>{children}</main>
      </body>
    </html>
  ))
);

app.get("/", (c) => c.render(<h1>Hello from Hono RSC</h1>));

// A Hono instance satisfies the Cloudflare Workers module Worker contract.
export default app;

if (import.meta.hot) {
  import.meta.hot.accept();
}

import { Hono } from "hono";
import { rscRenderer } from "@yoshikouki/hono-rsc-renderer";
import HomePage from "./pages/home";
import UserPage from "./pages/users/[id]";

const app = new Hono();

app.get(
  "*",
  rscRenderer(({ children }) => (
    <html lang="en">
      <head>
        <title>RSC Basic</title>
      </head>
      <body>
        <header>RSC Basic</header>
        <main>{children}</main>
      </body>
    </html>
  ))
);

app.get("/", (c) => c.render(<HomePage />));

app.get("/users/:id", (c) =>
  c.render(<UserPage id={c.req.param("id")} />)
);

export default function handler(
  request: Request
): Response | Promise<Response> {
  return app.fetch(request);
}

if (import.meta.hot) {
  import.meta.hot.accept();
}

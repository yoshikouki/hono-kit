import { Hono } from "hono";
import { rscRenderer } from "@yoshikouki/hono-rsc-renderer";

declare module "@yoshikouki/hono-rsc-renderer" {
  interface RscRenderProps {
    title: string;
  }
}

const app = new Hono();

app.use("*", rscRenderer(({ children, title }) => `${title}:${children}`));
app.get("/valid", (c) => c.render("content", { title: "Required" }));
app.get("/missing", (c) =>
  // @ts-expect-error Required augmented render props cannot be omitted.
  c.render("content")
);
app.get("/empty", (c) =>
  // @ts-expect-error Required augmented render props must be present.
  c.render("content", {})
);

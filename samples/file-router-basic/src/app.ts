import { Hono } from "hono";
import { createFileRouter } from "@yoshikouki/hono-file-router";

export const fileBasedRoutes = createFileRouter({
  base: "./routes",
});

export const app = new Hono();
app.route("/", fileBasedRoutes);

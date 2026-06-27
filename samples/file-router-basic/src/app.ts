import { Hono } from "hono";
import { createFileRouter } from "@yoshikouki/hono-file-router";

export const fileBasedRoutes = createFileRouter({
  sources: [
    {
      files: import.meta.glob("./**/*.ts", {
        base: "./routes",
        eager: true,
      }),
    },
  ],
});

export const app = new Hono();
app.route("/", fileBasedRoutes);

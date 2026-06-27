import { Hono } from "hono";

const route = new Hono();

route.get("/", (c) =>
  c.json({
    section: "guides",
    slug: c.req.param("slug"),
  })
);

export default route;

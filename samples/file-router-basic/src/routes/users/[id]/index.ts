import { Hono } from "hono";

const route = new Hono();

route.get("/", (c) =>
  c.json({
    id: c.req.param("id"),
    name: `User ${c.req.param("id")}`,
  })
);

export default route;

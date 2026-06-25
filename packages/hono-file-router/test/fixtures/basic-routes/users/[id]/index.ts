import { Hono } from "hono";

const route = new Hono();

route.get("/", (c) => c.text(`fixture-user:${c.req.param("id")}`));

export default route;

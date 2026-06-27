import { Hono } from "hono";

const route = new Hono();

route.all("*", (c) => c.text(`User route not found: ${c.req.path}`, 404));

export default route;

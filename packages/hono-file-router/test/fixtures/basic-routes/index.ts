import { Hono } from "hono";

const route = new Hono();

route.get("/", (c) => c.text("fixture-home"));

export default route;

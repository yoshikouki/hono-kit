import { Hono } from "hono";
import UserPage from "../_components/user-page";

const route = new Hono();

route.get("/", (c) => c.render(<UserPage id={c.req.param("id") ?? ""} />));

export default route;

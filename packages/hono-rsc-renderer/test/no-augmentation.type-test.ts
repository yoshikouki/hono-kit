import { Hono } from "hono";
import "@yoshikouki/hono-rsc-renderer";

const app = new Hono();
const unknownProps = { titel: "Typo" };

app.get("/without-props", (c) => c.render("content"));
app.get("/empty-props", (c) => c.render("content", {}));
app.get("/unknown-literal", (c) =>
  // @ts-expect-error Unaugmented render props reject unknown object literals.
  c.render("content", { titel: "Typo" })
);
app.get("/unknown-variable", (c) =>
  // @ts-expect-error Unaugmented render props reject variables with unknown keys.
  c.render("content", unknownProps)
);
app.get("/string-primitive", (c) =>
  // @ts-expect-error Render props must not be a string primitive.
  c.render("content", "invalid")
);
app.get("/number-primitive", (c) =>
  // @ts-expect-error Render props must not be a number primitive.
  c.render("content", 1)
);
app.get("/boolean-primitive", (c) =>
  // @ts-expect-error Render props must not be a boolean primitive.
  c.render("content", true)
);

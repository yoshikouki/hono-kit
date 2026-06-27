# mdx-file-router-basic

Markdown and MDX file-router integration sample for
`@yoshikouki/hono-mdx-renderer`.

The sample passes explicit route loaders with the same shape as Vite's
`import.meta.glob` output and customizes `renderMarkdown` / `renderMdx` so the
package stays out of application presentation policy. Applications can replace
the explicit loaders with:

```ts
import.meta.glob("./**/*.md", {
  base: "./routes",
  query: "?raw",
  import: "default",
});
import.meta.glob("./**/*.mdx", { base: "./routes" });
```

```sh
bun run test
```

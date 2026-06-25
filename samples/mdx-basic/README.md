# mdx-basic

Markdown and MDX consumer sample for `@yoshikouki/hono-mdx-renderer`.

The sample passes explicit loaders with the same shape as Vite's
`import.meta.glob` output. Applications can replace those loaders with
`import.meta.glob("./routes/**/*.md", { query: "?raw", import: "default" })`
and `import.meta.glob("./routes/**/*.mdx")`.

```sh
bun run test
```

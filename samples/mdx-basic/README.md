# mdx-basic

Markdown and MDX Hono route-handler sample for
`@yoshikouki/hono-mdx-renderer`.

The sample registers ordinary Hono routes:

```ts
app.get("/docs/readme", mdRenderer(loadMarkdown));
app.get("/docs/readme.md", rawMarkdownRenderer(loadMarkdown));
app.get("/docs/guide", mdxRenderer(loadMdx));
```

The package does not discover files or compile MDX. Applications can provide
explicit loaders, `import.meta.glob` results, or build-tool-specific imports at
the app edge.

```sh
bun run test
```

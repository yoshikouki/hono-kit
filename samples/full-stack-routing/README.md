# full-stack-routing

Integrated routing sample that combines Hono route modules, Vite RSC middleware,
Markdown content, and MDX-like compiled content in one Hono app.

The test runs `vite build`, imports the built RSC handler from `dist/rsc`, and
checks API routes, HTML routes, same-path Flight responses, raw Markdown
generated routes, and MDX-rendered content routes.

```sh
bun run test
```

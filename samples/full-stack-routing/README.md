# full-stack-routing

Integrated file-router sample that combines Hono route modules, Vite RSC pages,
Markdown content, and MDX-like compiled content in one router.

The test runs `vite build`, imports the built RSC handler from `dist/rsc`, and
checks API routes, HTML routes, `/__rsc` Flight routes, raw Markdown generated
routes, and MDX-rendered content routes.

```sh
bun run test
```

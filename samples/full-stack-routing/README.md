# full-stack-routing

Integrated routing sample that combines file-routed Hono route modules, Vite RSC
middleware, Markdown content, and MDX-like compiled content in one Hono app.

Both `.ts` API routes and `.tsx` RSC page routes are Hono route modules mounted
through `@yoshikouki/hono-file-router`. The sample types its eager glob as
`HonoRouteSource`, and every file-routed child app registers only the exact
child path `/`. RSC routes therefore inherit the parent `rscRenderer()`
middleware and can call `c.render()`. Route-local page components live under
`src/routes/_components/`, which this sample excludes with the route source
`ignore` option so they can stay colocated with routes without becoming routes
themselves.

The test runs `vite build`, imports the built RSC handler from `dist/rsc`, and
checks API routes, file-routed HTML routes, same-path Flight responses, explicit
raw Markdown routes, MDX-rendered content routes, and `_components` ignore
behavior.

```sh
bun run test
```

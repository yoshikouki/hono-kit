# full-stack-routing

Integrated routing sample that combines file-routed Hono route modules, Vite RSC
middleware, and standard Markdown/MDX modules in one Hono app.

Both `.ts` API routes and `.tsx` RSC page routes are Hono route modules mounted
through `@yoshikouki/hono-file-router`. The sample types its eager glob as
`HonoRouteSource`, and every file-routed child app registers only the exact
child path `/`. RSC routes therefore inherit the parent `rscRenderer()`
middleware and can call `c.render()`. Route-local page components live under
`src/routes/_components/`, which this sample excludes with the route source
`ignore` option so they can stay colocated with routes without becoming routes
themselves.

Markdown and MDX are compiled by `@mdx-js/rollup`. `remark-frontmatter` and
`remark-mdx-frontmatter` expose parsed YAML as a `frontmatter` named export. The
Hono routes pass the compiled document components directly to `c.render()`, so
`@yoshikouki/hono-rsc-renderer` remains the only HTML/Flight response owner.
Raw Markdown uses Vite's explicit `?raw` import and an ordinary Hono response.
The Vite config skips the MDX transform for `?raw` module IDs because the
upstream Rollup plugin otherwise strips the query before filtering extensions.
MDX-authored ESM exports and JSX expressions render as ordinary server content,
and Vite propagates `.md` and `.mdx` edits through the existing RSC HMR path.

The test runs `vite build`, imports the built RSC handler from `dist/rsc`, and
checks API routes, file-routed HTML routes, same-path Flight responses, explicit
raw Markdown routes, standard MDX-rendered content routes, frontmatter exports,
and `_components` ignore behavior.

```sh
bun run test
```

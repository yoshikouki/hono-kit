# @yoshikouki/hono-rsc-renderer

React Server Components renderer integration for Hono file routes.

This package provides an RSC renderer, generated `text/x-component` routes,
and reusable Vite RSC SSR/browser entries for Hono file routes.

The renderer is verified by `samples/rsc-basic`, which runs `vite build` and
checks the built RSC handler's HTML and `/__rsc` Flight responses.

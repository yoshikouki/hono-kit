# rsc-vite-basic

Vite RSC middleware sample for `@yoshikouki/hono-rsc-renderer`.

The test runs `vite build`, imports the built RSC handler from `dist/rsc`, and
checks both HTML responses and same-path Flight responses selected by RSC
request headers.

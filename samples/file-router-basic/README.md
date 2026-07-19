# file-router-basic

Basic consumer sample for `@yoshikouki/hono-file-router`.

The sample uses `createFileRouter({ sources })` with an eager
`import.meta.glob<HonoRouteSource>(...)`. Each route file under `src/routes`
default exports a Hono router whose route entries use the exact child path `/`:

- `src/routes/index.ts` maps to `/`.
- `src/routes/users/[id]/index.ts` maps to `/users/:id`.
- `src/routes/users/[id]/posts/[postId].ts` maps to
  `/users/:id/posts/:postId`.
- `src/routes/api/ping.ts` maps to `/api/ping`; the endpoint has its own route
  file instead of being nested inside an `api.ts` child app.
- `src/routes/docs/(guides)/[...slug].ts` proves route groups are omitted from
  URLs while catch-all params still reach Hono.

```sh
bun run test
```

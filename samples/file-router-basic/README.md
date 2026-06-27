# file-router-basic

Basic consumer sample for `@yoshikouki/hono-file-router`.

The sample uses `createFileRouter({ sources })` with `import.meta.glob`.
Each route file under `src/routes` default exports a Hono router:

- `src/routes/index.ts` maps to `/`.
- `src/routes/users/[id]/index.ts` maps to `/users/:id`.
- `src/routes/users/[id]/posts/[postId].ts` maps to
  `/users/:id/posts/:postId`.
- `src/routes/docs/(guides)/[...slug].ts` proves route groups are omitted from
  URLs while catch-all params still reach Hono.

```sh
bun run test
```

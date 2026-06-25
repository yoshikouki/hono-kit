# file-router-basic

Basic consumer sample for `@yoshikouki/hono-file-router`.

The sample uses `createFileRouter({ sources })` with an explicit module map.
Each route file under `src/routes` default exports a Hono router.

```sh
bun run test
```

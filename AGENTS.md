<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Local app verification rules

- The local application runs as the Cloudflare Worker with a disposable local D1 database on `http://127.0.0.1:3001`.
- For verification, use `npm run test:e2e:d1`; it builds the Worker artifact, applies local D1 migrations, generates the bootstrap SQL, and runs the Worker E2E suite.
- If the browser shows an older interface, stop the current Wrangler/Vite process, rerun the D1 build/test command, and hard-refresh the browser. Confirm the browser is on port `3001`.
- Never print the contents of `.env` or expose its secrets in command output. Do not target the deployed D1 database from local tests.

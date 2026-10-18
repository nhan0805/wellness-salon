<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Deployment and documentation rules

- All deployments must go through Git. Before deploying, commit the intended changes, push them to the configured remote, and deploy from an identifiable Git commit or branch using the project's Git-based deployment workflow. Never deploy directly from an uncommitted local working tree or by manually uploading local files.
- Before any deployment, verify that the working tree is clean and that the deployed revision matches the intended Git commit. If the repository is not available as a Git repository or the changes cannot be pushed to the configured remote, stop and ask for direction instead of deploying another way.
- When changing code, configuration, database/schema, UI, API behavior, or deployment behavior, identify and update all affected documentation in the same change, including `README.md`, relevant files under `docs/`, setup/deployment instructions, environment-variable references, and changelogs where applicable. If no documentation needs updating, explicitly verify that before finishing.

## Local app verification rules

- The local application runs as the Cloudflare Worker with a disposable local D1 database on `http://127.0.0.1:3001`.
- For verification, use `npm run test:e2e:d1`; it builds the Worker artifact, applies local D1 migrations, generates the bootstrap SQL, and runs the Worker E2E suite.
- If the browser shows an older interface, stop the current Wrangler/Vite process, rerun the D1 build/test command, and hard-refresh the browser. Confirm the browser is on port `3001`.
- Never print the contents of `.env` or expose its secrets in command output. Do not target the deployed D1 database from local tests.

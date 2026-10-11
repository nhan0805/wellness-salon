<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Local app verification rules

- When the user is viewing `http://localhost:3000`, first check whether Docker is serving the app before assuming a browser refresh will show source changes. The repository's Docker setup runs a production image with `node server.js`, so UI and server changes require a rebuild.
- For Docker-based verification, load the repository `.env` explicitly because `docker/docker-compose.yml` requires those variables:
  `docker compose --env-file .env -f docker/docker-compose.yml up -d --build app`
- After rebuilding, verify the container is healthy with `docker compose --env-file .env -f docker/docker-compose.yml ps` and `curl -fsS http://127.0.0.1:3000/api/health`. If the change is UI-specific, also confirm the generated bundle contains a distinctive selector, label, or implementation marker before reporting that the change is live.
- Only then reload the browser. If the browser still shows an older interface, use a hard refresh and verify that the browser is on the expected host and port. Do not conclude that the implementation failed until the running container and its generated assets have been checked.
- Recreating the app container can invalidate an existing Auth.js session cookie. If the browser is redirected to `/admin/sign-in` after a rebuild, tell the user to log in again; never enter credentials unless the user explicitly authorizes it. Do not delete Docker volumes or reset the database as part of this troubleshooting.
- Never print the contents of `.env` or expose its secrets in command output. Keep database volumes intact unless the user explicitly requests a destructive reset.

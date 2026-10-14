<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:drizzle-dev-rules -->

## Database (Drizzle + Neon, dev mode)

Schema changes go live with `pnpm run db:push` (Drizzle Kit `push` against `DATABASE_URL_UNPOOLED`). This project is in development with no backwards-compat needs, so no migration files are kept — `db:generate` / `db:migrate` and the `drizzle/` folder are not used.

Secrets are injected by Infisical — there is no `.env` / `.env.local` in the repo. Always run DB commands through Infisical (default env is `dev`):

```bash
infisical run --env=dev -- pnpm run db:push    # push schema to the remote Neon DB
infisical run --env=dev -- pnpm run db:studio  # local studio against the remote DB
```

- Check Infisical login with `infisical profile list` (CLI ≥ 0.43 has no `auth` / `environments` subcommands).
- `drizzle-kit push` is non-interactive for additive changes; destructive diffs prompt.
- Verify a push by reading `information_schema` / `pg_indexes` through `infisical run --env=dev -- node <script>` using the `pg` client from `node_modules` — never print the connection URL.

<!-- END:drizzle-dev-rules -->

<!-- TRIGGER.DEV SKILLS START -->
## Trigger.dev agent skills

This project has Trigger.dev agent skills installed in `.agents/skills/`. Before writing or changing Trigger.dev code (background tasks, scheduled tasks, realtime, or chat.agent AI agents), load the most relevant skill: `trigger-authoring-chat-agent`, `trigger-authoring-tasks`, `trigger-chat-agent-advanced`, `trigger-cost-savings`, `trigger-getting-started`, `trigger-realtime-and-frontend`.
<!-- TRIGGER.DEV SKILLS END -->

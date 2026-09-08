<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:drizzle-dev-rules -->

## Database (Drizzle + Neon, dev mode)

Schema changes go live with `bun run db:push` (Drizzle Kit `push` against `DATABASE_URL_UNPOOLED`). This project is in development with no backwards-compat needs, so no migration files are kept — `db:generate` / `db:migrate` and the `drizzle/` folder are not used.

<!-- END:drizzle-dev-rules -->

# Game-builder

> Build playable 3D games from plain English. AI-powered game builder with streaming chat, multi-tenant orgs, and instant Neon Postgres persistence.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Clerk](https://img.shields.io/badge/Auth-Clerk-6C47FF)](https://clerk.com/)
[![Neon Postgres](https://img.shields.io/badge/Postgres-Neon-00E599)](https://neon.com/)
[![Drizzle ORM](https://img.shields.io/badge/ORM-Drizzle-C5F74F)](https://orm.drizzle.team/)

## What is this?

**Game-builder** is a web app where you describe the game you want — _"a sunny kingdom platformer"_, _"a fight-first shooter"_, _"a voxel survival"_ — and it scaffolds a playable game session around that prompt.

The current flow is simple and fast:

1. You land on the home composer and type what you want to build.
2. A Server Action creates a `game` row scoped to your Clerk organization.
3. You are routed to `/games/[id]` with your prompt attached as the first message.
4. A streaming AI thread (`/api/chat`) continues the conversation and drives the build.

Auth, data isolation, streaming, and UI are production-shaped from day one: Clerk Organizations for multi-tenancy, Neon Postgres + Drizzle for persistence, Vercel AI SDK for streaming chat, and shadcn/ui + Tailwind for the interface.

## Features

- **Prompt-to-game composer** — one input creates a game and opens its session (`components/create-game-composer.tsx`).
- **Streaming AI thread** — chat UI wired to `POST /api/chat` with `streamText` + `toUIMessageStream` (30s max duration).
- **Multi-tenant by default** — every game belongs to a Clerk `orgId`; creation without an org is rejected.
- **Org-scoped queries** — games are read newest-first per org, backed by a composite index on `(org_id, created_at)`.
- **Curated suggestions** — one-click starters (voxel survival, samurai duel, platformer, shooter…) from `lib/games/suggestions.ts`.
- **Modern UI kit** — shadcn/ui, Base UI, Tailwind CSS 4, `next-themes` dark mode, Lucide icons, cmdk, resizable panels.
- **Type-safe env** — Zod-validated server env with fail-fast errors (`lib/env.ts`, server-only).
- **Drizzle dev workflow** — schema-first Postgres with `drizzle-kit push`, no migration files in dev.

## Tech stack

| Layer      | Technology                                                |
| ---------- | --------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Server Actions, Route Handlers)   |
| UI         | React 19, Tailwind CSS 4, shadcn/ui, Base UI, next-themes |
| Auth       | Clerk (`@clerk/nextjs`, Organizations)                    |
| Database   | Neon Postgres (`@neondatabase/serverless`, `pg`)          |
| ORM        | Drizzle ORM + Drizzle Kit                                 |
| AI         | Vercel AI SDK (`ai`, `@ai-sdk/react`), AI Gateway models  |
| Validation | Zod                                                       |
| Charts     | Recharts                                                  |
| Language   | TypeScript (strict)                                       |
| Tooling    | Bun, ESLint, Prettier, tsx                                |

## How it works

```text
User prompt
  → createGame() Server Action (lib/games/actions.ts) seeds first user message
  → INSERT INTO games (org_id, title, messages) — org-scoped, messages[0] is the prompt
  → redirect /games/[id] (no ?message=)
  → ChatThread hydrates from game.messages (initialMessages)
  → auto-regenerate assistant reply when thread is exactly one user message
  → POST /api/chat streams model response (AI Gateway)
```

Key files:

| Path                            | Role                                    |
| ------------------------------- | --------------------------------------- |
| `app/(app)/page.tsx`            | Landing composer + suggestions          |
| `app/(app)/games/[id]/page.tsx` | Game session view                       |
| `app/api/chat/route.ts`         | Streaming chat endpoint (auth-guarded)  |
| `lib/games/actions.ts`          | `createGame` Server Action              |
| `lib/games/queries.ts`          | Org-scoped game reads                   |
| `lib/games/suggestions.ts`      | Curated prompt starters                 |
| `db/schema.ts`                  | `games` table definition                |
| `lib/db.ts`                     | Drizzle client                          |
| `lib/env.ts`                    | Validated server env (Zod, server-only) |
| `components/chat-composer.tsx`  | Chat input                              |
| `components/chat-thread.tsx`    | Streaming thread UI                     |
| `proxy.ts`                      | Clerk route protection                  |

### Data model

```ts
// db/schema.ts
games {
  id         uuid PK default random()
  orgId      text  // Clerk org id, not a FK
  title      text  // max 120 chars (enforced in action)
  createdAt  timestamptz default now()
  updatedAt  timestamptz default now() on update
}
// index: games_org_id_created_at_idx on (org_id, created_at desc)
```

## Getting started

### Prerequisites

- Bun (or Node 20+ with npm/pnpm)
- A Neon Postgres database
- A Clerk application with Organizations enabled
- A Gemini API key from Google AI Studio (used for `/api/chat` streaming and title generation via `@ai-sdk/google`)

### 1. Install

```bash
bun install
# or: npm install
```

### 2. Configure environment

Copy the required keys into `.env.local`:

```bash
# Clerk — https://dashboard.clerk.com
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Optional custom auth routes (already wired with Clerk defaults as fallback)
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/

# Neon Database
DATABASE_URL=postgresql://...        # pooled URL (app runtime)
DATABASE_URL_UNPOOLED=postgresql://... # direct URL (drizzle-kit push)

# Gemini — https://aistudio.google.com/apikey
# Two separate models via @ai-sdk/google (lib/ai.ts: getTitleModel / getChatModel)
GEMINI_API_KEY=AIza...                  # from Google AI Studio
GEMINI_TITLE_MODEL=gemini-3.5-flash-lite # cheapest/fastest — title generation
GEMINI_CHAT_MODEL=gemini-3.8-flash       # newest flash — chat responses
```

> `lib/env.ts` validates these eagerly at import time. A missing or malformed key throws a named error instead of failing silently later.

### 3. Push the schema (dev mode)

This project uses Drizzle `push` in development — no migration files:

```bash
bun run db:push
```

Optional visual explorer:

```bash
bun run db:studio
```

### 4. Run

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in, select or create an organization, and type what you want to build.

## Scripts

| Command             | What it does                                       |
| ------------------- | -------------------------------------------------- |
| `bun run dev`       | Start Next.js dev server                           |
| `bun run build`     | Production build                                   |
| `bun run start`     | Serve production build                             |
| `bun run lint`      | ESLint                                             |
| `bun run typecheck` | `tsc --noEmit`                                     |
| `bun run format`    | Prettier write on `ts/tsx`                         |
| `bun run db:push`   | `drizzle-kit push` against `DATABASE_URL_UNPOOLED` |
| `bun run db:studio` | Open Drizzle Studio                                |

## Project structure

```text
app/
  (app)/page.tsx            # home composer
  (app)/games/[id]/page.tsx # game session
  (app)/layout.tsx          # authed layout
  api/chat/route.ts         # streaming endpoint
  sign-in/ sign-up/         # Clerk routes
  layout.tsx                # root layout + providers
  globals.css
components/
  create-game-composer.tsx  # landing prompt → createGame
  chat-composer.tsx         # message input
  chat-thread.tsx           # streaming thread
  app-sidebar.tsx
  ui/                       # shadcn/ui primitives
db/schema.ts                # games table
lib/
  db.ts                     # drizzle client
  env.ts                    # validated env
  games/actions.ts          # server actions
  games/queries.ts          # reads
  games/suggestions.ts      # starters
drizzle.config.ts
proxy.ts                    # auth middleware
```

## Roadmap

- [ ] Persist chat messages per game (currently only games are stored)
- [ ] Render a real-time playable preview (Three.js viewport)
- [ ] Game listing / library page per org
- [ ] Rename, duplicate, and delete games
- [ ] Per-game model settings and system prompt
- [ ] Usage limits and rate limiting on `/api/chat`
- [ ] E2E tests for create → stream flow

## Contributing

Issues and PRs are welcome. Keep changes small and scoped:

1. Fork and branch from `main`.
2. Run `bun run typecheck` and `bun run lint` before pushing.
3. Describe the problem, the fix, and how you verified it.

## License

Private project — all rights reserved unless a `LICENSE` file is added.

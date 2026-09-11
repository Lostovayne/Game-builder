import "server-only"

import { parseEnv } from "@neon/env"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import neonConfig from "@/neon"

// Validate env first so a missing/malformed variable fails here with a clear
// message (see lib/env.ts) instead of a cryptic error deep inside the driver.
import "@/lib/env"

import * as schema from "@/db/schema"

// Pooled connection (PgBouncer) — the right one for request traffic.
const { postgres } = parseEnv(neonConfig, ["DATABASE_URL"])

// SAFETY: globalThis has no typed `pool` slot; we own this key exclusively in
// this process, and the cached value is only ever the Pool created below, so
// the cast cannot observe a foreign type.
// Reuse the pool across hot reloads in dev so we don't exhaust connections.
const globalForDb = globalThis as unknown as { pool?: Pool }

// pg v9 will reinterpret `sslmode=require` with weaker libpq semantics. Pin
// `verify-full` to keep the current strict behavior and silence the
// SECURITY WARNING pg-connection-string emits on every Pool creation.
const connectionString = postgres.databaseUrl.replace(
  /([?&])sslmode=require(&|$)/,
  "$1sslmode=verify-full$2"
)

const pool = globalForDb.pool ?? new Pool({ connectionString })

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool
}

export const db = drizzle(pool, { schema })

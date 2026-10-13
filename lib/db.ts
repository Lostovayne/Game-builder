import "server-only"

import { parseEnv } from "@neon/env"
import * as Sentry from "@sentry/node"
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

// An idle pooled client can die under it (Postgres restart, network drop,
// idle timeout). pg surfaces that as an `error` event on the pool; with no
// listener Node treats it as an uncaught exception and kills the process.
// Log it as a structured error and let the pool replace the dead client.
if (!globalForDb.pool) {
  pool.on("error", (error: Error) => {
    Sentry.logger.error("Database pool idle client error", {
      error_name: error.name,
      error_message: error.message,
    })
  })
}

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool
}

export const db = drizzle(pool, { schema })

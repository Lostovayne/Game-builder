import { sql } from "drizzle-orm"
import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import type { UIMessage } from "ai"

export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Clerk organization id (`auth().orgId`), not a foreign key.
    orgId: text("org_id").notNull(),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`)
      .$onUpdate(() => new Date()),
    messages: jsonb("messages")
      .$type<UIMessage[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    lastEventId: text("last_event_id"),
    // Daytona sandbox provisioned on the game's first chat message. Null
    // until then; set once and reused for the game's lifetime.
    sandboxId: text("sandbox_id"),
    // Opaque runtime record (compaction summary, injected context). Written
    // by the transcript storage's `save`, read back by its `load`.
    transcriptState: jsonb("transcript_state").$type<unknown>(),
    // Resume cursor for the input stream. `last_event_id` carries the output
    // cursor the page uses to resubscribe. Both are runtime-computed and
    // stored opaquely — never interpreted here.
    lastInEventId: text("last_in_event_id"),
  },
  (table) => [
    // Games are always read scoped to an org, usually newest first. The
    // leading org_id also serves plain `where org_id = ?` lookups.
    index("games_org_id_created_at_idx").on(
      table.orgId,
      table.createdAt.desc()
    ),
  ]
)

// Append-only credit ledger. Schema only — nothing reads or writes it yet.
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Clerk organization id, not a foreign key (same as `games.org_id`).
    orgId: text("org_id").notNull(),
    // Idempotency/purpose key, e.g. `step:<responseId>`.
    entryKey: text("entry_key").notNull(),
    // Billionths of a dollar; negative debits, positive credits. `bigint`
    // mode keeps full int64 precision (a JS number would silently lose
    // precision above 2^53 ≈ $9M in these units).
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    // One row per (org, entry_key): re-recording the same event is a no-op.
    unique("credit_ledger_org_id_entry_key_unique").on(
      table.orgId,
      table.entryKey
    ),
  ]
)

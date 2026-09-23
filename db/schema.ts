import { sql } from "drizzle-orm"
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
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

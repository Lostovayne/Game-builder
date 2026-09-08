import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core"

export const demoUsers = pgTable("demo_users", {
  id: serial("id").primaryKey(),
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

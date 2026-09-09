import "server-only"

import { auth } from "@clerk/nextjs/server"
import { desc, eq } from "drizzle-orm"
import { cache } from "react"

import { games } from "@/db/schema"
import { db } from "@/lib/db"

export const listGames = cache(async () => {
  const { orgId } = await auth()

  if (!orgId) {
    return []
  }

  return db
    .select({ id: games.id, title: games.title })
    .from(games)
    .where(eq(games.orgId, orgId))
    .orderBy(desc(games.createdAt))
})

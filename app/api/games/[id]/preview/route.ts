import "server-only"

import { auth } from "@clerk/nextjs/server"
import { and, eq } from "drizzle-orm"

import { GAME_PREVIEW_PORT, startGameServer } from "@/lib/daytona/utils"
import { games } from "@/db/schema"
import { db } from "@/lib/db"

// Signed preview URLs stay valid for one hour: long enough to be useful in a
// browser session, short enough to limit exposure of any single link.
const PREVIEW_URL_TTL_SECONDS = 3600

/**
 * Returns a short-lived signed preview URL for the game's persisted Daytona
 * sandbox. The caller must be authenticated and the game must belong to the
 * caller's organization; the org-scoped lookup resolves ownership before any
 * Daytona access. The persisted sandbox is reused (its preview server started
 * or reused), never created. Only the signed URL is exposed — the standard
 * preview token and internal Daytona errors never leave the server.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const rows = await db
    .select({ sandboxId: games.sandboxId })
    .from(games)
    .where(and(eq(games.id, id), eq(games.orgId, orgId)))
    .limit(1)

  const sandboxId = rows[0]?.sandboxId
  if (!sandboxId) {
    return Response.json(
      { error: "No preview available for this game" },
      { status: 404 }
    )
  }

  try {
    const { sandbox } = await startGameServer(sandboxId)
    const signed = await sandbox.getSignedPreviewUrl(
      GAME_PREVIEW_PORT,
      PREVIEW_URL_TTL_SECONDS
    )

    return Response.json({ url: signed.url })
  } catch (error) {
    console.error(
      `Preview URL generation failed for game ${id}:`,
      error instanceof Error ? error.message : error
    )
    return Response.json(
      { error: "Failed to generate preview URL" },
      { status: 502 }
    )
  }
}

import "server-only"

import { eq } from "drizzle-orm"

import { games } from "@/db/schema"
import { db } from "@/lib/db"
import { daytona } from "@/lib/daytona/client"

// Directory and entrypoint the game runtime serves from inside the sandbox.
const GAME_SANDBOX_DIR = "/home/daytona/game"
const GAME_SANDBOX_FILE = `${GAME_SANDBOX_DIR}/index.html`
const GAME_SANDBOX_FILE_MODE = "755"
const GAME_STARTER_CONTENT = "New Game"

/**
 * Provisions (at most once) the Daytona sandbox bound to a game, seeds the
 * starter game file, and returns the sandbox id.
 *
 * Idempotent: a game that already has a saved `sandboxId` returns it without
 * touching Daytona or reseeding. A missing game is rejected before any
 * external call. The sandbox id is persisted only after the game folder and
 * starter file are in place, so any external failure propagates without
 * saving a bogus id.
 */
export async function createGameSandbox(gameId: string): Promise<string> {
  const rows = await db
    .select({ id: games.id, sandboxId: games.sandboxId })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1)

  const game = rows[0]
  if (!game) {
    throw new Error(`Game ${gameId} not found`)
  }

  if (game.sandboxId) {
    return game.sandboxId
  }

  const sandbox = await daytona.create({ labels: { gameId } })
  const sandboxId = sandbox?.id
  if (!sandboxId) {
    throw new Error("Daytona did not return a sandbox id")
  }

  await sandbox.fs.createFolder(GAME_SANDBOX_DIR, GAME_SANDBOX_FILE_MODE)
  await sandbox.fs.uploadFile(
    Buffer.from(GAME_STARTER_CONTENT),
    GAME_SANDBOX_FILE
  )

  await db.update(games).set({ sandboxId }).where(eq(games.id, gameId))

  return sandboxId
}

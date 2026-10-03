import "server-only"

import type { Sandbox } from "@daytona/sdk"

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
 * Fixed port the game preview HTTP server listens on inside the sandbox.
 * Exported so downstream API tasks can build preview URLs against it.
 */
export const GAME_PREVIEW_PORT = 8000

const GAME_HEALTH_CHECK_TIMEOUT_SECONDS = 10
const GAME_START_TIMEOUT_SECONDS = 60
const GAME_HEALTH_POLL_INTERVAL_MS = 500
const GAME_HEALTH_POLL_ATTEMPTS = 20
const GAME_PREVIEW_SESSION_ID = "game-preview"

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Probes the fixed preview port from inside the sandbox. Returns true only
 * when something is serving HTTP 200 on the game preview port.
 */
async function isPreviewPortHealthy(sandbox: {
  process: {
    executeCommand(
      command: string,
      cwd?: string,
      env?: Record<string, string>,
      timeout?: number
    ): Promise<{ exitCode: number; result: string }>
  }
}): Promise<boolean> {
  const response = await sandbox.process.executeCommand(
    `curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:${GAME_PREVIEW_PORT}/`,
    undefined,
    undefined,
    GAME_HEALTH_CHECK_TIMEOUT_SECONDS
  )

  return response.exitCode === 0 && response.result.trim() === "200"
}

/**
 * Ensures a static HTTP server for the seeded game directory is running on
 * the fixed preview port of the existing sandbox, and that the sandbox
 * itself is running.
 *
 * Never creates a sandbox: the sandbox is always retrieved by the persisted
 * id and started only when it is stopped. The preview port is health-checked
 * first; a healthy server is reused without launching any process. An
 * unhealthy port gets a persistent static server (background session) serving
 * `/home/daytona/game`, then health is polled until it responds or startup
 * fails.
 *
 * Idempotent for normal sequential calls: once the server is healthy,
 * subsequent calls return without launching anything.
 *
 * Resolves `{ sandbox }` with the started or reused instance so callers can
 * mint preview URLs from it without a second retrieval.
 */
export async function startGameServer(
  sandboxId: string
): Promise<{ sandbox: Sandbox }> {
  const sandbox = await daytona.get(sandboxId)

  if (sandbox.state !== "started") {
    await sandbox.start(GAME_START_TIMEOUT_SECONDS)
  }

  if (await isPreviewPortHealthy(sandbox)) {
    return { sandbox }
  }

  // A previous run's session may linger after its server died; the Daytona
  // session API has no upsert, so tolerate the already-exists error and
  // proceed to launch into the existing session.
  try {
    await sandbox.process.createSession(GAME_PREVIEW_SESSION_ID)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/already exist/i.test(message)) {
      throw error
    }
  }

  await sandbox.process.executeSessionCommand(
    GAME_PREVIEW_SESSION_ID,
    {
      command: `cd ${GAME_SANDBOX_DIR} && python3 -m http.server ${GAME_PREVIEW_PORT} --bind 0.0.0.0`,
      runAsync: true,
    },
    GAME_START_TIMEOUT_SECONDS
  )

  for (let attempt = 0; attempt < GAME_HEALTH_POLL_ATTEMPTS; attempt++) {
    if (await isPreviewPortHealthy(sandbox)) {
      return { sandbox }
    }
    await sleep(GAME_HEALTH_POLL_INTERVAL_MS)
  }

  throw new Error(
    `Game preview server did not become healthy on port ${GAME_PREVIEW_PORT} for sandbox ${sandboxId}`
  )
}

/**
 * Provisions (at most once) the Daytona sandbox bound to a game, seeds the
 * starter game file, and resolves `{ sandbox }` with a live instance.
 *
 * Idempotent: a game that already has a saved `sandboxId` skips creation and
 * seeding, resolving that persisted id instead — one Daytona lookup, never a
 * second sandbox. A missing game is rejected before any external call. The
 * sandbox id is persisted only after the game folder and starter file are in
 * place, so any external failure propagates without saving a bogus id.
 *
 * Every sandbox-facing helper resolves `{ sandbox }` so callers destructure
 * the same shape regardless of the entry point they used.
 */
export async function createGameSandbox(
  gameId: string
): Promise<{ sandbox: Sandbox }> {
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
    return { sandbox: await daytona.get(game.sandboxId) }
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

  return { sandbox }
}

/**
 * Resolves `{ sandbox }` with a guaranteed, running sandbox instance for a
 * game: the game's sandbox exists (provisioned at most once) and is started
 * before it is handed back.
 *
 * This is the entry point chat tools should use — once it resolves, callers
 * can execute commands, read/write files, or mint preview URLs without any
 * further Daytona bookkeeping.
 *
 * Deliberately does *not* boot the game's HTTP preview server; that is
 * `startGameServer`'s job, so a tool call never pays for a health-check round
 * trip it does not need.
 */
export async function getGameSandbox(
  gameId: string
): Promise<{ sandbox: Sandbox }> {
  const { sandbox } = await createGameSandbox(gameId)

  if (sandbox.state !== "started") {
    await sandbox.start(GAME_START_TIMEOUT_SECONDS)
  }

  return { sandbox }
}

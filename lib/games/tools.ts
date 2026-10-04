import { posix } from "node:path"

import type { Sandbox } from "@daytona/sdk"
import { tool } from "ai"
import { z } from "zod"

import { GAME_DIR } from "@/lib/daytona/constants"

/**
 * Cap on what `read_file` returns in one call. Above it the content is cut at
 * this many characters and `truncated` says so, so a huge file cannot flood the
 * model's context — the caller edits by anchor (`replace_text`) instead of
 * reading the whole thing back.
 */
export const MAX_READ_CHARS = 100_000

type PathResult = { ok: true; path: string } | { ok: false; error: string }

/**
 * Resolves a tool-supplied path against the game directory and proves the
 * result is still inside it. This is the confinement boundary: every path any
 * tool sends to the sandbox passes through here, so `..`, an absolute path
 * elsewhere, or a null byte can never reach outside `${GAME_DIR}`.
 *
 * Paths are resolved with POSIX rules regardless of the host, because the
 * sandbox is Linux. The check is pure and runs before the sandbox is touched,
 * so a rejected path costs nothing — no lookup, no sandbox start.
 */
function resolveGamePath(input: string): PathResult {
  if (input.includes("\0")) {
    return { ok: false, error: "A path cannot contain null bytes." }
  }

  const absolute = posix.resolve(GAME_DIR, input)
  if (absolute !== GAME_DIR && !absolute.startsWith(`${GAME_DIR}/`)) {
    return {
      ok: false,
      error: `Path "${input}" is outside the game directory (${GAME_DIR}). Every tool path must stay inside it.`,
    }
  }

  return { ok: true, path: absolute }
}

/**
 * Same as {@link resolveGamePath}, additionally rejecting the game directory
 * itself: file operations need a file, and only `list_files` may target the
 * root.
 */
function resolveFilePath(input: string): PathResult {
  const resolved = resolveGamePath(input)
  if (!resolved.ok) return resolved
  if (resolved.path === GAME_DIR) {
    return {
      ok: false,
      error: `Path "${input}" is the game directory itself, not a file.`,
    }
  }
  return resolved
}

/** The path a tool reports back: always relative to the game directory. */
function relativeToGame(absolute: string): string {
  return posix.relative(GAME_DIR, absolute)
}

/** Converts a sandbox failure into the same `{ ok: false, error }` shape. */
function failure(error: unknown): { ok: false; error: string } {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }
}

/**
 * Resolves the game's sandbox and runs `run` against it. Resolved lazily per
 * call: `@/lib/daytona/utils` transitively reads server-only env at module
 * scope, and importing it statically would drag that side effect into
 * `trigger/chat.ts` and every consumer of this module. `getGameSandbox`
 * provisions the sandbox at most once and starts it if it is stopped, so this
 * is only ever reached with a path that already passed confinement.
 */
async function withGameSandbox<T>(
  gameId: string,
  run: (sandbox: Sandbox) => Promise<T>
): Promise<T> {
  const { getGameSandbox } = await import("@/lib/daytona/utils")
  const { sandbox } = await getGameSandbox(gameId)
  return run(sandbox)
}

/**
 * Creates every missing directory between the game root and the parent of
 * `absolute`. Directory creation is best effort: a directory that already
 * exists is not an error to surface.
 */
async function createParentDirs(
  sandbox: Sandbox,
  absolute: string
): Promise<void> {
  const target = posix.dirname(absolute)
  if (target === GAME_DIR) return

  let current = GAME_DIR
  for (const segment of posix.relative(GAME_DIR, target).split("/")) {
    if (!segment || segment === "..") return
    current = posix.join(current, segment)
    try {
      await sandbox.fs.createFolder(current, "755")
    } catch {
      // Already there — the upload below is what decides success.
    }
  }
}

/**
 * Writes `content` to `absolute`, creating the parent directories on the way.
 * The first upload is the common case (the parent exists); a failure is
 * retried once after the parents have been created, and that second failure is
 * the one the caller sees.
 */
async function uploadWithParents(
  sandbox: Sandbox,
  absolute: string,
  content: string
): Promise<void> {
  try {
    await sandbox.fs.uploadFile(Buffer.from(content), absolute)
    return
  } catch {
    // Almost always "no such file or directory": the parent is not there yet.
  }
  await createParentDirs(sandbox, absolute)
  await sandbox.fs.uploadFile(Buffer.from(content), absolute)
}

/**
 * The five file tools the agent authors the game with. Every one of them is
 * confined to the game directory, answers failures as `{ ok: false, error }`
 * instead of throwing (so the model gets an actionable message rather than a
 * failed turn), and reports paths relative to the game directory.
 *
 * Bound to one game: `gameId` is the chat id, and it is what each call passes
 * to `getGameSandbox`.
 */
export function gameTools(gameId: string) {
  return {
    list_files: tool({
      description:
        "List what is in a directory of the game, one level deep. Defaults to the game directory itself. Entries come back as game-relative paths ready to pass to the other file tools.",
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe(
            "Directory to list, relative to the game directory. Omit for the game directory itself."
          ),
      }),
      execute: async ({ path }) => {
        const resolved = resolveGamePath(path ?? "")
        if (!resolved.ok) return resolved

        return withGameSandbox(gameId, async (sandbox) => {
          const entries = await sandbox.fs.listFiles(resolved.path)
          return {
            ok: true,
            path: relativeToGame(resolved.path),
            entries: entries.map((entry) => ({
              name: entry.name,
              path: posix.relative(GAME_DIR, entry.path ?? resolved.path),
              type: entry.isDir ? "directory" : "file",
              size: entry.size,
            })),
          }
        }).catch(failure)
      },
    }),

    read_file: tool({
      description:
        "Read one file of the game. Read before you edit: the game is whatever earlier turns left on disk, not what you remember writing.",
      inputSchema: z.object({
        path: z
          .string()
          .min(1)
          .describe("File to read, relative to the game directory."),
      }),
      execute: async ({ path }) => {
        const resolved = resolveFilePath(path)
        if (!resolved.ok) return resolved

        return withGameSandbox(gameId, async (sandbox) => {
          const buffer = await sandbox.fs.downloadFile(resolved.path)
          const full = buffer.toString("utf8")
          const truncated = full.length > MAX_READ_CHARS
          return {
            ok: true,
            path: relativeToGame(resolved.path),
            content: truncated ? full.slice(0, MAX_READ_CHARS) : full,
            truncated,
          }
        }).catch(failure)
      },
    }),

    write_file: tool({
      description:
        "Create a file of the game, or replace one whole. Pass the entire file, never a fragment; missing parent directories are created for you. Overwrites whatever is at that path.",
      inputSchema: z.object({
        path: z
          .string()
          .min(1)
          .describe("File to write, relative to the game directory."),
        content: z.string().describe("The complete new contents of the file."),
      }),
      execute: async ({ path, content }) => {
        const resolved = resolveFilePath(path)
        if (!resolved.ok) return resolved

        return withGameSandbox(gameId, async (sandbox) => {
          await uploadWithParents(sandbox, resolved.path, content)
          return {
            ok: true,
            path: relativeToGame(resolved.path),
            bytes: Buffer.byteLength(content),
          }
        }).catch(failure)
      },
    }),

    replace_text: tool({
      description:
        "Change part of one existing file. By default the old text must occur exactly once — copy it verbatim from read_file, indentation included, with enough surrounding lines to make it unique, and the tool tells you how many matches it found when it is not. Set replace_all to change every occurrence.",
      inputSchema: z.object({
        path: z
          .string()
          .min(1)
          .describe("File to edit, relative to the game directory."),
        old_text: z
          .string()
          .min(1)
          .describe("Exact text to find, copied verbatim from the file."),
        new_text: z.string().describe("Text that replaces it."),
        replace_all: z
          .boolean()
          .optional()
          .describe(
            "Replace every occurrence instead of requiring a single unique match."
          ),
      }),
      execute: async ({ path, old_text, new_text, replace_all }) => {
        const resolved = resolveFilePath(path)
        if (!resolved.ok) return resolved
        if (!old_text) {
          return { ok: false, error: "old_text cannot be empty." }
        }

        return withGameSandbox(gameId, async (sandbox) => {
          const buffer = await sandbox.fs.downloadFile(resolved.path)
          const content = buffer.toString("utf8")
          const reportPath = relativeToGame(resolved.path)
          const first = content.indexOf(old_text)

          if (first === -1) {
            return {
              ok: false,
              error: `Text not found in ${reportPath}. Read the file and copy the exact text, whitespace included.`,
            }
          }

          if (replace_all) {
            const parts = content.split(old_text)
            await sandbox.fs.uploadFile(
              Buffer.from(parts.join(new_text)),
              resolved.path
            )
            return {
              ok: true,
              path: reportPath,
              replacements: parts.length - 1,
            }
          }

          if (content.indexOf(old_text, first + old_text.length) !== -1) {
            return {
              ok: false,
              error: `Text found ${content.split(old_text).length - 1} times in ${reportPath}. Include more surrounding lines to make it a single match, or pass replace_all to change all of them.`,
            }
          }

          const next =
            content.slice(0, first) +
            new_text +
            content.slice(first + old_text.length)
          await sandbox.fs.uploadFile(Buffer.from(next), resolved.path)
          return { ok: true, path: reportPath, replacements: 1 }
        }).catch(failure)
      },
    }),

    delete_file: tool({
      description:
        "Remove a file the game no longer uses. Never index.html — it is what loads in the preview, and write_file is how you replace it.",
      inputSchema: z.object({
        path: z
          .string()
          .min(1)
          .describe("File to delete, relative to the game directory."),
      }),
      execute: async ({ path }) => {
        const resolved = resolveFilePath(path)
        if (!resolved.ok) return resolved

        return withGameSandbox(gameId, async (sandbox) => {
          await sandbox.fs.deleteFile(resolved.path)
          return { ok: true, path: relativeToGame(resolved.path) }
        }).catch(failure)
      },
    }),
  }
}

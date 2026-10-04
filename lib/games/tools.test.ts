import { beforeEach, describe, expect, it, vi } from "vitest"

// The tools reach Daytona only through a lazy `import("@/lib/daytona/utils")`
// inside each execute, so mocking that module keeps this suite offline: no
// `server-only` chain, no env validation, no live sandbox. The fake filesystem
// is an in-memory map keyed by absolute path — that is what the confinement
// assertions read, so a tool that resolves a path wrong cannot pass here.
const sandboxMock = vi.hoisted(() => {
  const GAME_DIR = "/home/daytona/game"
  const files = new Map<string, string>()
  const folders = new Set<string>([GAME_DIR])
  const uploads: string[] = []
  const folderCreates: string[] = []
  const deletions: string[] = []
  const listings: string[] = []

  // Hoisted code runs before the module's imports, so dirname is local here
  // rather than imported from node:path.
  const dirname = (target: string) => {
    const cut = target.lastIndexOf("/")
    return cut <= 0 ? "/" : target.slice(0, cut)
  }

  const fs = {
    // Mirrors the real API: an upload into a directory that does not exist
    // fails with "no such file or directory" instead of creating it.
    uploadFile: vi.fn(async (content: Buffer, remotePath: string) => {
      if (!folders.has(dirname(remotePath))) {
        throw new Error(`open ${remotePath}: no such file or directory`)
      }
      files.set(remotePath, content.toString("utf8"))
      uploads.push(remotePath)
    }),
    downloadFile: vi.fn(async (remotePath: string) => {
      const content = files.get(remotePath)
      if (content === undefined) {
        throw new Error(`file not found: ${remotePath}`)
      }
      return Buffer.from(content)
    }),
    listFiles: vi.fn(async (dirPath: string) => {
      listings.push(dirPath)
      const prefix = dirPath.endsWith("/") ? dirPath : `${dirPath}/`
      const entries = new Map<
        string,
        { name: string; isDir: boolean; size: number; path: string }
      >()
      const touch = (full: string, isDir: boolean, size: number) => {
        if (!full.startsWith(prefix)) return
        const rest = full.slice(prefix.length)
        if (!rest) return
        const top = rest.split("/")[0]
        const nested = rest.includes("/")
        const seen = entries.get(top)
        if (seen) {
          if (nested) seen.isDir = true
          return
        }
        entries.set(top, {
          name: top,
          isDir: nested || isDir,
          size: nested || isDir ? 0 : size,
          path: `${dirPath}/${top}`,
        })
      }
      for (const [path, content] of files) {
        touch(path, false, Buffer.byteLength(content))
      }
      for (const folder of folders) {
        if (folder !== dirPath) touch(folder, true, 0)
      }
      return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name))
    }),
    deleteFile: vi.fn(async (target: string, recursive?: boolean) => {
      deletions.push(target)
      if (files.delete(target)) return
      if (folders.has(target)) {
        if (recursive) {
          folders.delete(target)
          return
        }
        throw new Error(`cannot remove '${target}': is a directory`)
      }
      throw new Error(`lstat ${target}: no such file or directory`)
    }),
    createFolder: vi.fn(async (folderPath: string) => {
      folderCreates.push(folderPath)
      folders.add(folderPath)
    }),
  }

  return {
    fs,
    files,
    folders,
    uploads,
    folderCreates,
    deletions,
    listings,
    reset() {
      vi.clearAllMocks()
      files.clear()
      folders.clear()
      folders.add(GAME_DIR)
      uploads.length = 0
      folderCreates.length = 0
      deletions.length = 0
      listings.length = 0
    },
  }
})

vi.mock("@/lib/daytona/utils", () => ({
  getGameSandbox: async () => ({ sandbox: { fs: sandboxMock.fs } }),
}))

import { GAME_DIR } from "@/lib/daytona/constants"
import { MAX_READ_CHARS, gameTools } from "@/lib/games/tools"

type ToolName =
  "list_files" | "read_file" | "write_file" | "replace_text" | "delete_file"

// Calls a tool the way the AI SDK does: validated input plus the execution
// options object, whose shape the tools ignore.
async function call(name: ToolName, input: unknown): Promise<unknown> {
  const entry = gameTools("game-1")[name] as unknown as {
    execute?: (input: unknown, options: unknown) => Promise<unknown>
  }
  if (!entry.execute) throw new Error(`tool ${name} defines no execute`)
  return entry.execute(input, {
    toolCallId: "call-1",
    messages: [],
    abortSignal: undefined,
  })
}

beforeEach(() => {
  sandboxMock.reset()
})

describe("gameTools", () => {
  it("exposes exactly the five game file tools", () => {
    expect(Object.keys(gameTools("game-1")).sort()).toEqual([
      "delete_file",
      "list_files",
      "read_file",
      "replace_text",
      "write_file",
    ])
  })
})

describe("path confinement", () => {
  it("rejects relative traversal outside the game directory on every tool", async () => {
    const attempts: [string, Promise<unknown>][] = [
      [
        "write_file",
        call("write_file", { path: "../../etc/passwd", content: "x" }),
      ],
      ["read_file", call("read_file", { path: "../../etc/passwd" })],
      ["list_files", call("list_files", { path: ".." })],
      [
        "replace_text",
        call("replace_text", {
          path: "../../etc/passwd",
          old_text: "a",
          new_text: "b",
        }),
      ],
      ["delete_file", call("delete_file", { path: "../../etc/passwd" })],
    ]

    for (const [name, attempt] of attempts) {
      const result = (await attempt) as { ok: false; error: string }
      expect(result.ok, `${name} must reject the path`).toBe(false)
      expect(result.error, `${name} error`).toContain(
        "outside the game directory"
      )
    }

    expect(sandboxMock.uploads).toEqual([])
    expect(sandboxMock.deletions).toEqual([])
    expect(sandboxMock.listings).toEqual([])
  })

  it("rejects absolute paths outside the game directory", async () => {
    const result = (await call("write_file", {
      path: "/etc/passwd",
      content: "x",
    })) as { ok: false; error: string }

    expect(result.ok).toBe(false)
    expect(sandboxMock.uploads).toEqual([])
  })

  it("accepts absolute paths inside the game directory", async () => {
    const result = (await call("write_file", {
      path: `${GAME_DIR}/index.html`,
      content: "<!doctype html>",
    })) as { ok: true; path: string }

    expect(result.ok).toBe(true)
    expect(sandboxMock.uploads).toEqual([`${GAME_DIR}/index.html`])
  })
})

describe("write_file", () => {
  it("writes a relative path into the game directory and reports byte length", async () => {
    const result = (await call("write_file", {
      path: "style.css",
      content: "body { margin: 0 }\n",
    })) as { ok: true; path: string; bytes: number }

    expect(result).toEqual({
      ok: true,
      path: "style.css",
      bytes: Buffer.byteLength("body { margin: 0 }\n"),
    })
    expect(sandboxMock.files.get(`${GAME_DIR}/style.css`)).toBe(
      "body { margin: 0 }\n"
    )
  })

  it("creates the missing parent directories and retries the upload", async () => {
    const result = (await call("write_file", {
      path: "assets/sprites/player.png",
      content: "png-bytes",
    })) as { ok: true; path: string }

    expect(result.ok).toBe(true)
    expect(sandboxMock.folderCreates).toEqual([
      `${GAME_DIR}/assets`,
      `${GAME_DIR}/assets/sprites`,
    ])
    expect(sandboxMock.uploads).toEqual([
      `${GAME_DIR}/assets/sprites/player.png`,
    ])
  })

  it("overwrites an existing file in one call", async () => {
    await call("write_file", { path: "index.html", content: "first" })
    await call("write_file", { path: "index.html", content: "second" })

    expect(sandboxMock.files.get(`${GAME_DIR}/index.html`)).toBe("second")
  })
})

describe("read_file", () => {
  it("returns the file contents keyed by its game-relative path", async () => {
    await call("write_file", { path: "index.html", content: "<h1>hi</h1>" })

    const result = (await call("read_file", { path: "index.html" })) as {
      ok: true
      path: string
      content: string
      truncated: boolean
    }

    expect(result).toEqual({
      ok: true,
      path: "index.html",
      content: "<h1>hi</h1>",
      truncated: false,
    })
  })

  it("truncates content above MAX_READ_CHARS and flags it", async () => {
    const oversized = "a".repeat(MAX_READ_CHARS + 50)
    await call("write_file", { path: "big.js", content: oversized })

    const result = (await call("read_file", { path: "big.js" })) as {
      ok: true
      content: string
      truncated: boolean
    }

    expect(result.truncated).toBe(true)
    expect(result.content).toHaveLength(MAX_READ_CHARS)
    expect(result.content.length).toBeLessThan(oversized.length)
  })

  it("reports a missing file as an error result instead of throwing", async () => {
    const result = (await call("read_file", { path: "nope.js" })) as {
      ok: false
      error: string
    }

    expect(result.ok).toBe(false)
    expect(result.error).toContain("nope.js")
  })
})

describe("replace_text", () => {
  beforeEach(async () => {
    await call("write_file", {
      path: "index.html",
      content: "const a = 1\nconst b = 1\n",
    })
    // The setup write belongs to the fixture, not the assertion: each test
    // below proves "did this call write?" against an empty upload log.
    sandboxMock.uploads.length = 0
  })

  it("replaces a unique match and reports how many it changed", async () => {
    const result = (await call("replace_text", {
      path: "index.html",
      old_text: "const a = 1",
      new_text: "const a = 2",
    })) as { ok: true; replacements: number }

    expect(result).toEqual({ ok: true, path: "index.html", replacements: 1 })
    expect(sandboxMock.files.get(`${GAME_DIR}/index.html`)).toContain(
      "const a = 2"
    )
  })

  it("errors when the text is not found, without writing", async () => {
    const result = (await call("replace_text", {
      path: "index.html",
      old_text: "const c = 3",
      new_text: "const c = 4",
    })) as { ok: false; error: string }

    expect(result.ok).toBe(false)
    expect(result.error).toContain("not found")
    expect(sandboxMock.uploads).toEqual([])
  })

  it("errors on an ambiguous match so the caller narrows it", async () => {
    const result = (await call("replace_text", {
      path: "index.html",
      old_text: "const ",
      new_text: "let ",
    })) as { ok: false; error: string }

    expect(result.ok).toBe(false)
    expect(result.error).toContain("2")
    expect(sandboxMock.uploads).toEqual([])
  })

  it("replaces every occurrence when replace_all is true", async () => {
    const result = (await call("replace_text", {
      path: "index.html",
      old_text: "const ",
      new_text: "let ",
      replace_all: true,
    })) as { ok: true; replacements: number }

    expect(result).toEqual({ ok: true, path: "index.html", replacements: 2 })
    expect(sandboxMock.files.get(`${GAME_DIR}/index.html`)).toBe(
      "let a = 1\nlet b = 1\n"
    )
  })

  it("rejects an empty old_text rather than splicing the file apart", async () => {
    const result = (await call("replace_text", {
      path: "index.html",
      old_text: "",
      new_text: "x",
    })) as { ok: false; error: string }

    expect(result.ok).toBe(false)
    expect(sandboxMock.uploads).toEqual([])
  })
})

describe("list_files", () => {
  it("lists the game directory by default with game-relative paths", async () => {
    await call("write_file", { path: "index.html", content: "x" })
    await call("write_file", { path: "assets/logo.svg", content: "<svg/>" })

    const result = (await call("list_files", {})) as {
      ok: true
      path: string
      entries: { name: string; path: string; type: string; size: number }[]
    }

    expect(result.path).toBe("")
    expect(result.entries).toEqual([
      { name: "assets", path: "assets", type: "directory", size: 0 },
      { name: "index.html", path: "index.html", type: "file", size: 1 },
    ])
    expect(sandboxMock.listings).toEqual([GAME_DIR])
  })

  it("lists a subdirectory when one is given", async () => {
    await call("write_file", { path: "assets/logo.svg", content: "<svg/>" })

    const result = (await call("list_files", { path: "assets" })) as {
      ok: true
      path: string
      entries: { path: string; type: string }[]
    }

    expect(result.path).toBe("assets")
    expect(result.entries).toEqual([
      { name: "logo.svg", path: "assets/logo.svg", type: "file", size: 6 },
    ])
  })
})

describe("delete_file", () => {
  it("deletes the file at a confined path", async () => {
    await call("write_file", { path: "old.js", content: "x" })

    const result = (await call("delete_file", { path: "old.js" })) as {
      ok: true
      path: string
    }

    expect(result).toEqual({ ok: true, path: "old.js" })
    expect(sandboxMock.files.has(`${GAME_DIR}/old.js`)).toBe(false)
  })

  it("refuses to delete the game directory itself", async () => {
    const result = (await call("delete_file", { path: "." })) as {
      ok: false
      error: string
    }

    expect(result.ok).toBe(false)
    expect(sandboxMock.deletions).toEqual([])
  })

  it("reports a missing file as an error result instead of throwing", async () => {
    const result = (await call("delete_file", { path: "ghost.js" })) as {
      ok: false
      error: string
    }

    expect(result.ok).toBe(false)
    expect(result.error).toContain("ghost.js")
  })
})

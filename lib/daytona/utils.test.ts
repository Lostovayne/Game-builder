import { beforeEach, describe, expect, it, vi } from "vitest"

// Both external boundaries are isolated here so this suite runs offline:
// no `server-only` chain, no env validation, and no live Daytona API call.
// `daytona.create` and the sandbox FS are asserted against directly; the DB is
// a minimal fake that records the update payload so persistence can be proven.
const dbMock = vi.hoisted(() => {
  const state: { row: { sandboxId: string | null } | undefined } = {
    row: undefined,
  }
  const selectLimit = vi.fn(async () =>
    state.row === undefined ? [] : [state.row]
  )
  const updateWhere = vi.fn(async () => undefined)
  const set = vi.fn(() => ({ where: updateWhere }))
  const update = vi.fn(() => ({ set }))
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit: selectLimit })),
    })),
  }))

  return {
    state,
    db: { select, update },
    selectLimit,
    updateWhere,
    set,
    update,
  }
})

const daytonaMock = vi.hoisted(() => {
  const createFolder = vi.fn(async (_path: string, _mode: string) => undefined)
  const uploadFile = vi.fn(
    async (_file: Buffer, _remotePath: string) => undefined
  )
  const create = vi.fn()
  const makeSandbox = (id: string | undefined) => ({
    id,
    fs: { createFolder, uploadFile },
  })

  return { create, createFolder, uploadFile, makeSandbox }
})

// The module under test is server-side by contract, but Vitest runs without
// the `react-server` condition, where the `server-only` marker throws. Mock
// the marker so the suite can import the module offline.
vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({ db: dbMock.db }))
vi.mock("@/lib/daytona/client", () => ({
  daytona: { create: daytonaMock.create },
}))

import { createGameSandbox } from "@/lib/daytona/utils"

describe("createGameSandbox", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbMock.state.row = undefined
  })

  it("creates a labelled sandbox, seeds the starter file, then persists the id", async () => {
    dbMock.state.row = { sandboxId: null }
    daytonaMock.create.mockResolvedValue(daytonaMock.makeSandbox("sandbox-1"))

    const id = await createGameSandbox("game-1")

    expect(id).toBe("sandbox-1")
    expect(daytonaMock.create).toHaveBeenCalledTimes(1)
    // Exactly the labels payload: no `name` and no extra fields.
    expect(daytonaMock.create).toHaveBeenCalledWith({
      labels: { gameId: "game-1" },
    })
    expect(dbMock.set).toHaveBeenCalledWith({ sandboxId: "sandbox-1" })
  })

  it("creates the game folder with mode 755 before uploading the entrypoint", async () => {
    dbMock.state.row = { sandboxId: null }
    daytonaMock.create.mockResolvedValue(daytonaMock.makeSandbox("sandbox-1"))

    await createGameSandbox("game-1")

    expect(daytonaMock.createFolder).toHaveBeenCalledTimes(1)
    expect(daytonaMock.createFolder).toHaveBeenCalledWith(
      "/home/daytona/game",
      "755"
    )
    expect(daytonaMock.uploadFile).toHaveBeenCalledTimes(1)
    expect(daytonaMock.uploadFile).toHaveBeenCalledWith(
      Buffer.from("New Game"),
      "/home/daytona/game/index.html"
    )

    // Exact bytes: "New Game", no trailing newline, case-sensitive.
    const uploaded = daytonaMock.uploadFile.mock.calls[0][0]
    expect(uploaded.toString()).toBe("New Game")
  })

  it("creates the folder and uploads the file before persisting the id", async () => {
    dbMock.state.row = { sandboxId: null }
    daytonaMock.create.mockResolvedValue(daytonaMock.makeSandbox("sandbox-1"))

    await createGameSandbox("game-1")

    const folderOrder = daytonaMock.createFolder.mock.invocationCallOrder[0]
    const uploadOrder = daytonaMock.uploadFile.mock.invocationCallOrder[0]
    const persistOrder = dbMock.update.mock.invocationCallOrder[0]

    expect(folderOrder).toBeLessThan(uploadOrder)
    expect(uploadOrder).toBeLessThan(persistOrder)
  })

  it("reuses an existing sandbox id without provisioning or reseeding", async () => {
    dbMock.state.row = { sandboxId: "sandbox-existing" }

    const id = await createGameSandbox("game-1")

    expect(id).toBe("sandbox-existing")
    expect(daytonaMock.create).not.toHaveBeenCalled()
    expect(daytonaMock.createFolder).not.toHaveBeenCalled()
    expect(daytonaMock.uploadFile).not.toHaveBeenCalled()
    expect(dbMock.update).not.toHaveBeenCalled()
  })

  it("rejects and provisions nothing when the game does not exist", async () => {
    dbMock.state.row = undefined

    await expect(createGameSandbox("missing-game")).rejects.toThrow(/not found/)

    expect(daytonaMock.create).not.toHaveBeenCalled()
    expect(daytonaMock.createFolder).not.toHaveBeenCalled()
    expect(daytonaMock.uploadFile).not.toHaveBeenCalled()
    expect(dbMock.update).not.toHaveBeenCalled()
  })

  it("rejects and persists no id when Daytona provisioning fails", async () => {
    dbMock.state.row = { sandboxId: null }
    daytonaMock.create.mockRejectedValue(new Error("Daytona unavailable"))

    await expect(createGameSandbox("game-1")).rejects.toThrow(
      "Daytona unavailable"
    )

    expect(daytonaMock.createFolder).not.toHaveBeenCalled()
    expect(daytonaMock.uploadFile).not.toHaveBeenCalled()
    expect(dbMock.update).not.toHaveBeenCalled()
    expect(dbMock.set).not.toHaveBeenCalled()
  })

  it("rejects and persists no id when Daytona returns no sandbox id", async () => {
    dbMock.state.row = { sandboxId: null }
    daytonaMock.create.mockResolvedValue(daytonaMock.makeSandbox(undefined))

    await expect(createGameSandbox("game-1")).rejects.toThrow(
      "Daytona did not return a sandbox id"
    )

    expect(daytonaMock.createFolder).not.toHaveBeenCalled()
    expect(daytonaMock.uploadFile).not.toHaveBeenCalled()
    expect(dbMock.update).not.toHaveBeenCalled()
    expect(dbMock.set).not.toHaveBeenCalled()
  })

  it("rejects and persists no id when folder creation fails", async () => {
    dbMock.state.row = { sandboxId: null }
    daytonaMock.create.mockResolvedValue(daytonaMock.makeSandbox("sandbox-1"))
    daytonaMock.createFolder.mockRejectedValueOnce(new Error("mkdir failed"))

    await expect(createGameSandbox("game-1")).rejects.toThrow("mkdir failed")

    expect(daytonaMock.uploadFile).not.toHaveBeenCalled()
    expect(dbMock.update).not.toHaveBeenCalled()
    expect(dbMock.set).not.toHaveBeenCalled()
  })

  it("rejects and persists no id when the starter file upload fails", async () => {
    dbMock.state.row = { sandboxId: null }
    daytonaMock.create.mockResolvedValue(daytonaMock.makeSandbox("sandbox-1"))
    daytonaMock.uploadFile.mockRejectedValueOnce(new Error("upload failed"))

    await expect(createGameSandbox("game-1")).rejects.toThrow("upload failed")

    expect(dbMock.update).not.toHaveBeenCalled()
    expect(dbMock.set).not.toHaveBeenCalled()
  })
})

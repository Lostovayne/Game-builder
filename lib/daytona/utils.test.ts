import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

const previewMock = vi.hoisted(() => {
  const state = { value: "started" }
  const executeCommand = vi.fn(async () => ({ exitCode: 0, result: "200" }))
  const createSession = vi.fn(async () => undefined)
  const executeSessionCommand = vi.fn(
    async (
      _sessionId: string,
      _request: { command: string; runAsync?: boolean }
    ) => ({
      cmdId: "cmd-1",
      output: "",
      exitCode: 0,
    })
  )
  const start = vi.fn(async () => undefined)
  const makeSandbox = () => ({
    id: "sandbox-1",
    state: state.value,
    start,
    process: { executeCommand, createSession, executeSessionCommand },
  })
  const get = vi.fn(async () => makeSandbox())

  return {
    state,
    get,
    start,
    executeCommand,
    createSession,
    executeSessionCommand,
  }
})

// The module under test is server-side by contract, but Vitest runs without
// the `react-server` condition, where the `server-only` marker throws. Mock
// the marker so the suite can import the module offline.
vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({ db: dbMock.db }))
vi.mock("@/lib/daytona/client", () => ({
  daytona: { create: daytonaMock.create, get: previewMock.get },
}))

import {
  GAME_PREVIEW_PORT,
  createGameSandbox,
  startGameServer,
} from "@/lib/daytona/utils"

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

describe("startGameServer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    previewMock.state.value = "started"
    previewMock.executeCommand.mockReset()
    previewMock.executeCommand.mockResolvedValue({ exitCode: 0, result: "200" })
    previewMock.createSession.mockReset()
    previewMock.createSession.mockResolvedValue(undefined)
    previewMock.executeSessionCommand.mockReset()
    previewMock.executeSessionCommand.mockResolvedValue({
      cmdId: "cmd-1",
      output: "",
      exitCode: 0,
    })
    previewMock.start.mockReset()
    previewMock.start.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("recovers when the preview session already exists from a dead server", async () => {
    // Port unhealthy (server died), but the old session still lingers.
    previewMock.executeCommand
      .mockResolvedValueOnce({ exitCode: 7, result: "000" })
      .mockResolvedValue({ exitCode: 0, result: "200" })
    previewMock.createSession.mockRejectedValueOnce(
      new Error("session already exists")
    )

    await startGameServer("sandbox-1")

    // The launch command still ran and health was confirmed.
    expect(previewMock.executeSessionCommand).toHaveBeenCalledTimes(1)
    expect(previewMock.executeCommand).toHaveBeenCalledTimes(2)
  })

  it("propagates when the initial health check itself errors", async () => {
    previewMock.executeCommand.mockRejectedValue(new Error("toolbox down"))

    await expect(startGameServer("sandbox-1")).rejects.toThrow("toolbox down")

    expect(previewMock.createSession).not.toHaveBeenCalled()
    expect(previewMock.executeSessionCommand).not.toHaveBeenCalled()
  })

  it("propagates when Daytona cannot retrieve the sandbox", async () => {
    previewMock.get.mockRejectedValueOnce(new Error("sandbox not found"))

    await expect(startGameServer("sandbox-1")).rejects.toThrow(
      "sandbox not found"
    )

    expect(previewMock.start).not.toHaveBeenCalled()
    expect(previewMock.createSession).not.toHaveBeenCalled()
  })

  it("is idempotent across repeated sequential calls once healthy", async () => {
    // First call: unhealthy, launch, then healthy.
    previewMock.executeCommand
      .mockResolvedValueOnce({ exitCode: 7, result: "000" })
      .mockResolvedValue({ exitCode: 0, result: "200" })

    await startGameServer("sandbox-1")
    const launchesAfterFirst =
      previewMock.executeSessionCommand.mock.calls.length

    // Second call: healthy port is reused, nothing new is launched.
    await startGameServer("sandbox-1")

    expect(previewMock.executeSessionCommand).toHaveBeenCalledTimes(
      launchesAfterFirst
    )
    expect(previewMock.createSession).toHaveBeenCalledTimes(1)
    expect(previewMock.start).not.toHaveBeenCalled()
  })

  it("fails meaningfully when the launched server never becomes healthy", async () => {
    vi.useFakeTimers()
    previewMock.executeCommand.mockResolvedValue({
      exitCode: 7,
      result: "000",
    })

    const promise = startGameServer("sandbox-1")
    const expectation = expect(promise).rejects.toThrow(
      /did not become healthy/
    )

    // Drive the health-poll loop without real waiting.
    await vi.runAllTimersAsync()
    await expectation

    expect(previewMock.createSession).toHaveBeenCalledTimes(1)
    expect(previewMock.executeSessionCommand).toHaveBeenCalledTimes(1)
  })

  it("launches a persistent static server when the port is unhealthy, then becomes healthy", async () => {
    // First probe (initial health check) fails; after the launch, healthy.
    previewMock.executeCommand
      .mockResolvedValueOnce({ exitCode: 7, result: "000" })
      .mockResolvedValue({ exitCode: 0, result: "200" })

    await startGameServer("sandbox-1")

    expect(previewMock.createSession).toHaveBeenCalledWith("game-preview")
    expect(previewMock.executeSessionCommand).toHaveBeenCalledTimes(1)
    const [sessionId, request] = previewMock.executeSessionCommand.mock.calls[0]
    expect(sessionId).toBe("game-preview")
    expect(request.command).toContain("cd /home/daytona/game")
    expect(request.command).toContain("http.server")
    expect(request.command).toContain(String(GAME_PREVIEW_PORT))
    expect(request.runAsync).toBe(true)
    // Only the initial failing probe plus one healthy poll: no retry storm.
    expect(previewMock.executeCommand).toHaveBeenCalledTimes(2)
  })

  it("starts a stopped sandbox in place instead of replacing it", async () => {
    previewMock.state.value = "stopped"

    await startGameServer("sandbox-1")

    expect(previewMock.get).toHaveBeenCalledWith("sandbox-1")
    expect(previewMock.start).toHaveBeenCalledTimes(1)
    expect(previewMock.start).toHaveBeenCalledWith(expect.any(Number))
    expect(daytonaMock.create).not.toHaveBeenCalled()
  })

  it("retrieves the existing sandbox by id and reuses a healthy preview port without launching anything", async () => {
    await startGameServer("sandbox-1")

    expect(previewMock.get).toHaveBeenCalledWith("sandbox-1")
    expect(daytonaMock.create).not.toHaveBeenCalled()
    expect(previewMock.start).not.toHaveBeenCalled()
    expect(previewMock.createSession).not.toHaveBeenCalled()
    expect(previewMock.executeSessionCommand).not.toHaveBeenCalled()
    // The health check targets the fixed preview port inside the sandbox.
    expect(previewMock.executeCommand).toHaveBeenCalledWith(
      expect.stringContaining(`127.0.0.1:${GAME_PREVIEW_PORT}`),
      undefined,
      undefined,
      expect.any(Number)
    )
  })
})

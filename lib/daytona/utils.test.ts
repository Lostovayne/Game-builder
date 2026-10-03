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
    // Mirrors the real SDK: `create` waits until the sandbox is started, so a
    // freshly provisioned instance is already running.
    state: "started",
    fs: { createFolder, uploadFile },
  })

  return { create, createFolder, uploadFile, makeSandbox }
})

const previewMock = vi.hoisted(() => {
  const state = {
    value: "started",
    // The sandbox object the mocked `daytona.get` produced, kept so tests can
    // assert identity against it.
    sandbox: undefined as unknown,
  }
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
  const makeSandbox = (id = "sandbox-1") => ({
    id,
    state: state.value,
    start,
    process: { executeCommand, createSession, executeSessionCommand },
  })
  // Resolves the requested id the way `daytona.get` does, so tests can prove
  // which id a helper asked Daytona for.
  const get = vi.fn(async (id = "sandbox-1") => {
    if (!state.sandbox) {
      state.sandbox = makeSandbox(id)
    }
    return state.sandbox
  })

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
  getGameSandbox,
  startGameServer,
} from "@/lib/daytona/utils"

describe("createGameSandbox", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbMock.state.row = undefined
    previewMock.state.value = "started"
    previewMock.state.sandbox = undefined
  })

  it("creates a labelled sandbox, seeds the starter file, then persists the id", async () => {
    dbMock.state.row = { sandboxId: null }
    daytonaMock.create.mockResolvedValue(daytonaMock.makeSandbox("sandbox-1"))

    const { sandbox } = await createGameSandbox("game-1")

    expect(sandbox.id).toBe("sandbox-1")
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

  it("resolves the existing sandbox instead of provisioning or reseeding", async () => {
    dbMock.state.row = { sandboxId: "sandbox-existing" }

    const { sandbox } = await createGameSandbox("game-1")

    // The persisted id is resolved into a live instance, never re-created.
    expect(sandbox.id).toBe("sandbox-existing")
    expect(previewMock.get).toHaveBeenCalledWith("sandbox-existing")
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
    previewMock.state.sandbox = undefined
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

    const result = await startGameServer("sandbox-1")

    // Fresh-launch path: the produced sandbox is returned unchanged, and
    // exactly one retrieval happened — no second `daytona.get`.
    expect(result.sandbox).toBe(previewMock.state.sandbox)
    expect(previewMock.get).toHaveBeenCalledTimes(1)
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

    const result = await startGameServer("sandbox-1")

    // The caller receives the very sandbox `daytona.get` produced so it can
    // mint preview URLs without a second retrieval.
    expect(result.sandbox).toBe(previewMock.state.sandbox)
    expect(previewMock.get).toHaveBeenCalledTimes(1)
    expect(previewMock.get).toHaveBeenCalledWith("sandbox-1")
    expect(previewMock.start).toHaveBeenCalledTimes(1)
    expect(previewMock.start).toHaveBeenCalledWith(expect.any(Number))
    expect(daytonaMock.create).not.toHaveBeenCalled()
  })

  it("retrieves the existing sandbox by id and reuses a healthy preview port without launching anything", async () => {
    const result = await startGameServer("sandbox-1")

    // Healthy-reuse path: the produced sandbox is returned unchanged, from
    // exactly one retrieval.
    expect(result.sandbox).toBe(previewMock.state.sandbox)
    expect(previewMock.get).toHaveBeenCalledTimes(1)
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

describe("getGameSandbox", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbMock.state.row = undefined
    previewMock.state.value = "started"
    previewMock.state.sandbox = undefined
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

  it("provisions a game without a sandbox, then hands back the instance", async () => {
    dbMock.state.row = { sandboxId: null }
    daytonaMock.create.mockResolvedValue(daytonaMock.makeSandbox("sandbox-1"))

    const { sandbox } = await getGameSandbox("game-1")

    expect(daytonaMock.create).toHaveBeenCalledTimes(1)
    // The instance Daytona just created is returned as-is: `create` waits for
    // the started state, so nothing is started a second time.
    expect(sandbox.id).toBe("sandbox-1")
    expect(previewMock.start).not.toHaveBeenCalled()
  })

  it("reuses the persisted sandbox id instead of creating another one", async () => {
    dbMock.state.row = { sandboxId: "sandbox-1" }

    const { sandbox } = await getGameSandbox("game-1")

    expect(daytonaMock.create).not.toHaveBeenCalled()
    expect(previewMock.get).toHaveBeenCalledWith("sandbox-1")
    expect(sandbox.id).toBe("sandbox-1")
  })

  it("starts a stopped sandbox before handing it back", async () => {
    dbMock.state.row = { sandboxId: "sandbox-1" }
    previewMock.state.value = "stopped"
    previewMock.state.sandbox = undefined

    const { sandbox } = await getGameSandbox("game-1")

    expect(previewMock.start).toHaveBeenCalledTimes(1)
    expect(previewMock.start).toHaveBeenCalledWith(expect.any(Number))
    expect(sandbox).toBe(previewMock.state.sandbox)
  })

  it("does not start a sandbox that is already running", async () => {
    dbMock.state.row = { sandboxId: "sandbox-1" }

    await getGameSandbox("game-1")

    expect(previewMock.start).not.toHaveBeenCalled()
  })

  it("never launches or health-checks the preview server", async () => {
    dbMock.state.row = { sandboxId: "sandbox-1" }

    await getGameSandbox("game-1")

    // Booting the HTTP server is `startGameServer`'s job; this helper only
    // guarantees a running sandbox instance.
    expect(previewMock.executeCommand).not.toHaveBeenCalled()
    expect(previewMock.createSession).not.toHaveBeenCalled()
    expect(previewMock.executeSessionCommand).not.toHaveBeenCalled()
  })

  it("rejects before any Daytona call when the game does not exist", async () => {
    await expect(getGameSandbox("missing-game")).rejects.toThrow(/not found/)

    expect(daytonaMock.create).not.toHaveBeenCalled()
    expect(previewMock.get).not.toHaveBeenCalled()
    expect(previewMock.start).not.toHaveBeenCalled()
  })

  it("propagates when the sandbox cannot be retrieved", async () => {
    dbMock.state.row = { sandboxId: "sandbox-1" }
    previewMock.get.mockRejectedValueOnce(new Error("sandbox not found"))

    await expect(getGameSandbox("game-1")).rejects.toThrow("sandbox not found")

    expect(previewMock.start).not.toHaveBeenCalled()
  })
})

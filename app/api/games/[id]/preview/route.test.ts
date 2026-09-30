import { beforeEach, describe, expect, it, vi } from "vitest"

// Every external boundary is mocked so this suite runs fully offline: no
// Clerk round-trip, no Neon/DB access, no `server-only` marker, and no live
// Daytona API call (DAYTONA_API_KEY is absent in this environment).
const authMock = vi.hoisted(() =>
  vi.fn<() => Promise<{ userId: string | null; orgId: string | null }>>(
    async () => ({
      userId: "user-1",
      orgId: "org-1",
    })
  )
)

const dbMock = vi.hoisted(() => {
  const state: { rows: Array<{ sandboxId: string | null }> } = { rows: [] }
  const limit = vi.fn(async () => state.rows)
  const where = vi.fn(() => ({ limit }))
  const from = vi.fn(() => ({ where }))
  const select = vi.fn(() => ({ from }))
  return { state, db: { select }, select, from, where, limit }
})

const daytonaMock = vi.hoisted(() => {
  const getSignedPreviewUrl = vi.fn(
    async (_port: number, _expiresInSeconds: number) => ({
      sandboxId: "sandbox-1",
      port: _port,
      token: "signed-preview-token",
      url: "https://sandbox-1.example.daytona.io:8000/?signed=1",
    })
  )
  const get = vi.fn(async () => ({ getSignedPreviewUrl }))
  return { get, getSignedPreviewUrl }
})

const utilsMock = vi.hoisted(() => ({
  GAME_PREVIEW_PORT: 8000,
  startGameServer: vi.fn(async (_sandboxId: string) => undefined),
}))

vi.mock("server-only", () => ({}))
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }))
vi.mock("@/lib/db", () => ({ db: dbMock.db }))
vi.mock("@/lib/daytona/client", () => ({ daytona: daytonaMock }))
vi.mock("@/lib/daytona/utils", () => utilsMock)

import { GET } from "./route"

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe("GET /api/games/[id]/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" })
    dbMock.state.rows = []
  })

  it("returns a short-lived signed preview URL for the org-owned game's sandbox", async () => {
    dbMock.state.rows = [{ sandboxId: "sandbox-1" }]

    const response = await GET(
      new Request("http://localhost/api"),
      makeContext("game-1")
    )

    expect(response.status).toBe(200)
    // Exact TTL and port: explicit one-hour expiry, fixed preview port.
    expect(daytonaMock.getSignedPreviewUrl).toHaveBeenCalledWith(8000, 3600)
  })

  it("returns 401 without an authenticated user", async () => {
    authMock.mockResolvedValue({ userId: null, orgId: "org-1" })

    const response = await GET(
      new Request("http://localhost/api"),
      makeContext("game-1")
    )

    expect(response.status).toBe(401)
    // Authorization precedes any DB or Daytona access.
    expect(dbMock.select).not.toHaveBeenCalled()
    expect(utilsMock.startGameServer).not.toHaveBeenCalled()
  })

  it("returns 401 without an organization context", async () => {
    authMock.mockResolvedValue({ userId: "user-1", orgId: null })

    const response = await GET(
      new Request("http://localhost/api"),
      makeContext("game-1")
    )

    expect(response.status).toBe(401)
    expect(dbMock.select).not.toHaveBeenCalled()
    expect(utilsMock.startGameServer).not.toHaveBeenCalled()
  })

  it("returns 404 when the game does not exist or is not owned by the org", async () => {
    dbMock.state.rows = []

    const response = await GET(
      new Request("http://localhost/api"),
      makeContext("other-game")
    )

    expect(response.status).toBe(404)
    expect(utilsMock.startGameServer).not.toHaveBeenCalled()
  })

  it("returns 404 when the org-owned game has no persisted sandbox yet", async () => {
    dbMock.state.rows = [{ sandboxId: null }]

    const response = await GET(
      new Request("http://localhost/api"),
      makeContext("game-1")
    )

    expect(response.status).toBe(404)
    expect(utilsMock.startGameServer).not.toHaveBeenCalled()
    expect(daytonaMock.get).not.toHaveBeenCalled()
  })

  it("maps Daytona failures to 502 without leaking internal errors", async () => {
    dbMock.state.rows = [{ sandboxId: "sandbox-1" }]
    utilsMock.startGameServer.mockRejectedValue(
      new Error("DaytonaError: secret internal detail")
    )
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const response = await GET(
      new Request("http://localhost/api"),
      makeContext("game-1")
    )

    expect(response.status).toBe(502)
    const body = await response.json()
    expect(JSON.stringify(body)).not.toContain("secret internal detail")
    consoleSpy.mockRestore()
  })
})

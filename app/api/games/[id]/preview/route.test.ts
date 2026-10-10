import { beforeEach, describe, expect, it, vi } from "vitest"

import { eqPairs } from "@/test-support/sql-predicates"

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
  const state: {
    rows: Array<{ sandboxId: string | null }>
    // The SQL predicate handed to `.where(...)`. A mock that discards it
    // would pass even if the route dropped the org-scope filter, so the
    // predicate itself is captured and asserted.
    predicates: unknown[]
  } = { rows: [], predicates: [] }
  const limit = vi.fn(async () => state.rows)
  const where = vi.fn((predicate: unknown) => {
    state.predicates.push(predicate)
    return { limit }
  })
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
  return { getSignedPreviewUrl }
})

const utilsMock = vi.hoisted(() => ({
  GAME_PREVIEW_PORT: 8000,
  // Signature mirrors the real contract: the route receives the started or
  // reused sandbox back from startGameServer.
  startGameServer: vi.fn<
    (sandboxId: string) => Promise<{
      sandbox: {
        getSignedPreviewUrl: (
          port: number,
          expiresInSeconds: number
        ) => Promise<{ url: string }>
      }
    }>
  >(async (_sandboxId: string) => ({
    sandbox: { getSignedPreviewUrl: async () => ({ url: "" }) },
  })),
}))

vi.mock("server-only", () => ({}))
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }))
vi.mock("@/lib/db", () => ({ db: dbMock.db }))
vi.mock("@/lib/daytona/client", () => ({ getDaytona: () => daytonaMock }))
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
    dbMock.state.predicates = []
  })

  it("returns a short-lived signed preview URL for the org-owned game's sandbox", async () => {
    dbMock.state.rows = [{ sandboxId: "sandbox-1" }]
    // The URL is minted from the very sandbox startGameServer returned — the
    // route must not perform a second retrieval.
    const sandbox = { getSignedPreviewUrl: daytonaMock.getSignedPreviewUrl }
    utilsMock.startGameServer.mockResolvedValue({ sandbox })

    const response = await GET(
      new Request("http://localhost/api"),
      makeContext("game-1")
    )

    expect(response.status).toBe(200)
    // The persisted sandbox id is what starts the server.
    expect(utilsMock.startGameServer).toHaveBeenCalledWith("sandbox-1")
    // Exact TTL and port, minted on the returned sandbox object.
    expect(daytonaMock.getSignedPreviewUrl).toHaveBeenCalledWith(8000, 3600)
    expect(daytonaMock.getSignedPreviewUrl).toHaveBeenCalledTimes(1)
    // The client receives the signed URL itself, not a token or an error.
    const body = await response.json()
    expect(body).toEqual({
      url: "https://sandbox-1.example.daytona.io:8000/?signed=1",
    })
  })

  it("scopes the game lookup to the id AND the caller's org", async () => {
    dbMock.state.rows = [{ sandboxId: "sandbox-1" }]
    utilsMock.startGameServer.mockResolvedValue({
      sandbox: { getSignedPreviewUrl: daytonaMock.getSignedPreviewUrl },
    })

    await GET(new Request("http://localhost/api"), makeContext("game-1"))

    // The mock discards nothing: the exact predicate the route passed to
    // `.where(...)` is inspected. Without `eq(games.orgId, orgId)` any org
    // could read any game's preview URL by guessing its id — a cross-org
    // data leak that the row-mocking in this suite would otherwise hide.
    expect(dbMock.state.predicates).toHaveLength(1)
    expect(eqPairs(dbMock.state.predicates[0])).toEqual([
      { column: "id", value: "game-1" },
      { column: "org_id", value: "org-1" },
    ])
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
    expect(daytonaMock.getSignedPreviewUrl).not.toHaveBeenCalled()
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

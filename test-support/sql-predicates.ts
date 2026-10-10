/**
 * Test helper: extract `column = value` pairs from a drizzle predicate.
 *
 * Mocked query builders (`.where(...)`) receive the real SQL object built by
 * `eq()`/`and()`. Without inspecting it, a mock silently discards the filter
 * and the test passes even when the code under test drops the predicate —
 * e.g. an org-scope check that would leak data across organizations.
 *
 * Walks `queryChunks` and pairs each column token with the immediately
 * following bound `Param`, which mirrors how `eq(col, value)` encodes itself.
 */

type Token = { kind: "column"; name: string } | { kind: "param"; value: unknown }

function tokenize(node: unknown, out: Token[]): void {
  if (node == null) return
  if (Array.isArray(node)) {
    for (const item of node) tokenize(item, out)
    return
  }
  if (typeof node !== "object") return

  const obj = node as { queryChunks?: unknown; name?: unknown; value?: unknown }
  if (Array.isArray(obj.queryChunks)) {
    tokenize(obj.queryChunks, out)
    return
  }

  const ctor = (node as { constructor?: { name?: string } }).constructor?.name
  if (ctor === "Param") {
    out.push({ kind: "param", value: obj.value })
    return
  }
  if (ctor === "StringChunk") return
  if (typeof obj.name === "string") {
    out.push({ kind: "column", name: obj.name })
  }
}

export function eqPairs(predicate: unknown): Array<{ column: string; value: unknown }> {
  const tokens: Token[] = []
  tokenize(predicate, tokens)

  const pairs: Array<{ column: string; value: unknown }> = []
  let pendingColumn: string | null = null
  for (const token of tokens) {
    if (token.kind === "column") {
      pendingColumn = token.name
      continue
    }
    if (pendingColumn !== null) {
      pairs.push({ column: pendingColumn, value: token.value })
      pendingColumn = null
    }
  }
  return pairs
}

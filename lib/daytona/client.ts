import { Daytona } from "@daytona/sdk"

let client: Daytona | undefined

/**
 * Resolves the shared Daytona client on first use.
 *
 * Deliberately no module-scope side effect: the Trigger deploy indexer
 * imports every built module — including the lazy `lib/daytona/utils` chunk —
 * in a container that has no runtime secrets, so validating the key here (at
 * call time) keeps indexing/builds import-safe while still failing fast with
 * the same message on the first real use.
 */
export function getDaytona(): Daytona {
  if (!process.env.DAYTONA_API_KEY) {
    throw new Error("DAYTONA_API_KEY is not set")
  }

  client ??= new Daytona()
  return client
}

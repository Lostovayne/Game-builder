// Single source of truth for the sandbox layout the game lives in.
//
// Deliberately import-free: `lib/games/instructions/runtime.ts` interpolates
// these values into the system prompt and `lib/games/tools.ts` enforces them as
// a confinement boundary, and neither must pull the `server-only`,
// env-validated Daytona client into its module graph just to read a constant.

/** Directory inside the sandbox that holds the game and is served as the root. */
export const GAME_DIR = "/home/daytona/game"

/** Port the preview HTTP server listens on inside the sandbox. */
export const PREVIEW_PORT = 8000

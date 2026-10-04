// Composition seam for the Game-builder chat system prompt: product workflow
// guidance first, then the runtime environment facts it depends on. Consumers
// (e.g. `trigger/chat.ts`) join these sections into the final system prompt.

import { runtime } from "./runtime"
import { workflow } from "./workflow"

export const gameInstructions: string[] = [workflow, runtime]

export { runtime, workflow }

import { z } from "zod"

/**
 * The ask_player contract, shared between the agent's tool definition (the
 * worker) and the chat UI that renders the pending question. Pure zod and
 * types only — safe to import from both sides.
 */

/**
 * The seven parts of a game worth settling, in the order the workflow works
 * through them (see `instructions/workflow.ts`). The model names the area
 * before writing the question so each ask is pinned to one part of the
 * design instead of a vague "what do you think?".
 */
export const ASK_PLAYER_DIMENSIONS = [
  "loop",
  "goal",
  "challenge",
  "controls",
  "world",
  "look",
  "feel",
] as const

export const askPlayerInputSchema = z.object({
  dimension: z
    .enum(ASK_PLAYER_DIMENSIONS)
    .describe(
      "Which part of the game this question settles: loop (the action they repeat), goal (what they play towards), challenge (what pushes back), controls (what they press), world (setting and layout), look (art direction), feel (pace, weight, juice and sound)."
    ),
  question: z.string().min(1).describe("The single question to ask."),
  options: z
    .array(
      z.object({
        id: z.string().min(1).describe("Stable identifier for this option."),
        label: z.string().min(1).describe("Short label shown to the player."),
        description: z
          .string()
          .min(1)
          .describe("One line on what choosing this option means."),
      })
    )
    .min(2)
    .max(4)
    .describe("Two to four concrete options for the player to pick from."),
})

export const askPlayerOutputSchema = z.object({
  id: z.string().describe("id of the chosen option."),
  label: z.string().describe("label of the chosen option."),
})

export type AskPlayerInput = z.infer<typeof askPlayerInputSchema>
export type AskPlayerOutput = z.infer<typeof askPlayerOutputSchema>

/**
 * Extracts a pending ask_player tool call from a chat message part.
 *
 * Parts arrive untyped from `useChat`, so this validates against the same
 * schema the tool declares instead of casting blind: a part that is not an
 * ask_player call, lacks a tool call id, or carries input the model somehow
 * got past server-side validation yields `null` and the caller falls back to
 * the generic tool marker.
 */
export function parseAskPlayerPart(
  part: unknown
): { toolCallId: string; input: AskPlayerInput } | null {
  if (typeof part !== "object" || part === null) return null
  const candidate = part as {
    type?: unknown
    toolCallId?: unknown
    input?: unknown
  }
  if (candidate.type !== "tool-ask_player") return null
  if (typeof candidate.toolCallId !== "string" || !candidate.toolCallId)
    return null
  const parsed = askPlayerInputSchema.safeParse(candidate.input)
  if (!parsed.success) return null
  return { toolCallId: candidate.toolCallId, input: parsed.data }
}

/**
 * True when a part is an ask_player call still waiting for the player's
 * answer — the state where the chat must render the question itself instead
 * of a tool marker or a collapsed tool group.
 */
export function isPendingAskPlayerPart(part: unknown): boolean {
  if (!parseAskPlayerPart(part)) return false
  return (
    typeof part === "object" &&
    part !== null &&
    "state" in part &&
    (part as { state?: unknown }).state === "input-available"
  )
}

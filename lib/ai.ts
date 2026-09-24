import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { env } from "@/lib/env"

// Single source of truth for the AI provider.
//
// Novita exposes an OpenAI-compatible endpoint
// (https://novita.ai/docs/guides/llm-api), so any OpenAI SDK can point at it
// with `base_url = "https://api.novita.ai/openai"`. We mirror that here with
// the AI SDK's OpenAI-compatible provider: every request goes to
// `${NOVITA_BASE_URL}/chat/completions` authenticated with NOVITA_API_KEY.
//
// Both call sites — the chat responder (app/api/chat/route.ts) and the sidebar
// title generator (lib/games/actions.ts) — must obtain their model from
// `getModel()` so provider + model stay configurable in one place.
//
// NOTE: server-only. NOVITA_API_KEY is not a NEXT_PUBLIC_ var.
const NOVITA_BASE_URL = "https://api.novita.ai/openai"

const novita = createOpenAICompatible({
  name: "novita",
  baseURL: NOVITA_BASE_URL,
  apiKey: env.NOVITA_API_KEY,
})

/**
 * The shared chat model, configured from `NOVITA_AI_MODEL`.
 *
 * Use for both chat responses and short generation tasks (e.g. game titles);
 * swap the env var to change the model everywhere without touching code.
 */
export function getModel() {
  return novita.chatModel(env.NOVITA_AI_MODEL)
}

import "server-only"

import { createGoogle } from "@ai-sdk/google"
import { env } from "@/lib/env"

// Single source of truth for the AI provider.
//
// Google Gemini via the official Vercel AI SDK provider (@ai-sdk/google).
// API keys are created at https://aistudio.google.com/apikey and passed as
// `apiKey` to `createGoogle`. No baseURL override is needed — the provider
// targets https://generativelanguage.googleapis.com/v1beta by default.
//
// Two env-driven models are exposed so each call site can pick the model
// tuned for its task without coupling them together:
// - Title generation (lib/games/actions.ts) → getTitleModel() → GEMINI_TITLE_MODEL
//   (default intent: gemini-3.5-flash-lite — cheapest/fastest lite text model)
// - Chat responses (app/api/chat/route.ts) → getChatModel() → GEMINI_CHAT_MODEL
//   (default intent: gemini-3.8-flash — newest flash, best latency/quality trade-off)
//
// NOTE: server-only. GEMINI_API_KEY is not a NEXT_PUBLIC_ var.

const google = createGoogle({
  apiKey: env.GEMINI_API_KEY,
})

/**
 * Model for short title generation (lib/games/actions.ts).
 * Reads GEMINI_TITLE_MODEL from env (e.g. gemini-3.5-flash-lite).
 */
export function getTitleModel() {
  return google(env.GEMINI_TITLE_MODEL)
}

/**
 * Model for streaming chat responses (app/api/chat/route.ts).
 * Reads GEMINI_CHAT_MODEL from env (e.g. gemini-3.8-flash).
 */
export function getChatModel() {
  return google(env.GEMINI_CHAT_MODEL)
}

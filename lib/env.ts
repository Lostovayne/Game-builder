import { z } from "zod"

// Single source of truth for server environment variables.
//
// Importing this module validates `process.env` eagerly (fail-fast): if a
// required variable is missing or has the wrong format, the import throws a
// clear error naming each offender — instead of a cryptic crash deep inside
// some library at build or request time.
//
// NOTE: server-only. Never import this from Client Components (browser
// `process.env` only carries NEXT_PUBLIC_* vars, so validation would fail).
const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  DATABASE_URL: z
    .string({
      error:
        "DATABASE_URL is missing — add it to .env.local (dev) or to the service Variables (Railway)",
    })
    .min(1, "DATABASE_URL is empty — it must be a Postgres connection string")
    .regex(
      /^postgres(ql)?:\/\//,
      "DATABASE_URL has an unexpected format — it must start with postgres:// or postgresql:// (use the pooled URL)"
    ),

  CLERK_SECRET_KEY: z
    .string({
      error:
        "CLERK_SECRET_KEY is missing — copy it from the Clerk dashboard into .env.local (dev) or the service Variables (Railway)",
    })
    .regex(
      /^(sk_test_|sk_live_)/,
      "CLERK_SECRET_KEY has an unexpected format — it must start with sk_test_ or sk_live_"
    ),

  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z
    .string({
      error:
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing — copy it from the Clerk dashboard into .env.local (dev) or the service Variables (Railway)",
    })
    .regex(
      /^(pk_test_|pk_live_)/,
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY has an unexpected format — it must start with pk_test_ or pk_live_"
    ),

  // Gemini — Google AI Studio (https://aistudio.google.com/apikey).
  // Two separate models: one for title generation, one for chat responses.
  // Both are read by lib/ai.ts via getTitleModel() / getChatModel().
  GEMINI_API_KEY: z
    .string({
      error:
        "GEMINI_API_KEY is missing — create one at https://aistudio.google.com/apikey and add it to .env.local (dev) or to the service Variables (Railway)",
    })
    .min(1, "GEMINI_API_KEY is empty — it must be a Gemini API key from https://aistudio.google.com/apikey"),

  GEMINI_TITLE_MODEL: z
    .string({
      error:
        "GEMINI_TITLE_MODEL is missing — set the model id (e.g. gemini-3.5-flash-lite) in .env.local (dev) or the service Variables (Railway)",
    })
    .min(1, "GEMINI_TITLE_MODEL is empty — it must be a Gemini model id (e.g. gemini-3.5-flash-lite)"),

  GEMINI_CHAT_MODEL: z
    .string({
      error:
        "GEMINI_CHAT_MODEL is missing — set the model id (e.g. gemini-3.8-flash) in .env.local (dev) or the service Variables (Railway)",
    })
    .min(1, "GEMINI_CHAT_MODEL is empty — it must be a Gemini model id (e.g. gemini-3.8-flash)"),

  // Custom auth routes — optional, Clerk falls back to its defaults when unset.
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().optional(),
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().optional(),
  NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: z.string().optional(),
  NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: z.string().optional(),
})

const parsed = serverEnvSchema.safeParse(process.env)

if (!parsed.success) {
  throw new Error(
    `❌ Invalid environment variables:\n${z.prettifyError(parsed.error)}`
  )
}

export const env = parsed.data
export type Env = z.infer<typeof serverEnvSchema>

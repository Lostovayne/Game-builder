import { task } from "@trigger.dev/sdk"

// Verification task from the Trigger.dev Sentry guide
// (docs/guides/examples/sentry-error-tracking): run it with an empty payload
// from the dashboard's Test page (or trigger it directly) and confirm the
// failure lands in Sentry. It only fails when invoked on purpose.
export const sentryErrorTest = task({
  id: "sentry-error-test",
  retry: {
    // Only retry once, so the failure reaches the global onFailure hook fast
    maxAttempts: 1,
  },
  run: async () => {
    const error = new Error("This is a custom error that Sentry will capture")
    error.cause = { additionalContext: "This is additional context" }
    throw error
  },
})

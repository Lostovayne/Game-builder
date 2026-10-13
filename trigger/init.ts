import * as Sentry from "@sentry/node"
import { tasks } from "@trigger.dev/sdk"

// The Trigger.dev worker is a separate runtime from the Next.js app (which
// inits Sentry in sentry.server.config.ts / sentry.edge.config.ts /
// instrumentation-client.ts), so it gets its own init here. Same project DSN
// as those configs; this file is auto-loaded when tasks execute.
Sentry.init({
  // Only core SDK plumbing (scope, transport, captureException) is active —
  // no default integrations, so the worker's HTTP/tracing layers stay free of
  // Sentry's own instrumentation.
  defaultIntegrations: false,
  dsn: "https://1d3c75c4e03724f923963ee1e0bc55ce@o4508422392774656.ingest.us.sentry.io/4512240241213440",
  environment:
    process.env.NODE_ENV === "production" ? "production" : "development",
})

// Global lifecycle hook: fires when a run is terminally failed (final retry
// attempt exhausted), for every task in the project.
tasks.onFailure(({ payload, error, ctx }) => {
  Sentry.captureException(error, {
    extra: {
      payload,
      ctx,
    },
  })
})

import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: "https://1d3c75c4e03724f923963ee1e0bc55ce@o4508422392774656.ingest.us.sentry.io/4512240241213440",
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Replay runs only in the browser, so this lives solely in the client init.
  // Every session that errors is replayed; healthy sessions are sampled at 10%
  // in production (all of them in development, per the SDK testing tip).
  // Defaults mask all text and block media, so DOM contents stay redacted.
  replaysSessionSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    // Same `node`-vs-`browser` resolution false positive as the export below:
    // oxlint resolves `@sentry/nextjs` by its `node` condition, where these
    // browser-only integrations are absent, but `instrumentation-client.ts`
    // always bundles for the browser and they resolve at build time.
    // oxlint-disable-next-line import/namespace
    Sentry.replayIntegration(),
    // Capture console.warn/console.error as structured Sentry logs with their
    // arguments as queryable attributes; the calls still print locally.
    Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] }),
  ],

  dataCollection: {
    // Browser fetch spans carry the same prompt payloads as the server spans.
    httpBodies: [],
  },
})

// oxlint resolves `@sentry/nextjs` by its `node` condition (`index.server.js`),
// where this browser-only helper is absent. The `browser` condition
// (`index.client.js`) exports it, and `instrumentation-client.ts` is always
// bundled for the browser, so this resolves correctly at build time.
// oxlint-disable-next-line import/namespace
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart

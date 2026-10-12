import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: "https://1d3c75c4e03724f923963ee1e0bc55ce@o4508422392774656.ingest.us.sentry.io/4512240241213440",
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
})

// oxlint resolves `@sentry/nextjs` by its `node` condition (`index.server.js`),
// where this browser-only helper is absent. The `browser` condition
// (`index.client.js`) exports it, and `instrumentation-client.ts` is always
// bundled for the browser, so this resolves correctly at build time.
// oxlint-disable-next-line import/namespace
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart

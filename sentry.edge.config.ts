// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: "https://1d3c75c4e03724f923963ee1e0bc55ce@o4508422392774656.ingest.us.sentry.io/4512240241213440",

  // 100% in development for debugging; 10% in production to keep the bill and
  // the request overhead sane.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  integrations: [
    // Capture console.warn/console.error as structured Sentry logs with their
    // arguments as queryable attributes; the calls still print locally.
    Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] }),
  ],

  dataCollection: {
    // Prompts and game source flow through this app's request bodies, so they
    // stay out of Sentry. Everything else uses the permissive defaults.
    httpBodies: [],
  },
})

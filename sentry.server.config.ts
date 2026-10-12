import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: "https://1d3c75c4e03724f923963ee1e0bc55ce@o4508422392774656.ingest.us.sentry.io/4512240241213440",
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
})

import { withSentryConfig } from "@sentry/nextjs/config"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  devIndicators: false,
}

export default withSentryConfig(nextConfig, {
  org: "khalest",
  project: "sandbox",

  // Upload source maps for readable stack traces.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Route Sentry requests through our server (avoids ad-blockers).
  tunnelRoute: "/sentry-tunnel",

  silent: !process.env.CI,
})

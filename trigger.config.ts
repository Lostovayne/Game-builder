import { additionalFiles } from "@trigger.dev/build/extensions/core"
import { defineConfig } from "@trigger.dev/sdk"

export default defineConfig({
  project: "proj_lgkwxiczjplqdfgdsdpf",
  runtime: "node-24",
  logLevel: "log",
  // The max compute seconds a task is allowed to run. If the task run exceeds this duration,
  // it will be stopped.
  // You can override this on an individual task.
  // See https://trigger.dev/docs/runs/max-duration
  maxDuration: 3600,
  // The seeded game runtime is read from disk with `process.cwd()` at run
  // time, so the worker must run from the build directory (matching deploy)
  // rather than the project root. See the `additionalFiles` extension below.
  legacyDevProcessCwdBehaviour: false,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["trigger"],
  build: {
    conditions: ["react-server"],
    // `lib/games/runtime/**` is read at runtime but never imported, so the
    // bundler would not pull it in. Copy it into the build preserving the
    // project-relative path that `createGameSandbox` resolves via cwd.
    extensions: [additionalFiles({ files: ["lib/games/runtime/**/*"] })],
  },
})

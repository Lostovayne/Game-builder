import path from "node:path"
import { fileURLToPath } from "node:url"
import { configDefaults, defineConfig } from "vitest/config"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: [...configDefaults.exclude, ".next/**"],
  },
})

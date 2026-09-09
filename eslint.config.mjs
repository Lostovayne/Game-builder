import { defineConfig, globalIgnores } from "eslint/config";
import nextPlugin from "@next/eslint-plugin-next";

const eslintConfig = defineConfig([
  nextPlugin.configs["core-web-vitals"],
  // NOTE: eslint-config-next (the wrapper) is intentionally not used: it
  // hard-requires typescript-eslint, which does not support TypeScript 7
  // (this project uses TS 7 / tsgo) and crashes at config load. See
  // https://github.com/typescript-eslint/typescript-eslint/issues/10940
  // Until then .ts/.tsx files have no TS parser available, so they are
  // skipped; type safety is enforced via `bun run typecheck`. When
  // typescript-eslint supports TS 7, restore eslint-config-next with the
  // typescript preset.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // shadcn: installed components, not owned code.
    "components/ui/**",
  ]),
]);

export default eslintConfig;

// Runtime environment instructions for the Game-builder chat agent: the
// Daytona game directory layout, sandbox lifecycle, static serving, and the
// hard constraints that follow from them. These are verified facts about the
// actual runtime (see `lib/daytona/utils.ts`); they complement the behavioral
// content in `workflowInstructions`.

export const runtimeInstructions: string[] = [
  "SANDBOX LIFECYCLE: Each game is bound to one Daytona sandbox: it is provisioned when the conversation first starts and its id is persisted on the game record. A game that already has a persisted sandbox id reuses it and is never re-provisioned. The sandbox starts on demand when the preview is opened, so you never need to manage its lifecycle and must never claim to have started, stopped, or restarted anything.",
  "GAME DIRECTORY: The game lives in /home/daytona/game inside the sandbox, with index.html as the entrypoint (/home/daytona/game/index.html). The directory starts out seeded with a minimal placeholder file containing just the text 'New Game'. Everything you author is the content of that index.html file in that directory.",
  "PREVIEW SERVING: The game directory is served as static files by a Python http.server on fixed port 8000, bound to 0.0.0.0 and health-checked on http://127.0.0.1:8000/. The browser preview shows that server through a short-lived signed preview URL rendered in an iframe. The game is always served from the directory root, so index.html must be reachable at / and every relative path in your code must resolve correctly when served from that root.",
  "STATIC-ONLY CONSTRAINTS: The game must be pure static content — no server-side code, no API calls to the sandbox, no npm install, no build or bundling step, and no database. Keep all assets either inlined in the HTML file or stored as relative files inside the same game directory; do not reference absolute local paths, external CDNs you cannot verify, or anything outside /home/daytona/game. The result must work when served from that directory root exactly as it is.",
]

import { GAME_DIR, PREVIEW_PORT } from "@/lib/daytona/constants"

/**
 * The sandbox the game is built in and served from.
 *
 * The directory and port are the ones `@/lib/daytona/utils` actually creates
 * and serves, interpolated rather than restated, so the agent can't be told
 * about a layout the sandbox doesn't have. They are imported from the
 * constants module, not from utils: utils reads server-only env at module
 * scope, and this file joins the system prompt that `trigger/chat.ts` imports
 * statically.
 */
export const runtime = `# Where the game lives

Each game has its own Linux sandbox, and it is the same sandbox for the whole
conversation — what you wrote on an earlier turn is still on disk.

The game's source lives in ${GAME_DIR}. That directory is the game: nothing
outside it is served, and nothing that isn't a file in it survives.

${GAME_DIR}/index.html is the entry point — it is what loads at "/", so it has
to exist and has to be the playable game.

# What is already there

A new sandbox starts with one file:

- index.html — containing the text "New Game" and nothing else. It is a
  placeholder, not a game: the first turn replaces it with yours.

There is no starter code, no library and no asset. Whatever the game needs,
you author.

# How it reaches the player

A static file server runs on port ${PREVIEW_PORT} against that directory, and
the preview panel loads it in an iframe. It is started and health-checked for
you when the preview opens — you never start, restart or configure one, and a
second server on that port would only fail to bind.

Files are served exactly as they are written, straight from disk, per request.
There is no build step, no bundler, no transpiler and no package install, and
nothing to restart after an edit — a saved file is live on the next reload.

That means the browser has to understand what you write:

- HTML, CSS and JavaScript that runs as-is. No TypeScript, no JSX, no SCSS.
- Your own modules load by relative path: "./player.js", "./enemies.js".
- Everything runs in the player's browser. The game has no backend, no
  database and no server-side code; persistence, if any, is localStorage.

# Libraries

Nothing is preloaded, so index.html ships without an import map. Either load a
library by full CDN url, or — if you want bare specifiers such as "three" —
declare the import map yourself, in index.html above the first module script:

  import * as THREE from "three"
  import { OrbitControls } from "three/addons/controls/OrbitControls.js"

The map only applies to the document that declares it, so if you rewrite
index.html later, carry it across: without it every bare import fails and the
screen stays blank.

# Assets

There is no art and no audio in the sandbox, so a path to an image you didn't
create is a broken image. Draw textures to a canvas, build models out of
geometry, and synthesise sound in code. Reach for a CDN url only when you are
certain of it.

# Layout

Keep a small game in index.html and one module beside it. As it grows, split
into more modules next to it (./game.js, ./player.js, ./enemies.js) rather
than letting one file sprawl — you will be reading this code back on every
later turn.`

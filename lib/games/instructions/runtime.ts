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
outside it is served, and nothing that isn't a file in it survives. The kit
shipped inside it (\`engine/\` and the welcome \`index.html\`) is part of your
game directory too — yours to use, edit and replace.

${GAME_DIR}/index.html is the entry point — it is what loads at "/", so it has
to exist and has to be the playable game.

# What is already there

A new sandbox starts with a working kit, not an empty file:

- index.html — a welcome page that loads Three.js and renders a rotating
  cube. It is a demo of the kit, not a game: the first turn replaces it
  with yours.
- engine/ — the game engine kit: plain-ESM Three.js modules for the loop,
  input, HUD, sound, models, textures, materials, lighting, particles,
  animation, physics and camera. The next section catalogues it.

There are no assets — no images, no audio files, no models on disk. Whatever
the game needs beyond the kit, you author.

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

Three.js is preloaded: index.html ships an import map that resolves the bare
"three" specifier (and "three/addons/"), so this works as written:

  import * as THREE from "three"
  import { OrbitControls } from "three/addons/controls/OrbitControls.js"

The map only applies to the document that declares it, so if you rewrite
index.html later, carry it across: without it every bare import fails and the
screen stays blank. Any other library still has to be a full CDN url — there
is no package install in the sandbox.

# Assets

There is no art and no audio in the sandbox — the kit draws textures to a
canvas, builds models out of geometry and synthesises sound in code (see the
engine kit section), and anything beyond that you author the same way. So a
path to an image you didn't create is a broken image. Reach for a CDN url
only when you are certain of it.

# Layout

Keep a small game in index.html and one module beside it. As it grows, split
into more modules next to it (./game.js, ./player.js, ./enemies.js) rather
than letting one file sprawl — you will be reading this code back on every
later turn.`

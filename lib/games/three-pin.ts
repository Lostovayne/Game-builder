/**
 * The three.js release the engine kit is built against — `engine/engine.js`
 * uses APIs that older releases do not have (`THREE.Timer` needs r165+), so
 * a game whose import map pins another version crashes at init and the
 * preview stays black.
 *
 * `lib/games/runtime/index.html` is the source of truth: the drift-guard
 * test in three-pin.test.ts fails if this constant and that file ever
 * disagree, so bump both together.
 */
export const THREE_PIN = "0.186.1"

/**
 * Rewrites every `three@<version-or-tag>` reference in an HTML file to the
 * pinned release. Applied by write_file and replace_text whenever the target
 * is an index.html: the model authors that file from memory and reliably
 * invents a stale version (`three@0.160.0`, `three@latest`), which breaks
 * the kit's engine. Files without three references come back untouched.
 */
export function pinThreeImportmap(html: string): string {
  return html.replace(/\bthree@[^/"'\s]+/g, `three@${THREE_PIN}`)
}

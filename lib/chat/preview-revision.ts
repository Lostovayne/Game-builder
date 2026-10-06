/**
 * Stable identity for the preview iframe.
 *
 * Daytona keeps the same signed preview URL across game updates, so reloading
 * by `src` alone never remounts the iframe: the browser sees an identical
 * source and leaves the current document in place. Feeding a revision into the
 * element `key` forces React to mount a fresh iframe on each new revision —
 * re-issuing the request to the same URL and thus fetching the latest files.
 *
 * The revision is deliberately not part of the URL, so the value passed as
 * `src` stays byte-identical across revisions.
 */
export function previewFrameKey(url: string, revision: number): string {
  return `${url}#${revision}`
}

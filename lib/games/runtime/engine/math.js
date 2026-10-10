// Pure numeric helpers for the seeded game runtime.
//
// This module imports nothing on purpose: it must run unchanged in the browser,
// under Vitest in node, and inside a sandbox that ships with no build step. Its
// export names are frozen by the feature contract (odd/tasks/game-engine-kit.md,
// "Shared dependency"), so every other kit module imports these and nothing else
// from another unit.

const TAU = Math.PI * 2;

// Easing constants, module-private.
const BACK_C1 = 1.70158;
const BACK_C3 = BACK_C1 + 1;
const ELASTIC_C4 = (2 * Math.PI) / 3;
const BOUNCE_N1 = 7.5625;
const BOUNCE_D1 = 2.75;

/**
 * Constrains a value to an inclusive range.
 *
 * @param {number} v Value to constrain.
 * @param {number} min Lower bound, inclusive.
 * @param {number} max Upper bound, inclusive.
 * @returns {number} `v` limited to `[min, max]`.
 */
export function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

/**
 * Linear interpolation from `a` to `b` by a factor `t`.
 *
 * @param {number} a Start value, returned at `t = 0`.
 * @param {number} b End value, returned at `t = 1`.
 * @param {number} t Interpolation factor; values outside `[0, 1]` extrapolate.
 * @returns {number} The interpolated value.
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Inverse of `lerp`: where a value sits inside a range, as a 0..1 factor.
 *
 * @param {number} a Range start.
 * @param {number} b Range end.
 * @param {number} v Value to locate inside the range.
 * @returns {number} The factor `t` with `lerp(a, b, t) === v` (unclamped;
 *   `NaN` when the range is empty because `a === b`).
 */
export function invLerp(a, b, v) {
  return (v - a) / (b - a);
}

/**
 * Maps a value from one range onto another, preserving its relative position.
 *
 * @param {number} v Value in the source range.
 * @param {number} a1 Source range start.
 * @param {number} a2 Source range end.
 * @param {number} b1 Target range start.
 * @param {number} b2 Target range end.
 * @returns {number} The value expressed in the target range.
 */
export function mapLinear(v, a1, a2, b1, b2) {
  return b1 + ((v - a1) * (b2 - b1)) / (a2 - a1);
}

/**
 * Frame-rate independent exponential smoothing towards a target.
 *
 * Evaluates `a + (b - a) * (1 - e^(-lambda * dt))`, so two half steps land on
 * exactly the same value as one full step (movement speed does not change with
 * the display refresh rate) and the result approaches `b` without ever
 * overshooting it.
 *
 * @param {number} a Current value.
 * @param {number} b Target value.
 * @param {number} lambda Smoothing rate; higher converges faster (roughly per second).
 * @param {number} dt Elapsed time for this step, in seconds.
 * @returns {number} The new value, moved part of the way towards `b`.
 */
export function damp(a, b, lambda, dt) {
  return a + (b - a) * (1 - Math.exp(-lambda * dt));
}

/**
 * Moves a value towards a target at a bounded speed, never overshooting it.
 *
 * @param {number} a Current value.
 * @param {number} b Target value.
 * @param {number} maxDelta Largest allowed change in one call; treated as `0` when negative.
 * @returns {number} `b` when it is within reach, otherwise `a` shifted by `maxDelta`.
 */
export function moveTowards(a, b, maxDelta) {
  const delta = b - a;
  const step = maxDelta > 0 ? maxDelta : 0;
  if (Math.abs(delta) <= step) return b;
  return a + Math.sign(delta) * step;
}

/**
 * Wraps a value into the half-open range `[min, max)`.
 *
 * @param {number} v Value to wrap.
 * @param {number} min Range start, inclusive.
 * @param {number} max Range end, exclusive; must differ from `min`.
 * @returns {number} The wrapped value; `min` when the range is empty (`max === min`).
 */
export function wrap(v, min, max) {
  const range = max - min;
  if (range === 0) return min;
  const offset = (v - min) % range;
  return (offset < 0 ? offset + range : offset) + min;
}

/**
 * Hermite smoothstep: 0 below the low edge, 1 above the high edge, with a
 * smooth S-shaped ramp in between.
 *
 * @param {number} edge0 Lower edge; the result is 0 at or below it.
 * @param {number} edge1 Upper edge; the result is 1 at or above it.
 * @param {number} x Value to evaluate.
 * @returns {number} The smoothed value in `[0, 1]`.
 */
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Converts an angle from degrees to radians.
 *
 * @param {number} d Angle in degrees.
 * @returns {number} The same angle in radians.
 */
export function degToRad(d) {
  return (d * Math.PI) / 180;
}

/**
 * Converts an angle from radians to degrees.
 *
 * @param {number} r Angle in radians.
 * @returns {number} The same angle in degrees.
 */
export function radToDeg(r) {
  return (r * 180) / Math.PI;
}

/**
 * Shortest signed difference between two angles, in radians.
 *
 * The naive `b - a` takes the long way round across the `-PI / PI` seam; this
 * folds the result into `(-PI, PI]` instead, so it is always the short arc.
 *
 * @param {number} a Angle to subtract, in radians.
 * @param {number} b Angle to subtract from, in radians.
 * @returns {number} The signed difference in `(-PI, PI]`; positive means `b` is
 *   counter-clockwise from `a`.
 */
export function angleDelta(a, b) {
  return wrapAngle(b - a);
}

/**
 * Interpolates along the shortest arc between two angles.
 *
 * @param {number} a Start angle, in radians.
 * @param {number} b End angle, in radians.
 * @param {number} t Interpolation factor; values outside `[0, 1]` extrapolate
 *   along the short arc instead of wrapping the long way.
 * @returns {number} The angle at `t`, wrapped into `(-PI, PI]`.
 */
export function angleLerp(a, b, t) {
  return wrapAngle(a + angleDelta(a, b) * t);
}

/**
 * Applies a named easing curve to a normalized time.
 *
 * `t` is clamped to `[0, 1]` first, so an over-running tween eases out instead
 * of extrapolating past the curve.
 *
 * @param {string} name Easing name; must be a key of `easings` — `linear`,
 *   `quadIn`, `quadOut`, `quadInOut`, `cubicIn`, `cubicOut`, `cubicInOut`,
 *   `sineInOut`, `expoOut`, `circOut`, `backOut`, `elasticOut`, `bounceOut`.
 * @param {number} t Normalized time, clamped to `[0, 1]`.
 * @returns {number} The eased value in the curve's output range.
 * @throws {Error} When `name` is not a documented easing; the message lists
 *   every valid name so the typo can be fixed immediately.
 */
export function ease(name, t) {
  const easing = easings[name];
  if (typeof easing !== "function") {
    throw new Error(
      `ease(name, t): unknown easing "${name}". Use one of: ${Object.keys(easings).join(", ")}.`,
    );
  }
  return easing(clamp(t, 0, 1));
}

/**
 * The frozen catalogue of easing curves the kit publishes to the game agent.
 *
 * Each entry takes normalized time `t` in `[0, 1]` and returns the eased
 * progress. `backOut`, `elasticOut` and `bounceOut` overshoot or bounce on the
 * way; the rest are monotonic. Call them through `ease(name, t)` when `t` may
 * fall outside `[0, 1]`, because the raw curves do not clamp.
 *
 * @type {Record<string, (t: number) => number>}
 */
export const easings = {
  linear: (t) => t,
  quadIn: (t) => t * t,
  quadOut: (t) => 1 - (1 - t) * (1 - t),
  quadInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  cubicIn: (t) => t * t * t,
  cubicOut: (t) => 1 - Math.pow(1 - t, 3),
  cubicInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  sineInOut: (t) => (1 - Math.cos(Math.PI * t)) / 2,
  expoOut: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  circOut: (t) => Math.sqrt(1 - Math.pow(t - 1, 2)),
  backOut: (t) => 1 + BACK_C3 * Math.pow(t - 1, 3) + BACK_C1 * Math.pow(t - 1, 2),
  elasticOut: (t) =>
    t === 0 || t === 1
      ? t
      : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ELASTIC_C4) + 1,
  // Penner's bounce: four parabolic arcs whose dips shrink by 1/4 each time
  // (0.75, 0.9375, 0.984375), so the curve is continuous and lands on exactly 1.
  bounceOut: (t) => {
    if (t < 1 / BOUNCE_D1) return BOUNCE_N1 * t * t;
    if (t < 2 / BOUNCE_D1) return BOUNCE_N1 * Math.pow(t - 1.5 / BOUNCE_D1, 2) + 0.75;
    if (t < 2.5 / BOUNCE_D1) return BOUNCE_N1 * Math.pow(t - 2.25 / BOUNCE_D1, 2) + 0.9375;
    return BOUNCE_N1 * Math.pow(t - 2.625 / BOUNCE_D1, 2) + 0.984375;
  },
};

/**
 * Creates a small deterministic pseudo-random generator (mulberry32).
 *
 * The same seed always replays the same sequence, so a level, a particle burst
 * or a shuffle looks identical across reloads and machines.
 *
 * @param {number|string} seed Seed for the generator. Numbers are used
 *   directly; strings are hashed (FNV-1a) into a 32-bit integer first.
 * @returns {{
 *   int: (min: number, max: number) => number,
 *   float: (min: number, max: number) => number,
 *   range: (min: number, max: number) => number,
 *   pick: <T>(array: T[]) => T | undefined,
 *   bool: () => boolean,
 *   shuffle: <T>(array: T[]) => T[],
 * }} rng — members:
 *   `int(min, max)` integer in `[min, max]`, both inclusive;
 *   `float(min, max)` float in `[min, max)`;
 *   `range(min, max)` alias of `float`;
 *   `pick(array)` a random member of `array` (never a member it does not have;
 *   `undefined` only when the array is empty);
 *   `bool()` `true` or `false` with equal chance;
 *   `shuffle(array)` a shuffled copy in a new array — the input is never modified.
 */
export function createRng(seed) {
  let state = hashSeed(seed);

  // mulberry32: one 32-bit integer of state, uniform output in [0, 1).
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const float = (min, max) => min + next() * (max - min);

  return {
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    float,
    range: float,
    pick: (array) =>
      array.length > 0 ? array[Math.floor(next() * array.length)] : undefined,
    bool: () => next() < 0.5,
    shuffle: (array) => {
      const copy = array.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const swap = copy[i];
        copy[i] = copy[j];
        copy[j] = swap;
      }
      return copy;
    },
  };
}

/**
 * Folds an angle into `(-PI, PI]`, taking the short way round the circle.
 *
 * @param {number} r Angle in radians.
 * @returns {number} The equivalent angle inside `(-PI, PI]`.
 */
function wrapAngle(r) {
  const wrapped = r % TAU;
  if (wrapped <= -Math.PI) return wrapped + TAU;
  if (wrapped > Math.PI) return wrapped - TAU;
  return wrapped;
}

/**
 * Turns any supported seed into an integer the generator can start from.
 *
 * @param {number|string} seed Caller-supplied seed.
 * @returns {number} A 32-bit integer derived from `seed`.
 */
function hashSeed(seed) {
  if (typeof seed === "number") return Math.trunc(seed);
  const text = String(seed);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

import * as THREE from "three";

/**
 * Light rigs: a preset builds a key/fill/rim/ambient set into a scene, and the
 * individual helpers expose each light on its own.
 *
 * Directional lights aim at the world origin; move `light.position` freely and,
 * to aim somewhere else, set `light.target.position` and add `light.target` to
 * the scene yourself.
 *
 * Presets (frozen): `"day"`, `"night"`, `"sunset"`, `"studio"`, `"flat"`,
 * `"neon"`, `"underwater"`, `"horror"`.
 * @module engine/lighting
 */

/** Finite-number option lookup with a fallback default. */
function num(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Resolve a colour argument with a default. */
function colorOr(color, fallback) {
  return color === undefined || color === null ? fallback : color;
}

/** Finite-number coercion used when reading vector options. */
function toN(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Read a position given as `[x, y, z]` or `{ x, y, z }`, else `fallback`. */
function toVec(v, fallback) {
  if (Array.isArray(v) && v.length >= 3) return [toN(v[0]), toN(v[1]), toN(v[2])];
  if (v && typeof v === "object") return [toN(v.x), toN(v.y), toN(v.z)];
  return fallback;
}

/**
 * Frozen preset table. `animate` selects the per-frame effect run by
 * `createLighting(...).update(dt)`: `"neon"` cycles the accent point lights,
 * `"sway"` drifts the key light (underwater caustics), `flicker` strobes the
 * flickering lights (horror).
 */
const PRESETS = {
  day: {
    ambient: { color: "#cfe6ff", intensity: 0.55 },
    key: { color: "#fff4d6", intensity: 2.4, position: [6, 12, 4] },
    fill: { color: "#bcd7ff", intensity: 0.7, position: [-7, 5, 6] },
    rim: { color: "#ffffff", intensity: 0.6, position: [-2, 6, -8] },
    shadows: true,
  },
  night: {
    ambient: { color: "#26375f", intensity: 0.45 },
    key: { color: "#9fbcff", intensity: 0.9, position: [-5, 9, -3] },
    fill: { color: "#3d5aa8", intensity: 0.4, position: [6, 4, 5] },
    rim: { color: "#79d7ff", intensity: 0.5, position: [0, 5, -7] },
    shadows: true,
  },
  sunset: {
    ambient: { color: "#ff9d6b", intensity: 0.5 },
    key: { color: "#ff7a2f", intensity: 2.2, position: [10, 3, 5] },
    fill: { color: "#6f86ff", intensity: 0.5, position: [-7, 5, -4] },
    rim: { color: "#ffd9a8", intensity: 1.0, position: [-4, 4, -9] },
    shadows: true,
  },
  studio: {
    ambient: { color: "#ffffff", intensity: 0.35 },
    key: { color: "#ffffff", intensity: 2.0, position: [5, 8, 6] },
    fill: { color: "#ffffff", intensity: 0.8, position: [-7, 4, 5] },
    rim: { color: "#ffffff", intensity: 1.1, position: [0, 6, -8] },
    shadows: true,
  },
  flat: {
    ambient: { color: "#ffffff", intensity: 1.1 },
    key: { color: "#ffffff", intensity: 0.7, position: [0, 10, 6] },
    fill: { color: "#ffffff", intensity: 0.35, position: [0, 6, 10] },
    rim: { color: "#ffffff", intensity: 0.2, position: [0, 8, -10] },
    shadows: false,
  },
  neon: {
    ambient: { color: "#1b0033", intensity: 0.5 },
    key: { color: "#ff3ea5", intensity: 2.0, position: [6, 7, 4] },
    fill: { color: "#00e5ff", intensity: 1.4, position: [-6, 5, -3] },
    rim: { color: "#8b5cf6", intensity: 1.2, position: [0, 4, -8] },
    extras: [
      { color: "#ff2fb9", intensity: 14, distance: 24, position: [5, 3, 5] },
      { color: "#25f4ff", intensity: 14, distance: 24, position: [-5, 3, -4] },
    ],
    animate: "neon",
    shadows: false,
  },
  underwater: {
    ambient: { color: "#0b5c7a", intensity: 0.8 },
    key: { color: "#7fe9ff", intensity: 1.6, position: [4, 12, 3] },
    fill: { color: "#0a6f9e", intensity: 0.6, position: [-5, 6, 5] },
    rim: { color: "#a5f0ff", intensity: 0.7, position: [0, 5, -7] },
    animate: "sway",
    shadows: true,
  },
  horror: {
    ambient: { color: "#141428", intensity: 0.22 },
    key: { color: "#c9d6ff", intensity: 0.75, position: [4, 7, 3] },
    fill: { color: "#4a1f1f", intensity: 0.3, position: [-5, 3, 4] },
    rim: { color: "#ff4b2b", intensity: 0.5, position: [-2, 4, -7] },
    extras: [{ color: "#ffb347", intensity: 7, distance: 16, position: [-2, 2.5, 2] }],
    flicker: true,
    shadows: true,
  },
};

/**
 * Ambient (unshadowed, directionless) fill light.
 * @param {object} [o] Options.
 * @param {string|number} [o.color="#ffffff"] Light colour, anything `THREE.Color` accepts.
 * @param {number} [o.intensity=0.5] Brightness.
 * @returns {THREE.AmbientLight} The ambient light (add it to a scene yourself).
 */
export function ambientLight(o = {}) {
  return new THREE.AmbientLight(colorOr(o.color, "#ffffff"), num(o.intensity, 0.5));
}

/**
 * Key light — the main directional light that shapes the scene and casts shadows.
 * @param {object} [o] Options.
 * @param {string|number} [o.color="#ffffff"] Light colour, anything `THREE.Color` accepts.
 * @param {number} [o.intensity=1.6] Brightness.
 * @param {number[]|object} [o.position=[5,10,5]] Position as `[x, y, z]` or `{ x, y, z }`.
 * @param {boolean} [o.shadows=false] Call `enableShadows` on this light (tuning keys such as `size` and `bounds` are forwarded).
 * @returns {THREE.DirectionalLight} The key light (aims at the world origin).
 */
export function keyLight(o = {}) {
  const light = new THREE.DirectionalLight(
    colorOr(o.color, "#ffffff"),
    num(o.intensity, 1.6),
  );
  const p = toVec(o.position, [5, 10, 5]);
  light.position.set(p[0], p[1], p[2]);
  if (o.shadows) enableShadows(light, o);
  return light;
}

/**
 * Fill light — a weaker directional light that lifts the shadows opposite the key.
 * @param {object} [o] Options.
 * @param {string|number} [o.color="#ffffff"] Light colour, anything `THREE.Color` accepts.
 * @param {number} [o.intensity=0.5] Brightness.
 * @param {number[]|object} [o.position=[-6,4,5]] Position as `[x, y, z]` or `{ x, y, z }`.
 * @param {boolean} [o.shadows=false] Call `enableShadows` on this light (tuning keys are forwarded).
 * @returns {THREE.DirectionalLight} The fill light (aims at the world origin).
 */
export function fillLight(o = {}) {
  const light = new THREE.DirectionalLight(
    colorOr(o.color, "#ffffff"),
    num(o.intensity, 0.5),
  );
  const p = toVec(o.position, [-6, 4, 5]);
  light.position.set(p[0], p[1], p[2]);
  if (o.shadows) enableShadows(light, o);
  return light;
}

/**
 * Rim (back) light — separates the subject from the background with a hairline highlight.
 * @param {object} [o] Options.
 * @param {string|number} [o.color="#ffffff"] Light colour, anything `THREE.Color` accepts.
 * @param {number} [o.intensity=0.6] Brightness.
 * @param {number[]|object} [o.position=[0,6,-8]] Position as `[x, y, z]` or `{ x, y, z }`.
 * @param {boolean} [o.shadows=false] Call `enableShadows` on this light (tuning keys are forwarded).
 * @returns {THREE.DirectionalLight} The rim light (aims at the world origin).
 */
export function rimLight(o = {}) {
  const light = new THREE.DirectionalLight(
    colorOr(o.color, "#ffffff"),
    num(o.intensity, 0.6),
  );
  const p = toVec(o.position, [0, 6, -8]);
  light.position.set(p[0], p[1], p[2]);
  if (o.shadows) enableShadows(light, o);
  return light;
}

/**
 * Hemisphere light — sky colour above, ground colour below; cheap outdoor ambient.
 * @param {object} [o] Options.
 * @param {string|number} [o.sky="#87ceeb"] Colour coming from above, anything `THREE.Color` accepts.
 * @param {string|number} [o.ground="#404040"] Colour bouncing from below.
 * @param {number} [o.intensity=0.6] Brightness.
 * @param {number[]|object} [o.position] Optional position as `[x, y, z]` or `{ x, y, z }`.
 * @returns {THREE.HemisphereLight} The hemisphere light (add it to a scene yourself).
 */
export function hemiLight(o = {}) {
  const light = new THREE.HemisphereLight(
    colorOr(o.sky, "#87ceeb"),
    colorOr(o.ground, "#404040"),
    num(o.intensity, 0.6),
  );
  if (o.position !== undefined) {
    const p = toVec(o.position, [0, 0, 0]);
    light.position.set(p[0], p[1], p[2]);
  }
  return light;
}

/**
 * Enable and tune shadow casting on a light.
 * @param {THREE.Light} light The light to configure (required).
 * @param {object} [o] Options.
 * @param {boolean} [o.cast=true] Set `false` to leave `castShadow` off while still applying tuning.
 * @param {number} [o.size=1024] Shadow map resolution (width and height).
 * @param {number} [o.bounds=20] Half-extent of the directional shadow frustum, in world units.
 * @param {number} [o.near=0.5] Shadow camera near plane.
 * @param {number} [o.far=80] Shadow camera far plane.
 * @param {number} [o.bias=-0.0005] Depth bias (raise toward 0 if shadows detach, lower if they acne).
 * @param {number} [o.normalBias=0.02] Normal bias (fixes shadow acne on curved surfaces).
 * @param {number} [o.radius] Blur radius (only affects `THREE.PCFSoftShadowMap`).
 * @returns {THREE.Light} The same light, for chaining.
 * @throws {Error} When `light` is missing — pass a light such as `keyLight()`.
 */
export function enableShadows(light, o = {}) {
  if (!light) {
    throw new Error(
      'enableShadows(light, o): "light" is required — pass a light, e.g. enableShadows(keyLight({ shadows: true }))',
    );
  }
  light.castShadow = o.cast !== false;
  if (!light.shadow) return light;
  const size = Math.max(256, 1 << Math.round(Math.log2(num(o.size, 1024))));
  if (light.shadow.map && light.shadow.map.width !== size) {
    light.shadow.map.dispose();
    light.shadow.map = null;
  }
  light.shadow.mapSize.set(size, size);
  light.shadow.bias = num(o.bias, -0.0005);
  light.shadow.normalBias = num(o.normalBias, 0.02);
  if (Number.isFinite(o.radius)) light.shadow.radius = o.radius;
  const cam = light.shadow.camera;
  if (light.isDirectionalLight) {
    const bounds = num(o.bounds, 20);
    cam.left = -bounds;
    cam.right = bounds;
    cam.top = bounds;
    cam.bottom = -bounds;
  }
  cam.near = num(o.near, 0.5);
  cam.far = num(o.far, 80);
  cam.updateProjectionMatrix();
  return light;
}

/**
 * Build a complete light rig and add it to `scene`.
 *
 * The rig owns four lights (`ambient`, `key`, `fill`, `rim`) plus any preset
 * extras, all listed in `all`. Shadow casting follows `o.shadows` unless the
 * preset opts out (see `"flat"` and `"neon"`); the renderer must have
 * `shadowMap.enabled` for shadows to appear.
 * @param {THREE.Scene} scene Scene to add the lights to (required).
 * @param {string} [preset="day"] One of `"day"`, `"night"`, `"sunset"`, `"studio"`, `"flat"`, `"neon"`, `"underwater"`, `"horror"`.
 * @param {object} [o] Options.
 * @param {boolean} [o.shadows=true] Allow the preset's key light to cast shadows (shadow tuning keys are forwarded to `enableShadows`).
 * @param {number} [o.intensity=1] Global intensity multiplier applied to every light.
 * @returns {{key: THREE.DirectionalLight, ambient: THREE.Light, fill: THREE.DirectionalLight, rim: THREE.DirectionalLight, all: THREE.Light[], set: function(string): object, setIntensity: function(number): object, update: function(number): void, dispose: function(): void}} The rig — `set(preset)` swaps every light for another preset, `setIntensity(k)` rescales them, `update(dt)` runs the preset animation (neon cycle, underwater sway, horror flicker) and `dispose()` removes and frees every light it added.
 * @throws {Error} When `scene` is missing or `preset` is unknown.
 */
export function createLighting(scene, preset = "day", o = {}) {
  if (!scene || typeof scene.add !== "function") {
    throw new Error(
      'createLighting(scene, preset): "scene" is required — pass the scene, e.g. createLighting(game.scene, "day")',
    );
  }
  const useShadows = o.shadows !== false;
  let scale = num(o.intensity, 1);
  let entries = [];
  let time = 0;
  let flicker = 1;
  let def = null;

  function applyIntensities() {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      entry.light.intensity = entry.base * scale * (entry.flickers ? flicker : 1);
    }
  }

  function build(next) {
    const spec = PRESETS[next];
    if (!spec) {
      throw new Error(
        `createLighting: unknown preset "${next}" — use one of ${Object.keys(PRESETS)
          .map((p) => `"${p}"`)
          .join(", ")}`,
      );
    }
    def = spec;
    entries = [];
    flicker = 1;
    const track = (light, config, flickers) => {
      const base = num(config.intensity, 1);
      light.intensity = base;
      scene.add(light);
      entries.push({ light, base, flickers: flickers === true });
      return light;
    };
    const ambient = track(ambientLight(spec.ambient), spec.ambient);
    const key = track(keyLight(spec.key), spec.key, spec.flicker === true);
    const fill = track(fillLight(spec.fill), spec.fill);
    const rim = track(rimLight(spec.rim), spec.rim);
    if (useShadows && spec.shadows !== false) enableShadows(key, o);
    const extras = [];
    for (const extra of spec.extras || []) {
      const light = new THREE.PointLight(
        colorOr(extra.color, "#ffffff"),
        1,
        num(extra.distance, 0),
        num(extra.decay, 2),
      );
      const p = toVec(extra.position, [0, 2, 0]);
      light.position.set(p[0], p[1], p[2]);
      extras.push(track(light, extra, spec.flicker === true));
    }
    rig.ambient = ambient;
    rig.key = key;
    rig.fill = fill;
    rig.rim = rim;
    rig.all = [ambient, key, fill, rim].concat(extras.map((e) => e.light));
    applyIntensities();
    if (spec.animate === "sway") {
      key.userData.basePosition = spec.key.position.slice();
    }
  }

  function teardown() {
    for (const entry of entries) {
      const light = entry.light;
      scene.remove(light);
      if (light.shadow && light.shadow.map) {
        light.shadow.map.dispose();
        light.shadow.map = null;
      }
      if (typeof light.dispose === "function") light.dispose();
    }
    entries = [];
    rig.all = [];
    rig.ambient = null;
    rig.key = null;
    rig.fill = null;
    rig.rim = null;
  }

  const rig = {
    ambient: null,
    key: null,
    fill: null,
    rim: null,
    all: [],
    /**
     * Replace the whole rig with another preset.
     * @param {string} next Preset name (same list as `createLighting`).
     * @returns {object} The rig, for chaining.
     */
    set(next) {
      teardown();
      build(next);
      return rig;
    },
    /**
     * Rescale every light of the current preset.
     * @param {number} k Multiplier applied to each light's base intensity (1 = preset defaults).
     * @returns {object} The rig, for chaining.
     */
    setIntensity(k) {
      scale = num(k, 1);
      applyIntensities();
      return rig;
    },
    /**
     * Run the preset animation; harmless to call for presets without one.
     * @param {number} dt Elapsed time since the previous frame, in seconds.
     * @returns {void}
     */
    update(dt) {
      const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
      time += step;
      if (!def) return;
      if (def.flicker) {
        if (step > 0) {
          if (Math.random() < step * 8) flicker = 0.45 + Math.random() * 0.65;
          else flicker += (1 - flicker) * Math.min(1, step * 6);
        }
        applyIntensities();
      }
      if (def.animate === "neon") {
        let index = 0;
        for (let i = 4; i < rig.all.length; i++) {
          rig.all[i].color.setHSL((time * 0.12 + index * 0.45) % 1, 1, 0.55);
          index++;
        }
      }
      if (def.animate === "sway" && rig.key) {
        const base = rig.key.userData.basePosition || def.key.position;
        rig.key.position.set(
          base[0] + Math.sin(time * 0.6) * 1.6,
          base[1] + Math.sin(time * 0.45) * 0.8,
          base[2] + Math.cos(time * 0.5) * 1.6,
        );
      }
    },
    /**
     * Remove every light this rig added and release its shadow maps.
     * @returns {void}
     */
    dispose() {
      teardown();
      def = null;
    },
  };

  build(preset);
  return rig;
}

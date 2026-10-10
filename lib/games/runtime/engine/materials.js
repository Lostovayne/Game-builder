import * as THREE from "three";

/**
 * Material presets: one call returns a ready-to-use `THREE.Material`.
 *
 * Every factory has the signature `preset(color, o = {})`. `color` accepts
 * anything `THREE.Color` accepts (`"#EA580C"`, `0xEA580C`, `"red"`, a
 * `THREE.Color`), and a single options object may be passed instead of the
 * colour (`matte({ color: "#EA580C", roughness: 0.5 })`).
 *
 * Common options (valid on every preset): `map`, `alphaMap`, `transparent`,
 * `opacity`, `side`, `depthWrite`, `depthTest`, `blending`, `alphaTest`,
 * `fog`, `toneMapped`, `visible`, `wireframe`, `vertexColors`. Lit presets
 * (everything except `unlit`) also accept `flatShading`, `normalMap`,
 * `bumpMap`, `displacementMap`, `emissiveMap`, `lightMap` and `aoMap`.
 * Unknown keys are ignored.
 * @module engine/materials
 */

/** Options valid on every material type this module creates. */
const BASE_KEYS = [
  "map",
  "alphaMap",
  "transparent",
  "opacity",
  "side",
  "depthWrite",
  "depthTest",
  "blending",
  "alphaTest",
  "fog",
  "toneMapped",
  "visible",
  "wireframe",
  "vertexColors",
];

/** Options additionally valid on lit (lighting-aware) materials. */
const LIT_KEYS = [
  "flatShading",
  "normalMap",
  "bumpMap",
  "displacementMap",
  "emissiveMap",
  "lightMap",
  "aoMap",
];

/** Options additionally valid on physically based materials. */
const PBR_KEYS = ["roughnessMap", "metalnessMap", "envMap", "envMapIntensity"];

/** Texture slots `disposeMaterial` releases (envMap is excluded: usually shared). */
const MAP_KEYS = [
  "map",
  "alphaMap",
  "lightMap",
  "aoMap",
  "emissiveMap",
  "bumpMap",
  "normalMap",
  "displacementMap",
  "roughnessMap",
  "metalnessMap",
  "specularMap",
  "gradientMap",
  "clearcoatMap",
  "clearcoatNormalMap",
  "clearcoatRoughnessMap",
  "transmissionMap",
  "thicknessMap",
  "sheenColorMap",
  "sheenRoughnessMap",
  "specularColorMap",
  "specularIntensityMap",
  "iridescenceMap",
  "iridescenceThicknessMap",
  "anisotropyMap",
];

/** Pick the allowed shared option keys out of `o`, ignoring anything unknown. */
function pick(o, keys) {
  const props = {};
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (o[key] !== undefined) props[key] = o[key];
  }
  return props;
}

/** Finite-number option lookup with a fallback default. */
function num(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Normalise the `(color, o)` pair so both `preset(color, o)` and
 * `preset({ ...options })` work. Returns `[color, options]`.
 */
function splitArgs(color, o) {
  if (
    color !== null &&
    typeof color === "object" &&
    color.isColor !== true &&
    o === undefined
  ) {
    return [color.color, color];
  }
  return [color, o === undefined ? {} : o];
}

/** Resolve the colour argument with a preset-specific default. */
function colorOr(color, fallback) {
  return color === undefined || color === null ? fallback : color;
}

/** Build the stepped gradient ramp used by `toon()`. */
function makeGradientMap() {
  const shades = new Uint8Array([64, 140, 217, 255]);
  const ramp = new THREE.DataTexture(shades, shades.length, 1, THREE.RedFormat);
  ramp.minFilter = THREE.NearestFilter;
  ramp.magFilter = THREE.NearestFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  return ramp;
}

/**
 * Matte (fully diffuse, non-metallic) PBR material.
 * @param {string|number|THREE.Color} [color="#ffffff"] Surface colour, anything `THREE.Color` accepts.
 * @param {object} [o] Options.
 * @param {number} [o.roughness=1] Surface roughness, 0 (mirror) to 1 (matte).
 * @param {number} [o.metalness=0] Metallic fraction, 0 to 1.
 * @param {string|number} [o.color] Colour given through the options object instead.
 * @param {...object} [o] Any common option listed in the module docs.
 * @returns {THREE.MeshStandardMaterial} The matte material.
 */
export function matte(color, o) {
  const [c, opts] = splitArgs(color, o);
  return new THREE.MeshStandardMaterial({
    color: colorOr(c, "#ffffff"),
    roughness: num(opts.roughness, 1),
    metalness: num(opts.metalness, 0),
    ...pick(opts, BASE_KEYS.concat(LIT_KEYS, PBR_KEYS)),
  });
}

/**
 * Cel-shaded (banded) toon material with a built-in four-step ramp.
 * @param {string|number|THREE.Color} [color="#ffffff"] Surface colour, anything `THREE.Color` accepts.
 * @param {object} [o] Options.
 * @param {THREE.Texture} [o.gradientMap] Custom banding ramp; a built-in stepped ramp is used when omitted.
 * @param {string|number} [o.color] Colour given through the options object instead.
 * @param {...object} [o] Any common option listed in the module docs.
 * @returns {THREE.MeshToonMaterial} The toon material (its `gradientMap` is released by `disposeMaterial`).
 */
export function toon(color, o) {
  const [c, opts] = splitArgs(color, o);
  return new THREE.MeshToonMaterial({
    color: colorOr(c, "#ffffff"),
    gradientMap: opts.gradientMap || makeGradientMap(),
    ...pick(opts, BASE_KEYS.concat(LIT_KEYS)),
  });
}

/**
 * Shiny (glossy) PBR material — polished plastic, lacquer, wet surfaces.
 * @param {string|number|THREE.Color} [color="#ffffff"] Surface colour, anything `THREE.Color` accepts.
 * @param {object} [o] Options.
 * @param {number} [o.roughness=0.15] Surface roughness, 0 (mirror) to 1 (matte).
 * @param {number} [o.metalness=0.1] Metallic fraction, 0 to 1.
 * @param {string|number} [o.color] Colour given through the options object instead.
 * @param {...object} [o] Any common option listed in the module docs.
 * @returns {THREE.MeshStandardMaterial} The shiny material.
 */
export function shiny(color, o) {
  const [c, opts] = splitArgs(color, o);
  return new THREE.MeshStandardMaterial({
    color: colorOr(c, "#ffffff"),
    roughness: num(opts.roughness, 0.15),
    metalness: num(opts.metalness, 0.1),
    ...pick(opts, BASE_KEYS.concat(LIT_KEYS, PBR_KEYS)),
  });
}

/**
 * Transparent glass-like PBR material (clear-coated by default).
 * @param {string|number|THREE.Color} [color="#ffffff"] Tint colour, anything `THREE.Color` accepts.
 * @param {object} [o] Options.
 * @param {number} [o.opacity=0.35] Opacity when `transmission` is 0; ignored once transmission is used.
 * @param {number} [o.transmission=0] Refraction transmission, 0 to 1 (0 = cheap alpha blending, 1 = true glass).
 * @param {number} [o.roughness=0.08] Surface roughness.
 * @param {number} [o.thickness=0.5] Volume thickness used by transmission.
 * @param {number} [o.ior=1.45] Index of refraction.
 * @param {number} [o.clearcoat=1] Clear-coat layer strength (0 when transmitting).
 * @param {number} [o.clearcoatRoughness=0.1] Clear-coat roughness.
 * @param {string|number} [o.color] Colour given through the options object instead.
 * @param {...object} [o] Any common option listed in the module docs.
 * @returns {THREE.MeshPhysicalMaterial} The glass material.
 */
export function glass(color, o) {
  const [c, opts] = splitArgs(color, o);
  const transmission = num(opts.transmission, 0);
  return new THREE.MeshPhysicalMaterial({
    color: colorOr(c, "#ffffff"),
    transparent: true,
    opacity: num(opts.opacity, transmission > 0 ? 1 : 0.35),
    roughness: num(opts.roughness, 0.08),
    metalness: num(opts.metalness, 0),
    transmission,
    thickness: num(opts.thickness, 0.5),
    ior: num(opts.ior, 1.45),
    clearcoat: num(opts.clearcoat, transmission > 0 ? 0 : 1),
    clearcoatRoughness: num(opts.clearcoatRoughness, 0.1),
    ...pick(opts, BASE_KEYS.concat(LIT_KEYS, PBR_KEYS)),
  });
}

/**
 * Self-illuminating material — glows without needing a light.
 * @param {string|number|THREE.Color} [color="#ffffff"] Glow colour, anything `THREE.Color` accepts.
 * @param {object} [o] Options.
 * @param {string|number} [o.base="#000000"] Underlying surface colour behind the glow.
 * @param {number} [o.intensity=1] Emissive intensity; 0 turns the glow off.
 * @param {number} [o.roughness=1] Surface roughness of the underlying colour.
 * @param {number} [o.metalness=0] Metallic fraction of the underlying colour.
 * @param {string|number} [o.color] Glow colour given through the options object instead.
 * @param {...object} [o] Any common option listed in the module docs.
 * @returns {THREE.MeshStandardMaterial} The emissive material.
 */
export function emissive(color, o) {
  const [c, opts] = splitArgs(color, o);
  return new THREE.MeshStandardMaterial({
    color: colorOr(opts.base, "#000000"),
    emissive: colorOr(c, "#ffffff"),
    emissiveIntensity: num(opts.intensity, 1),
    roughness: num(opts.roughness, 1),
    metalness: num(opts.metalness, 0),
    ...pick(opts, BASE_KEYS.concat(LIT_KEYS, PBR_KEYS)),
  });
}

/**
 * Unlit (flat, unshaded) material — ignores all lights, good for UI, skies,
 * minimap icons and effects that must keep their exact colour.
 * @param {string|number|THREE.Color} [color="#ffffff"] Colour, anything `THREE.Color` accepts.
 * @param {object} [o] Options.
 * @param {string|number} [o.color] Colour given through the options object instead.
 * @param {...object} [o] Any common option listed in the module docs (lit-only options are ignored).
 * @returns {THREE.MeshBasicMaterial} The unlit material.
 */
export function unlit(color, o) {
  const [c, opts] = splitArgs(color, o);
  return new THREE.MeshBasicMaterial({
    color: colorOr(c, "#ffffff"),
    ...pick(opts, BASE_KEYS),
  });
}

/**
 * Outline material for inverted-hull outlines: apply it to a second mesh that
 * is scaled up ~5% relative to the original, rendered with `side: BackSide`
 * (the default here) so only the silhouette ring shows.
 * @param {string|number|THREE.Color} [color="#000000"] Outline colour, anything `THREE.Color` accepts.
 * @param {object} [o] Options.
 * @param {number} [o.opacity=1] Opacity; values below 1 enable transparency.
 * @param {boolean} [o.transparent] Override transparency (defaults to `opacity < 1`).
 * @param {number|"front"|"back"|"double"} [o.side] Face culling; defaults to `THREE.BackSide`.
 * @param {string|number} [o.color] Colour given through the options object instead.
 * @param {...object} [o] Any common option listed in the module docs.
 * @returns {THREE.MeshBasicMaterial} The outline material.
 */
export function outline(color, o) {
  const [c, opts] = splitArgs(color, o);
  const opacity = num(opts.opacity, 1);
  const side =
    opts.side === undefined
      ? THREE.BackSide
      : typeof opts.side === "string"
        ? opts.side === "front"
          ? THREE.FrontSide
          : opts.side === "double"
            ? THREE.DoubleSide
            : THREE.BackSide
        : opts.side;
  return new THREE.MeshBasicMaterial({
    ...pick(opts, BASE_KEYS),
    color: colorOr(c, "#000000"),
    opacity,
    transparent: opts.transparent !== undefined ? opts.transparent : opacity < 1,
    side,
  });
}

/**
 * Flat-shaded (faceted) material — every triangle gets its own normal, which
 * gives low-poly geometry its characteristic hard-edged look.
 * @param {string|number|THREE.Color} [color="#ffffff"] Surface colour, anything `THREE.Color` accepts.
 * @param {object} [o] Options.
 * @param {number} [o.roughness=0.9] Surface roughness, 0 (mirror) to 1 (matte).
 * @param {number} [o.metalness=0] Metallic fraction, 0 to 1.
 * @param {string|number} [o.color] Colour given through the options object instead.
 * @param {...object} [o] Any common option listed in the module docs.
 * @returns {THREE.MeshStandardMaterial} The flat-shaded material.
 */
export function flat(color, o) {
  const [c, opts] = splitArgs(color, o);
  return new THREE.MeshStandardMaterial({
    color: colorOr(c, "#ffffff"),
    flatShading: true,
    roughness: num(opts.roughness, 0.9),
    metalness: num(opts.metalness, 0),
    ...pick(opts, BASE_KEYS.concat(LIT_KEYS, PBR_KEYS)),
  });
}

/**
 * Dispose a material created by this module together with every texture map it
 * owns. `envMap` is deliberately left alone because environment maps are almost
 * always shared between materials; dispose shared maps yourself if you own them.
 * @param {THREE.Material|Array<THREE.Material>|null|undefined} m Material (or array of materials) to dispose.
 * @returns {void}
 */
export function disposeMaterial(m) {
  if (m === null || m === undefined) return;
  if (Array.isArray(m)) {
    for (const item of m) disposeMaterial(item);
    return;
  }
  if (typeof m.dispose !== "function") return;
  for (let i = 0; i < MAP_KEYS.length; i++) {
    const texture = m[MAP_KEYS[i]];
    if (texture && typeof texture.dispose === "function") texture.dispose();
  }
  m.dispose();
}

// The seeded runtime's game loop: renderer, scene, camera, fixed steps, hooks.
//
// Imports three (the bare specifier is resolved by the import map index.html
// declares) and this kit's own math helpers — nothing else. No side effects at
// import time: listeners, DOM writes and requestAnimationFrame only happen once
// a factory has been called and `start()` runs.

import * as THREE from "three";

import { clamp, damp } from "./math.js";

const DEFAULT_FIXED_STEP = 1 / 60;
const MAX_CATCH_UP_STEPS = 5; // contract: fixed steps are capped at 5 per frame.
const MAX_FRAME_DELTA = 0.25; // A stalled tab never replays more than a quarter second.
const FPS_SMOOTHING = 4; // Lambda for the smoothed fps read-out.
const EVENTS = ["resize", "start", "stop", "pause", "resume"];
const CAMERA_HINT = "e.g. new THREE.PerspectiveCamera(60, 1, 0.1, 1000)";

/**
 * Creates a browser game around a Three.js renderer: scene, camera, a
 * fixed-step loop, per-frame hooks and automatic resizing of the canvas.
 *
 * Nothing runs at import time, and the loop only runs after `start()`. Every
 * frame follows this order — engine.js is the sole authority for it:
 *
 *   1. fixed steps — the accumulator replays `fixedStep` slices, at most 5 per
 *      frame, calling each `onFixed(fn)` callback once per slice;
 *   2. systems — `game.addSystem(sys)` order, each as `sys.update(dt, elapsed)`;
 *   3. `onUpdate(fn)` callbacks, in registration order;
 *   4. render;
 *   5. input edge flip — `controls.update()` is a system the caller registers
 *      first, so it lands in step 2 and every later reader sees stable edges.
 *
 * @param {object} [options] All keys optional; unknown keys are ignored.
 * @param {HTMLElement|string} [el=document.body] Container the canvas fills:
 *   an element, or a selector string resolved with `document.querySelector`.
 * @param {*} [background] Anything `THREE.Color` accepts (`"#EA580C"`,
 *   `0xEA580C`, `"red"`); becomes `scene.background`.
 * @param {number} [fov=60] Vertical field of view of the default camera, in degrees.
 * @param {number} [near=0.1] Near plane of the default camera.
 * @param {number} [far=1000] Far plane of the default camera.
 * @param {boolean} [antialias=true] Multisample anti-aliasing for the WebGL context.
 * @param {boolean} [shadows=false] Enables the shadow map (PCF shadows).
 * @param {number} [pixelRatio] Explicit device pixel ratio override; the value
 *   is still capped by `maxPixelRatio`.
 * @param {number} [maxPixelRatio=2] Upper bound applied to the pixel ratio, so
 *   a 3x phone display does not quadruple the fill cost.
 * @param {number} [fixedStep=1/60] Seconds per fixed step; `0` (or negative)
 *   disables the fixed phase, so `onFixed` callbacks never run.
 * @param {THREE.Camera} [camera] Existing camera to drive; a default
 *   `PerspectiveCamera(fov, 1, near, far)` is built when omitted.
 * @param {number} [clearAlpha] Clear alpha of the framebuffer; supplying it also
 *   opens the renderer's alpha channel.
 * @returns {object} game — members:
 *   `renderer`, `scene`, `clock`, `canvas` — the raw Three.js objects (`clock`
 *     is a `THREE.Timer`: feed it `update()` per frame, then read
 *     `getDelta()` / `getElapsed()`) and the renderer's DOM element;
 *   `elapsed` — simulated seconds since the first `start()`, frozen while
 *     paused (read this instead of `clock.getElapsed()`, which would swallow
 *     the frame's delta);
 *   `delta` — seconds simulated by the last frame; `0` while paused or stopped,
 *     capped at 0.25 s so a backgrounded tab cannot explode the simulation;
 *   `frame` — frames rendered since the first `start()`;
 *   `fps` — smoothed frames per second;
 *   `paused` — live flag readable and settable directly; assigning it does not
 *     emit events, so prefer `pause()` / `resume()`;
 *   `camera` — settable property, equivalent to `setCamera(c)`;
 *   `add(...objects)` / `remove(...objects)` — put objects in and take them out
 *     of the scene, returning the game for chaining;
 *   `setCamera(c)` — swap the active camera; a camera with no parent joins the
 *     scene so camera-mounted lights and models render, one already inside a
 *     rig is left where it is;
 *   `onUpdate(fn) -> off`, `onFixed(fn) -> off` — per-frame and per-fixed-step
 *     callbacks, each called as `fn(dt, elapsed)`;
 *   `addSystem(sys) -> removeFn` — `sys.update(dt, elapsed)` runs every frame
 *     in registration order (a missing `update` throws);
 *   `on(event, fn) -> off` — listens for `"resize"`, called `fn(width, height)`
 *     with CSS pixels, or `"start"`, `"stop"`, `"pause"`, `"resume"`, called
 *     with no arguments; the returned function unsubscribes;
 *   `start()` — begin the loop (emits `"start"`; a second call is a no-op),
 *     `stop()` — cancel it (emits `"stop"`), `pause()` / `resume()` — freeze and
 *     unfreeze simulation while still rendering (emit `"pause"` / `"resume"`),
 *     `resize()` — re-measure the container now, `dispose()` — release the WebGL
 *     renderer, every geometry and material in the scene, the resize listeners
 *     and the canvas element.
 * @throws {Error} When the container cannot be resolved, when `camera` /
 *   `setCamera(c)` / `game.camera = c` receives something that is not a
 *   Three.js camera, or when a callback or system has the wrong shape.
 */
export function createGame(options = {}) {
  const {
    background,
    fov = 60,
    near = 0.1,
    far = 1000,
    antialias = true,
    shadows = false,
    pixelRatio,
    maxPixelRatio = 2,
    fixedStep = DEFAULT_FIXED_STEP,
    camera,
    clearAlpha,
  } = options;

  const container = resolveContainer(options.el);

  // --- resources ------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({
    antialias,
    alpha: clearAlpha !== undefined,
  });
  const canvas = renderer.domElement;
  const scene = new THREE.Scene();
  const clock = new THREE.Timer();

  renderer.setPixelRatio(clamp(pixelRatio ?? defaultPixelRatio(), 0.1, maxPixelRatio));
  if (clearAlpha !== undefined) renderer.setClearAlpha(clearAlpha);
  if (shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
  }
  if (background !== undefined && background !== null) {
    scene.background = new THREE.Color(background);
  }

  // --- mutable state --------------------------------------------------------
  let activeCamera = null;
  let lastWidth = 0;
  let lastHeight = 0;
  let accumulator = 0;
  let running = false;
  let disposed = false;
  let rafId = 0;
  let restoreContainerPosition = false;
  let resizeObserver = null;
  let windowResizeHandler = null;

  const updateCallbacks = [];
  const fixedCallbacks = [];
  const systems = [];
  const listeners = new Map();

  // --- internal helpers -----------------------------------------------------
  function register(list, fn, label) {
    if (typeof fn !== "function") {
      throw new Error(`${label}: expected a function, received ${typeof fn}.`);
    }
    list.push(fn);
    return () => {
      const index = list.indexOf(fn);
      if (index !== -1) list.splice(index, 1);
    };
  }

  function emit(event, ...args) {
    const bucket = listeners.get(event);
    if (bucket === undefined) return;
    for (const fn of bucket.slice()) fn(...args);
  }

  function on(event, fn) {
    if (!EVENTS.includes(event)) {
      throw new Error(
        `on(event, fn): unknown event "${event}". Use one of: ${EVENTS.join(", ")}.`,
      );
    }
    let bucket = listeners.get(event);
    if (bucket === undefined) {
      bucket = [];
      listeners.set(event, bucket);
    }
    return register(bucket, fn, `on("${event}", fn)`);
  }

  function applyAspect() {
    if (activeCamera === null) return;
    if ("aspect" in activeCamera) {
      activeCamera.aspect = lastHeight > 0 ? lastWidth / lastHeight : 1;
    }
    activeCamera.updateProjectionMatrix();
  }

  function applyCamera(next) {
    if (activeCamera !== null && activeCamera !== next && activeCamera.parent === scene) {
      scene.remove(activeCamera);
    }
    activeCamera = next;
    // Only adopt a camera that has no parent: one already parented to a rig
    // (follow rig, cockpit, shoulder mount) must stay where the caller put it.
    if (next.parent === null) scene.add(next);
    applyAspect();
  }

  function resize() {
    if (disposed) return;
    const width = Math.max(1, container.clientWidth || window.innerWidth || 1);
    const height = Math.max(1, container.clientHeight || window.innerHeight || 1);
    // Skip unchanged sizes: the ResizeObserver can fire for reasons that do not
    // concern us, and re-entrant setSize calls would feed back into it.
    if (width === lastWidth && height === lastHeight) return;
    lastWidth = width;
    lastHeight = height;
    renderer.setSize(width, height);
    applyAspect();
    emit("resize", width, height);
  }

  function tick(timestamp) {
    rafId = requestAnimationFrame(tick);
    // A THREE.Timer measures nothing until update() runs: hand it the frame
    // timestamp, then read the delta it just computed.
    clock.update(timestamp);
    const rawDelta = clock.getDelta();

    if (rawDelta > 0) game.fps = damp(game.fps, 1 / rawDelta, FPS_SMOOTHING, rawDelta);
    game.frame += 1;

    // Paused frames still render — the image must stay fresh — but they never
    // advance time, systems or callbacks.
    if (game.paused) {
      game.delta = 0;
      renderer.render(scene, activeCamera);
      return;
    }

    const dt = Math.min(rawDelta, MAX_FRAME_DELTA);
    game.delta = dt;
    game.elapsed += dt;

    // 1) fixed steps, capped so a stall cannot trigger a catch-up spiral.
    if (fixedStep > 0) {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= fixedStep && steps < MAX_CATCH_UP_STEPS) {
        for (const fn of fixedCallbacks.slice()) fn(fixedStep, game.elapsed);
        accumulator -= fixedStep;
        steps += 1;
      }
      // Past the cap the backlog is dropped, keeping only the phase of the
      // step that is due next, so the loop resumes in sync with real time.
      if (accumulator >= fixedStep) accumulator %= fixedStep;
    }

    // 2) systems, in addSystem order.
    for (const system of systems.slice()) system.update(dt, game.elapsed);

    // 3) onUpdate callbacks, in registration order.
    for (const fn of updateCallbacks.slice()) fn(dt, game.elapsed);

    // 4) render.
    renderer.render(scene, activeCamera);
  }

  function start() {
    if (disposed || running) return game;
    running = true;
    clock.reset(); // Discard the time spent stopped so the first frame is short.
    rafId = requestAnimationFrame(tick);
    emit("start");
    return game;
  }

  function stop() {
    if (!running) return game;
    running = false;
    cancelAnimationFrame(rafId);
    rafId = 0;
    game.delta = 0;
    emit("stop");
    return game;
  }

  function pause() {
    if (game.paused) return game;
    game.paused = true;
    game.delta = 0;
    emit("pause");
    return game;
  }

  function resume() {
    if (!game.paused) return game;
    game.paused = false;
    emit("resume");
    return game;
  }

  function addSystem(system) {
    if (!system || typeof system.update !== "function") {
      throw new Error(
        "addSystem(system): system must expose update(dt, elapsed) — wrap custom work in an object with that method.",
      );
    }
    systems.push(system);
    return () => {
      const index = systems.indexOf(system);
      if (index !== -1) systems.splice(index, 1);
    };
  }

  function dispose() {
    if (disposed) return;
    stop(); // Emits "stop" while listeners are still registered.
    disposed = true;

    if (resizeObserver !== null) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (windowResizeHandler !== null) {
      window.removeEventListener("resize", windowResizeHandler);
      windowResizeHandler = null;
    }

    // Free the GPU objects the scene graph holds, then the renderer itself.
    scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      const material = object.material;
      if (Array.isArray(material)) {
        for (const entry of material) if (entry) entry.dispose();
      } else if (material) {
        material.dispose();
      }
    });
    renderer.dispose();

    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    if (restoreContainerPosition) container.style.position = "";

    systems.length = 0;
    updateCallbacks.length = 0;
    fixedCallbacks.length = 0;
    listeners.clear();
  }

  function observeResize() {
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => resize());
      resizeObserver.observe(container);
    } else {
      windowResizeHandler = () => resize();
      window.addEventListener("resize", windowResizeHandler);
    }
  }

  // --- setup ----------------------------------------------------------------
  canvas.style.display = "block";
  // Take the canvas out of the container's flow: a canvas sized to an
  // auto-height container grows that container, and a ResizeObserver watching
  // it would then observe its own effect and stretch the page forever.
  if (typeof getComputedStyle === "function" && getComputedStyle(container).position === "static") {
    container.style.position = "relative";
    restoreContainerPosition = true;
  }
  canvas.style.position = "absolute";
  canvas.style.top = "0";
  canvas.style.left = "0";

  applyCamera(
    camera !== undefined && camera !== null
      ? assertCamera(camera, "createGame({ camera })")
      : new THREE.PerspectiveCamera(fov, 1, near, far),
  );
  container.appendChild(canvas);
  resize();

  const game = {
    renderer,
    scene,
    canvas,
    clock,
    elapsed: 0,
    delta: 0,
    frame: 0,
    fps: 0,
    paused: false,

    get camera() {
      return activeCamera;
    },
    set camera(next) {
      applyCamera(assertCamera(next, "game.camera = camera"));
    },

    add(...objects) {
      for (const object of objects) scene.add(object);
      return game;
    },

    remove(...objects) {
      for (const object of objects) scene.remove(object);
      return game;
    },

    setCamera(next) {
      applyCamera(assertCamera(next, "setCamera(camera)"));
      return game;
    },

    onUpdate(fn) {
      return register(updateCallbacks, fn, "onUpdate(fn)");
    },

    onFixed(fn) {
      return register(fixedCallbacks, fn, "onFixed(fn)");
    },

    addSystem,

    on,

    start,

    stop,

    pause,

    resume,

    resize,

    dispose,
  };

  observeResize();
  return game;
}

/**
 * Resolves the container the canvas is appended to.
 *
 * @param {HTMLElement|string} [el] Element, selector string, or nothing for `document.body`.
 * @returns {HTMLElement} The container element.
 * @throws {Error} When no element can be resolved; the message names the selector.
 */
function resolveContainer(el) {
  if (el === undefined || el === null) {
    if (typeof document === "undefined" || !document.body) {
      throw new Error(
        "createGame: document.body is not available yet — call createGame after the DOM is ready, or pass a container via options.el.",
      );
    }
    return document.body;
  }
  if (typeof el === "string") {
    const found = typeof document !== "undefined" ? document.querySelector(el) : null;
    if (!found) throw new Error(`createGame({ el }): no element matches selector "${el}".`);
    return found;
  }
  if (typeof el.appendChild !== "function") {
    throw new Error(
      'createGame({ el }): el must be an element or a selector string — omit it to default to document.body.',
    );
  }
  return el;
}

/**
 * Guards a value that must be a Three.js camera.
 *
 * @param {*} value Candidate camera.
 * @param {string} where Where the value came from, quoted in the error message.
 * @returns {*} The camera, unchanged.
 * @throws {Error} When the value is not a Three.js camera.
 */
function assertCamera(value, where) {
  if (!value || value.isCamera !== true) {
    throw new Error(`${where}: expected a THREE.Camera, ${CAMERA_HINT}.`);
  }
  return value;
}

/**
 * Reads the display's pixel ratio, falling back to 1 outside a browser.
 *
 * @returns {number} The device pixel ratio to start from.
 */
function defaultPixelRatio() {
  return typeof window !== "undefined" && window.devicePixelRatio > 0
    ? window.devicePixelRatio
    : 1;
}

// Frame-accurate game input for the seeded runtime.
// DOM-only: this module imports nothing (no three.js, no npm packages).

const GAME_KEYS = new Set([
  "Space",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

const DEFAULT_DEADZONE = 0.15;
const TAP_MAX_MS = 400;
const TAP_MAX_DISTANCE_SQ = 144; // A pointer must drift less than 12 px to stay a tap.

/**
 * Creates a frame-accurate input state for keyboard, pointer, wheel and gamepad.
 *
 * Edge queries (`pressed` / `released`) are true for exactly one frame: DOM events
 * are queued as they arrive and stamped by `update()`, which the game loop calls
 * first each frame, so gameplay code always reads a stable snapshot for the whole
 * frame. Held state (`down`) is live. When `options.game` is provided the input
 * registers itself with `game.addSystem(input)`; otherwise the caller must call
 * `game.addSystem(input)` itself.
 *
 * @param {object} [options] All keys optional; unknown keys are ignored.
 * @param {object} [options.game] Game returned by `createGame`; must expose `addSystem(sys) -> removeFn`.
 *   When present, the input auto-registers as a system.
 * @param {Window|Element} [options.target=window] Event target the listeners attach to.
 * @param {boolean} [options.preventDefault=true] Suppress browser defaults for game keys
 *   (Space, arrow keys and codes bound through `bind()`, never while Ctrl/Meta/Alt is held)
 *   and for wheel scrolling.
 * @param {boolean} [options.wheel=true] Track `wheel` (the frame's accumulated `deltaY`).
 * @param {boolean} [options.pointerLock=false] Request pointer lock on `pointerdown`.
 * @returns {object} input — members:
 *   `down(code) -> boolean` is a key/button currently held;
 *   `pressed(code) -> boolean` edge: pressed exactly this frame;
 *   `released(code) -> boolean` edge: released exactly this frame;
 *   `bind(name, codes)` maps an action name to one code or an array of `KeyboardEvent.code` values
 *   (replaces any previous binding for `name`);
 *   `action(name) -> boolean`, `actionPressed(name) -> boolean`;
 *   `axis(posCode, negCode) -> -1|0|1`;
 *   `pointer { x, y, dx, dy, ndcX, ndcY, buttons }` — position, per-frame movement,
 *   normalized device coordinates in [-1, 1] and the live `PointerEvent.buttons` bitmask;
 *   `wheel` — accumulated `deltaY` for the current frame;
 *   `stick(deadzone = 0.15) -> { x, y }` — first connected gamepad stick with a radial deadzone;
 *   `gamepad(index = 0) -> Gamepad|null`;
 *   `lock()`, `unlock()`, `isLocked` (pointer-lock state);
 *   `onTap(fn) -> off` — `fn({ x, y, ndcX, ndcY, button })` on short presses, returns an unsubscribe;
 *   `update()` — advances the frame counter and stamps edges (dt/elapsed are accepted and ignored);
 *   `dispose()` — removes listeners and unregisters from the game.
 */
export function createControls(options = {}) {
  const game = options.game;
  const preventDefault = options.preventDefault !== false;
  const wheelEnabled = options.wheel !== false;
  const pointerLock = options.pointerLock === true;

  let target = options.target;
  if (target === undefined) {
    target = typeof window !== "undefined" ? window : null;
  }

  if (game !== undefined && game !== null && typeof game.addSystem !== "function") {
    throw new Error(
      'createControls: option "game" must be a game created by createGame (it has no addSystem method). Pass a valid game or omit the option.',
    );
  }

  // --- internal state -------------------------------------------------------
  let frame = 0;
  let disposed = false;
  let removeSystem = null;
  let pendingWheel = 0;
  let pendingDx = 0;
  let pendingDy = 0;
  let lastX = 0;
  let lastY = 0;
  let hasLast = false;
  let tapActive = false;
  let tapAt = 0;
  let tapX = 0;
  let tapY = 0;
  let lockElement = null;

  const held = new Set();
  const pressedAt = new Map();
  const releasedAt = new Map();
  const pendingPress = new Set();
  const pendingRelease = new Set();
  const actions = new Map();
  const boundCodes = new Set();
  const tapCallbacks = new Set();
  const listeners = [];

  const pointer = { x: 0, y: 0, dx: 0, dy: 0, ndcX: 0, ndcY: 0, buttons: 0 };

  // --- helpers --------------------------------------------------------------
  function measure() {
    if (target && typeof target.getBoundingClientRect === "function") {
      const rect = target.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }
    if (typeof window !== "undefined") {
      return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    }
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  function toNdc(x, y) {
    const box = measure();
    if (!(box.width > 0) || !(box.height > 0)) return { x: 0, y: 0 };
    return {
      x: ((x - box.left) / box.width) * 2 - 1,
      y: -((y - box.top) / box.height) * 2 + 1,
    };
  }

  function listen(type, fn, opts) {
    if (!target || typeof target.addEventListener !== "function") return;
    target.addEventListener(type, fn, opts);
    listeners.push([target, type, fn, opts]);
  }

  function listenGlobal(type, fn, opts) {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
    window.addEventListener(type, fn, opts);
    listeners.push([window, type, fn, opts]);
  }

  function shouldBlock(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    return GAME_KEYS.has(event.code) || boundCodes.has(event.code);
  }

  function isPointerLocked() {
    return (
      lockElement !== null &&
      typeof document !== "undefined" &&
      document.pointerLockElement === lockElement
    );
  }

  function lockTargetElement() {
    if (game && game.canvas) return game.canvas;
    if (target && typeof target.requestPointerLock === "function") return target;
    if (typeof document !== "undefined" && document.body) return document.body;
    return null;
  }

  function lock() {
    const el = lockTargetElement();
    if (!el || typeof el.requestPointerLock !== "function") return;
    lockElement = el;
    try {
      const result = el.requestPointerLock();
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch {
      // Pointer lock refused (missing iframe permission, recent unlock, …): stay unlocked.
    }
  }

  function unlock() {
    if (typeof document === "undefined") return;
    if (!document.pointerLockElement) return;
    if (typeof document.exitPointerLock !== "function") return;
    document.exitPointerLock();
  }

  // Center the virtual pointer so ndc starts at (0, 0).
  const initialBox = measure();
  pointer.x = initialBox.left + initialBox.width / 2;
  pointer.y = initialBox.top + initialBox.height / 2;
  lastX = pointer.x;
  lastY = pointer.y;

  // --- event handlers -------------------------------------------------------
  function onKeyDown(event) {
    const code = event.code;
    if (!code) return;
    if (preventDefault && shouldBlock(event)) event.preventDefault();
    if (event.repeat || held.has(code)) return;
    held.add(code);
    pendingPress.add(code);
  }

  function onKeyUp(event) {
    const code = event.code;
    if (!code || !held.has(code)) return;
    held.delete(code);
    pendingRelease.add(code);
  }

  function releaseAll() {
    for (const code of held) pendingRelease.add(code);
    held.clear();
    pointer.buttons = 0;
    tapActive = false;
  }

  function onPointerMove(event) {
    if (isPointerLocked()) {
      const mx = event.movementX || 0;
      const my = event.movementY || 0;
      pendingDx += mx;
      pendingDy += my;
      pointer.x += mx;
      pointer.y += my;
      hasLast = false;
    } else {
      if (hasLast) {
        pendingDx += event.clientX - lastX;
        pendingDy += event.clientY - lastY;
      }
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      lastX = event.clientX;
      lastY = event.clientY;
      hasLast = true;
    }
    pointer.buttons = event.buttons;
  }

  function onPointerDown(event) {
    pointer.buttons = event.buttons;
    const code = "Mouse" + event.button;
    if (!held.has(code)) {
      held.add(code);
      pendingPress.add(code);
    }
    tapActive = true;
    tapAt = Date.now();
    tapX = event.clientX;
    tapY = event.clientY;
    if (pointerLock) lock();
  }

  function onPointerUp(event) {
    pointer.buttons = event.buttons;
    const code = "Mouse" + event.button;
    if (held.has(code)) {
      held.delete(code);
      pendingRelease.add(code);
    }
    if (!tapActive) return;
    tapActive = false;
    const ms = Date.now() - tapAt;
    const dx = event.clientX - tapX;
    const dy = event.clientY - tapY;
    if (ms > TAP_MAX_MS || dx * dx + dy * dy > TAP_MAX_DISTANCE_SQ) return;
    if (tapCallbacks.size === 0) return;
    const ndc = toNdc(event.clientX, event.clientY);
    const info = {
      x: event.clientX,
      y: event.clientY,
      ndcX: ndc.x,
      ndcY: ndc.y,
      button: event.button,
    };
    for (const fn of Array.from(tapCallbacks)) fn(info);
  }

  function onPointerCancel() {
    for (const code of Array.from(held)) {
      if (code.startsWith("Mouse")) {
        held.delete(code);
        pendingRelease.add(code);
      }
    }
    pointer.buttons = 0;
    tapActive = false;
  }

  function onWheel(event) {
    if (preventDefault) event.preventDefault();
    pendingWheel += event.deltaY;
  }

  listen("keydown", onKeyDown);
  listen("keyup", onKeyUp);
  listen("pointermove", onPointerMove);
  listen("pointerdown", onPointerDown);
  listen("pointerup", onPointerUp);
  listen("pointercancel", onPointerCancel);
  if (wheelEnabled) listen("wheel", onWheel, { passive: !preventDefault });
  listenGlobal("blur", releaseAll);

  // --- public API -----------------------------------------------------------
  function down(code) {
    return held.has(code);
  }

  function pressed(code) {
    return pressedAt.get(code) === frame;
  }

  function released(code) {
    return releasedAt.get(code) === frame;
  }

  function bind(name, codes) {
    const list = Array.isArray(codes) ? codes.slice() : [codes];
    actions.set(name, list);
    boundCodes.clear();
    for (const bound of actions.values()) {
      for (const code of bound) boundCodes.add(code);
    }
  }

  function action(name) {
    const list = actions.get(name);
    if (!list) return false;
    for (const code of list) if (held.has(code)) return true;
    return false;
  }

  function actionPressed(name) {
    const list = actions.get(name);
    if (!list) return false;
    for (const code of list) if (pressedAt.get(code) === frame) return true;
    return false;
  }

  function axis(posCode, negCode) {
    return (held.has(posCode) ? 1 : 0) - (held.has(negCode) ? 1 : 0);
  }

  function firstGamepad() {
    if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return null;
    const pads = navigator.getGamepads();
    if (!pads) return null;
    for (let i = 0; i < pads.length; i++) {
      if (pads[i]) return pads[i];
    }
    return null;
  }

  function gamepad(index = 0) {
    if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return null;
    const pads = navigator.getGamepads();
    if (!pads) return null;
    return pads[index] || null;
  }

  function stick(deadzone = DEFAULT_DEADZONE) {
    const pad = firstGamepad();
    if (!pad || !pad.axes || pad.axes.length < 2) return { x: 0, y: 0 };
    const dz = Number.isFinite(deadzone) ? Math.min(Math.max(deadzone, 0), 0.99) : DEFAULT_DEADZONE;
    const x = pad.axes[0] || 0;
    const y = pad.axes[1] || 0;
    const mag = Math.hypot(x, y);
    if (mag <= dz) return { x: 0, y: 0 };
    const scaled = Math.min(1, (mag - dz) / (1 - dz));
    return { x: (x / mag) * scaled, y: (y / mag) * scaled };
  }

  function onTap(fn) {
    if (typeof fn !== "function") {
      throw new Error("createControls: onTap(fn) expects a function.");
    }
    tapCallbacks.add(fn);
    return () => {
      tapCallbacks.delete(fn);
    };
  }

  function update() {
    if (disposed) return;
    frame += 1;
    for (const code of pendingPress) pressedAt.set(code, frame);
    pendingPress.clear();
    for (const code of pendingRelease) releasedAt.set(code, frame);
    pendingRelease.clear();
    input.wheel = pendingWheel;
    pendingWheel = 0;
    pointer.dx = pendingDx;
    pendingDx = 0;
    pointer.dy = pendingDy;
    pendingDy = 0;
    const ndc = toNdc(pointer.x, pointer.y);
    pointer.ndcX = ndc.x;
    pointer.ndcY = ndc.y;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const entry of listeners) {
      entry[0].removeEventListener(entry[1], entry[2], entry[3]);
    }
    listeners.length = 0;
    if (removeSystem) {
      removeSystem();
      removeSystem = null;
    }
    held.clear();
    pendingPress.clear();
    pendingRelease.clear();
    pressedAt.clear();
    releasedAt.clear();
    tapCallbacks.clear();
    actions.clear();
    boundCodes.clear();
    input.wheel = 0;
    pointer.dx = 0;
    pointer.dy = 0;
    pointer.buttons = 0;
    tapActive = false;
  }

  const input = {
    pointer,
    wheel: 0,
    down,
    pressed,
    released,
    bind,
    action,
    actionPressed,
    axis,
    stick,
    gamepad,
    lock,
    unlock,
    get isLocked() {
      return isPointerLocked();
    },
    onTap,
    update,
    dispose,
  };

  if (game) {
    const removeFn = game.addSystem(input);
    if (typeof removeFn === "function") removeSystem = removeFn;
  }

  return input;
}

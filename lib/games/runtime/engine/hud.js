// DOM overlay HUD for the seeded runtime.
// DOM-only: this module imports nothing (no three.js, no npm packages, no external
// fonts or images). All CSS is injected once and scoped under the `.game-hud` root.

const STYLE_ATTRIBUTE = "data-game-hud";
const POSITIONS = [
  "top-left",
  "top",
  "top-right",
  "bottom-left",
  "bottom",
  "bottom-right",
];

const DEFAULT_THEME = {
  fg: "#f5f5f5",
  panel: "rgba(12, 14, 20, 0.62)",
  accent: "#EA580C",
  font: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  fontSize: 14,
  radius: 6,
  gap: 6,
  pad: 12,
};

// Every selector is scoped under `.game-hud`, so nothing leaks into the host page.
const HUD_CSS = `
.game-hud{position:absolute;inset:0;z-index:10;pointer-events:none;user-select:none;-webkit-user-select:none;color:var(--hud-fg);font-family:var(--hud-font);font-size:var(--hud-font-size);line-height:1.35;}
.game-hud[hidden]{display:none;}
.game-hud *,.game-hud *::before,.game-hud *::after{box-sizing:border-box;}
.game-hud__panel{background:var(--hud-panel);border-radius:var(--hud-radius);}
.game-hud__slot{position:absolute;display:flex;flex-direction:column;gap:var(--hud-gap);}
.game-hud__slot--top-left{top:var(--hud-pad);left:var(--hud-pad);align-items:flex-start;}
.game-hud__slot--top{top:var(--hud-pad);left:50%;transform:translateX(-50%);align-items:center;}
.game-hud__slot--top-right{top:var(--hud-pad);right:var(--hud-pad);align-items:flex-end;}
.game-hud__slot--bottom-left{bottom:var(--hud-pad);left:var(--hud-pad);align-items:flex-start;}
.game-hud__slot--bottom{bottom:var(--hud-pad);left:50%;transform:translateX(-50%);align-items:center;}
.game-hud__slot--bottom-right{bottom:var(--hud-pad);right:var(--hud-pad);align-items:flex-end;}
.game-hud__bar{display:flex;align-items:center;gap:8px;padding:5px 9px;}
.game-hud__bar-label{font-size:11px;letter-spacing:.05em;text-transform:uppercase;opacity:.85;white-space:nowrap;}
.game-hud__bar-track{position:relative;overflow:hidden;background:rgba(0,0,0,.5);border-radius:4px;}
.game-hud__bar-fill{position:absolute;top:0;bottom:0;left:0;width:0%;background:var(--hud-accent);border-radius:4px;transition:width 140ms ease-out;}
.game-hud__label{padding:4px 10px;font-size:13px;white-space:nowrap;}
.game-hud__score{display:flex;flex-direction:column;align-items:center;padding:6px 14px;line-height:1.15;text-align:center;}
.game-hud__score-caption{font-size:10px;letter-spacing:.14em;text-transform:uppercase;opacity:.75;}
.game-hud__score-value{font-weight:700;font-variant-numeric:tabular-nums;}
.game-hud__toast{padding:7px 13px;font-size:13px;max-width:min(60vw,420px);text-align:center;opacity:1;transition:opacity 200ms ease;}
.game-hud__message{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:86vw;padding:10px 22px;font-size:32px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;text-align:center;text-shadow:0 2px 12px rgba(0,0,0,.65);}
.game-hud__crosshair{position:absolute;left:50%;top:50%;width:var(--ch-size,18px);height:var(--ch-size,18px);transform:translate(-50%,-50%);background-image:linear-gradient(var(--ch-color,#fff),var(--ch-color,#fff)),linear-gradient(var(--ch-color,#fff),var(--ch-color,#fff)),linear-gradient(var(--ch-color,#fff),var(--ch-color,#fff)),linear-gradient(var(--ch-color,#fff),var(--ch-color,#fff));background-repeat:no-repeat;background-position:center top,center bottom,left center,right center;background-size:var(--ch-thickness,2px) calc(50% - var(--ch-gap,4px)),var(--ch-thickness,2px) calc(50% - var(--ch-gap,4px)),calc(50% - var(--ch-gap,4px)) var(--ch-thickness,2px),calc(50% - var(--ch-gap,4px)) var(--ch-thickness,2px);}
.game-hud__flash{position:absolute;inset:0;background:rgba(255,64,64,.45);opacity:0;}
.game-hud__vignette{position:absolute;inset:0;display:none;background:radial-gradient(ellipse at center,transparent var(--vig-inner,45%),var(--vig-color,rgba(0,0,0,.6)) 100%);}
`;

/** Coerce a value to a finite number, falling back when it is not usable. */
function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Validate a slot position against the six supported anchor names. */
function readPosition(position, fallback) {
  const p = position === undefined || position === null ? fallback : position;
  if (POSITIONS.indexOf(p) === -1) {
    const list = POSITIONS.map((name) => `"${name}"`).join(", ");
    throw new Error(`createHud: unknown position ${JSON.stringify(p)} — use one of ${list}.`);
  }
  return p;
}

/** Validate and normalise the option object accepted by `hud.bar()`. */
function readBarOptions(opts) {
  const max = num(opts.max, 100);
  if (!(max > 0)) {
    throw new Error('createHud: bar option "max" must be a number greater than 0.');
  }
  return {
    label: opts.label === undefined || opts.label === null ? "" : String(opts.label),
    max,
    value: num(opts.value, 0),
    color: opts.color === undefined || opts.color === null ? "" : String(opts.color),
    back: opts.back === undefined || opts.back === null ? "" : String(opts.back),
    height: Math.max(1, num(opts.height, 10)),
    width: Math.max(1, num(opts.width, 160)),
    position: readPosition(opts.position, "top-left"),
  };
}

/** A detached, do-nothing handle returned after `dispose()`. */
function inertHandle() {
  const noop = () => undefined;
  return { set: noop, remove: noop };
}

/**
 * Injects the shared stylesheet exactly once per document.
 *
 * The guard is an attribute check on the `style` element, so repeated calls
 * (or a second HUD in the same document) never duplicate the CSS.
 *
 * @param {Document} doc Document that owns the style element.
 */
function ensureStyles(doc) {
  if (doc.querySelector(`style[${STYLE_ATTRIBUTE}]`)) return;
  const style = doc.createElement("style");
  style.setAttribute(STYLE_ATTRIBUTE, "");
  style.textContent = HUD_CSS;
  (doc.head || doc.documentElement).appendChild(style);
}

/**
 * Creates a full-screen overlay HUD (bars, labels, score, toasts, messages,
 * crosshair, flash and vignette) parented to `options.parent`.
 *
 * The root element is `pointer-events: none`, so it never blocks canvas input.
 * All styling is injected once into the document and scoped under the root, and
 * the theme is applied as CSS custom properties on the root element.
 *
 * @param {object} [options] All keys optional; unknown keys are ignored.
 * @param {Element} [options.parent=document.body] Element the HUD root is appended to.
 * @param {object} [options.theme] Style overrides with keys
 *   `fg` (text colour), `panel` (panel background), `accent` (default bar fill),
 *   `font` (font stack), `fontSize` (px), `radius` (px), `gap` (px, distance between
 *   stacked items), `pad` (px, distance from the screen edge).
 * @returns {object} hud — members:
 *   `bar(key, opts) -> { set(v), remove() }` with
 *   `opts = { label, max = 100, value = 0, color, back, height = 10, width = 160,
 *   position = "top-left" }` (value is clamped to [0, max]);
 *   `set(key, value)` updates an existing bar (number), label or score (stringified);
 *   `label(key, text, opts) -> { set(v), remove() }` with
 *   `opts = { position = "top-left", color, fontSize }`;
 *   `score(value, opts) -> { set(v), remove() }` with
 *   `opts = { key = "score", label, position = "top", color, fontSize = 24 }`;
 *   `toast(text, opts) -> { set(v), remove() }` auto-dismisses after
 *   `opts.duration` ms (`opts = { position = "top", duration = 2400, color, fontSize }`,
 *   duration `0` keeps it until removed);
 *   `message(text, opts)` centred overlay text; empty text clears it
 *   (`opts = { color, fontSize = 34, duration = 0 }`, duration `0` persists);
 *   `crosshair(on, opts)` centre reticle (`opts = { color = "#ffffff", size = 18,
 *   thickness = 2, gap = 4 }`, px);
 *   `flash(opts)` full-screen colour flash (`opts = { color = "rgba(255, 64, 64, 0.45)",
 *   duration = 260 }` ms, driven by CSS);
 *   `vignette(on, opts)` dark edge overlay (`opts = { color = "rgba(0, 0, 0, 0.6)",
 *   inner = 45 }`, `inner` is the transparent centre as a percentage);
 *   `hide()`, `show()`, `clear()` (removes every item and resets overlays),
 *   `update(dt)` (ages timed toasts and messages), `el` (root element),
 *   `dispose()` (removes the HUD; the shared stylesheet is intentionally left in place).
 * @throws {Error} When no document is available, or on an unknown `position`
 *   or a non-positive bar `max`.
 */
export function createHud(options = {}) {
  const doc =
    typeof document !== "undefined"
      ? document
      : options.parent && options.parent.ownerDocument
        ? options.parent.ownerDocument
        : null;
  if (!doc) {
    throw new Error(
      "createHud: no document is available — createHud runs in the browser only.",
    );
  }

  const parent = options.parent || doc.body || null;
  const theme = { ...DEFAULT_THEME, ...(options.theme || {}) };

  ensureStyles(doc);

  let disposed = false;
  let messageEl = null;
  let messageRec = null;
  let crosshairEl = null;

  const items = new Map();
  const toasts = new Set();
  const slots = new Map();

  const root = doc.createElement("div");
  root.className = "game-hud";
  root.setAttribute("data-game-hud-root", "");
  root.style.setProperty("--hud-fg", String(theme.fg));
  root.style.setProperty("--hud-panel", String(theme.panel));
  root.style.setProperty("--hud-accent", String(theme.accent));
  root.style.setProperty("--hud-font", String(theme.font));
  root.style.setProperty("--hud-font-size", `${num(theme.fontSize, 14)}px`);
  root.style.setProperty("--hud-radius", `${num(theme.radius, 6)}px`);
  root.style.setProperty("--hud-gap", `${num(theme.gap, 6)}px`);
  root.style.setProperty("--hud-pad", `${num(theme.pad, 12)}px`);
  if (parent) parent.appendChild(root);

  // Overlays are appended first so dynamically added items paint above them.
  const flashEl = doc.createElement("div");
  flashEl.className = "game-hud__flash";
  root.appendChild(flashEl);
  const vignetteEl = doc.createElement("div");
  vignetteEl.className = "game-hud__vignette";
  root.appendChild(vignetteEl);

  function slotFor(position) {
    const p = readPosition(position, "top-left");
    let el = slots.get(p);
    if (!el) {
      el = doc.createElement("div");
      el.className = `game-hud__slot game-hud__slot--${p}`;
      root.appendChild(el);
      slots.set(p, el);
    }
    return el;
  }

  function place(key, kind, position, el, setValue) {
    const prev = items.get(key);
    if (prev) prev.remove();
    slotFor(position).appendChild(el);
    const rec = { kind, el, set: setValue, remove: null };
    rec.remove = () => {
      el.remove();
      if (items.get(key) === rec) items.delete(key);
    };
    items.set(key, rec);
    return rec;
  }

  function removeMessage() {
    if (messageRec && messageRec.timer !== null) clearTimeout(messageRec.timer);
    messageRec = null;
    if (messageEl) {
      messageEl.remove();
      messageEl = null;
    }
  }

  function clear() {
    for (const rec of Array.from(items.values())) rec.remove();
    for (const rec of Array.from(toasts)) rec.remove();
    removeMessage();
    if (crosshairEl) crosshairEl.style.display = "none";
    vignetteEl.style.display = "none";
    flashEl.style.transition = "none";
    flashEl.style.opacity = "0";
  }

  function bar(key, opts = {}) {
    if (disposed) return inertHandle();
    const o = readBarOptions(opts || {});

    const fill = doc.createElement("div");
    fill.className = "game-hud__bar-fill";
    if (o.color) fill.style.background = o.color;

    const track = doc.createElement("div");
    track.className = "game-hud__bar-track";
    track.style.width = `${o.width}px`;
    track.style.height = `${o.height}px`;
    if (o.back) track.style.background = o.back;
    track.appendChild(fill);

    const labelEl = doc.createElement("span");
    labelEl.className = "game-hud__bar-label";
    labelEl.textContent = o.label;
    labelEl.style.display = o.label ? "" : "none";

    const el = doc.createElement("div");
    el.className = "game-hud__bar game-hud__panel";
    el.appendChild(labelEl);
    el.appendChild(track);

    let max = o.max;
    let value = Math.min(Math.max(o.value, 0), max);
    const paint = () => {
      fill.style.width = `${max > 0 ? (value / max) * 100 : 0}%`;
    };
    paint();

    const set = (v) => {
      const next = Number(v);
      value = Math.min(Math.max(Number.isFinite(next) ? next : 0, 0), max);
      paint();
    };
    const rec = place(key, "bar", o.position, el, set);
    return { set, remove: () => rec.remove() };
  }

  function label(key, text, opts = {}) {
    if (disposed) return inertHandle();
    const el = doc.createElement("div");
    el.className = "game-hud__label game-hud__panel";
    el.textContent = text === undefined || text === null ? "" : String(text);
    if (opts.color !== undefined && opts.color !== null) el.style.color = String(opts.color);
    const fs = num(opts.fontSize, NaN);
    if (Number.isFinite(fs)) el.style.fontSize = `${fs}px`;

    const set = (v) => {
      el.textContent = v === undefined || v === null ? "" : String(v);
    };
    const rec = place(key, "label", readPosition(opts.position, "top-left"), el, set);
    return { set, remove: () => rec.remove() };
  }

  function score(value, opts = {}) {
    if (disposed) return inertHandle();
    const key = opts.key === undefined || opts.key === null ? "score" : String(opts.key);
    const captionText = opts.label === undefined || opts.label === null ? "" : String(opts.label);

    const caption = doc.createElement("span");
    caption.className = "game-hud__score-caption";
    caption.textContent = captionText;
    caption.style.display = captionText ? "" : "none";

    const valueEl = doc.createElement("span");
    valueEl.className = "game-hud__score-value";
    valueEl.style.fontSize = `${num(opts.fontSize, 24)}px`;

    const el = doc.createElement("div");
    el.className = "game-hud__score game-hud__panel";
    if (opts.color !== undefined && opts.color !== null) el.style.color = String(opts.color);
    el.appendChild(caption);
    el.appendChild(valueEl);

    const set = (v) => {
      valueEl.textContent = v === undefined || v === null ? "" : String(v);
    };
    set(value);
    const rec = place(key, "score", readPosition(opts.position, "top"), el, set);
    return { set, remove: () => rec.remove() };
  }

  function toast(text, opts = {}) {
    if (disposed) return inertHandle();
    const duration = Math.max(0, num(opts.duration, 2400));
    const el = doc.createElement("div");
    el.className = "game-hud__toast game-hud__panel";
    el.textContent = text === undefined || text === null ? "" : String(text);
    if (opts.color !== undefined && opts.color !== null) el.style.color = String(opts.color);
    const fs = num(opts.fontSize, NaN);
    if (Number.isFinite(fs)) el.style.fontSize = `${fs}px`;

    el.style.opacity = "0";
    slotFor(readPosition(opts.position, "top")).appendChild(el);
    el.getBoundingClientRect(); // flush styles so the fade-in transition runs.
    el.style.opacity = "1";

    const rec = {
      el,
      remaining: duration > 0 ? duration : Infinity,
      expiresAt: duration > 0 ? Date.now() + duration : 0,
      timer: null,
      remove: null,
    };
    const remove = () => {
      if (rec.timer !== null) {
        clearTimeout(rec.timer);
        rec.timer = null;
      }
      el.remove();
      toasts.delete(rec);
    };
    rec.remove = remove;
    if (duration > 0) rec.timer = setTimeout(remove, duration);
    toasts.add(rec);

    const set = (v) => {
      el.textContent = v === undefined || v === null ? "" : String(v);
    };
    return { set, remove };
  }

  function message(text, opts = {}) {
    if (disposed) return;
    const content = text === undefined || text === null ? "" : String(text);
    if (!content) {
      removeMessage();
      return;
    }
    if (!messageEl) {
      messageEl = doc.createElement("div");
      messageEl.className = "game-hud__message";
      root.appendChild(messageEl);
    }
    messageEl.textContent = content;
    if (opts.color !== undefined && opts.color !== null) messageEl.style.color = String(opts.color);
    const fs = num(opts.fontSize, NaN);
    if (Number.isFinite(fs)) messageEl.style.fontSize = `${fs}px`;

    if (messageRec && messageRec.timer !== null) clearTimeout(messageRec.timer);
    const duration = Math.max(0, num(opts.duration, 0));
    messageRec = {
      remaining: duration > 0 ? duration : Infinity,
      expiresAt: duration > 0 ? Date.now() + duration : 0,
      timer: null,
    };
    if (duration > 0) messageRec.timer = setTimeout(removeMessage, duration);
  }

  function applyCrosshairOpts(opts) {
    if (!crosshairEl) return;
    crosshairEl.style.setProperty(
      "--ch-color",
      opts.color === undefined || opts.color === null ? "#ffffff" : String(opts.color),
    );
    crosshairEl.style.setProperty("--ch-size", `${num(opts.size, 18)}px`);
    crosshairEl.style.setProperty("--ch-thickness", `${num(opts.thickness, 2)}px`);
    crosshairEl.style.setProperty("--ch-gap", `${num(opts.gap, 4)}px`);
  }

  function crosshair(on, opts = {}) {
    if (disposed) return;
    const show = on === true;
    if (show) {
      if (!crosshairEl) {
        crosshairEl = doc.createElement("div");
        crosshairEl.className = "game-hud__crosshair";
        root.appendChild(crosshairEl);
      }
      applyCrosshairOpts(opts);
    }
    if (crosshairEl) crosshairEl.style.display = show ? "" : "none";
  }

  function flash(opts = {}) {
    if (disposed) return;
    const color =
      opts.color === undefined || opts.color === null ? "rgba(255, 64, 64, 0.45)" : String(opts.color);
    const duration = Math.max(40, num(opts.duration, 260));
    flashEl.style.transition = "none";
    flashEl.style.backgroundColor = color;
    flashEl.style.opacity = "1";
    flashEl.getBoundingClientRect(); // flush styles so the fade transition restarts.
    flashEl.style.transition = `opacity ${duration}ms ease-out`;
    flashEl.style.opacity = "0";
  }

  function vignette(on, opts = {}) {
    if (disposed) return;
    vignetteEl.style.setProperty(
      "--vig-color",
      opts.color === undefined || opts.color === null ? "rgba(0, 0, 0, 0.6)" : String(opts.color),
    );
    vignetteEl.style.setProperty("--vig-inner", `${num(opts.inner, 45)}%`);
    vignetteEl.style.display = on === true ? "block" : "none";
  }

  function hide() {
    if (disposed) return;
    root.hidden = true;
  }

  function show() {
    if (disposed) return;
    root.hidden = false;
  }

  function set(key, value) {
    if (disposed) return;
    const rec = items.get(key);
    if (rec) rec.set(value);
  }

  function update(dt) {
    if (disposed) return;
    const raw = num(dt, 0);
    const step = raw > 0 ? raw : 0;
    const now = Date.now();
    for (const rec of Array.from(toasts)) {
      rec.remaining -= step;
      if ((rec.expiresAt !== 0 && now >= rec.expiresAt) || rec.remaining <= 0) rec.remove();
    }
    if (messageRec) {
      messageRec.remaining -= step;
      if (
        (messageRec.expiresAt !== 0 && now >= messageRec.expiresAt) ||
        messageRec.remaining <= 0
      ) {
        removeMessage();
      }
    }
  }

  function dispose() {
    if (disposed) return;
    clear();
    items.clear();
    toasts.clear();
    slots.clear();
    root.remove();
    disposed = true;
  }

  return {
    bar,
    set,
    label,
    score,
    toast,
    message,
    crosshair,
    flash,
    vignette,
    hide,
    show,
    clear,
    update,
    el: root,
    dispose,
  };
}

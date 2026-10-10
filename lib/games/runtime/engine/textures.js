import * as THREE from "three";

/**
 * Shared canvas texture generators. Every texture in this module is drawn to a
 * freshly created `<canvas>` inside the factory call, so importing this module
 * has no side effects and no external file is ever loaded.
 *
 * Common options accepted by every generator: `size` (default 256), `repeat`
 * (number, `[x, y]` or `{ x, y }` — enables `RepeatWrapping`) and `nearest`
 * (default `false` — nearest-neighbour filtering for pixel art).
 * @module engine/textures
 */

/** Create a square 2D canvas of `size` pixels. */
function createCanvas(size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

/** Resolve the shared `size` option (default 256, always a positive integer). */
function resolveSize(o) {
  const size = Number(o.size);
  return Number.isFinite(size) && size > 0 ? Math.floor(size) : 256;
}

/**
 * Convert any `THREE.Color`-compatible value into a CSS `rgb()`/`rgba()` string
 * so it can be handed to the 2D canvas API.
 */
function cssColor(color, alpha = 1) {
  const style = new THREE.Color(
    color === undefined || color === null ? "#ffffff" : color,
  ).getStyle();
  if (alpha >= 1) return style;
  const m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(style);
  if (!m) return style;
  return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
}

/** Apply the shared options (`repeat`, `nearest`) and the sRGB colour space. */
function finishTexture(texture, o) {
  const nearest = o.nearest === true;
  texture.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
  texture.minFilter = nearest
    ? THREE.NearestFilter
    : THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = !nearest;
  texture.colorSpace = THREE.SRGBColorSpace;
  if (o.repeat !== undefined && o.repeat !== null) {
    const r = o.repeat;
    if (Array.isArray(r)) {
      texture.repeat.set(Number(r[0]) || 1, Number(r[1]) || 1);
    } else if (typeof r === "object") {
      texture.repeat.set(Number(r.x) || 1, Number(r.y) || 1);
    } else {
      const v = Number(r) || 1;
      texture.repeat.set(v, v);
    }
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  texture.needsUpdate = true;
  return texture;
}

/**
 * Draw a linear gradient across the texture.
 * @param {object} [o] Options.
 * @param {number} [o.size=256] Canvas edge length in pixels.
 * @param {Array<string|number>} [o.colors=["#ffffff","#000000"]] Gradient stops, evenly spaced (2 or more).
 * @param {number} [o.angle=0] Gradient direction in radians; `0` draws left to right, `Math.PI / 2` top to bottom.
 * @param {number|Array<number>|object} [o.repeat] Wrapping repeat as a number, `[x, y]` or `{ x, y }`.
 * @param {boolean} [o.nearest=false] Use nearest-neighbour filtering (pixel-art look).
 * @returns {THREE.CanvasTexture} The generated gradient texture.
 */
export function gradientTexture(o = {}) {
  const size = resolveSize(o);
  const raw = o.colors;
  const colors = Array.isArray(raw) && raw.length >= 2 ? raw : ["#ffffff", "#000000"];
  const angle = Number.isFinite(o.angle) ? o.angle : 0;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  const half =
    (size / 2) * (Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle)) || 1);
  const dx = Math.cos(angle) * half;
  const dy = Math.sin(angle) * half;
  const gradient = ctx.createLinearGradient(
    size / 2 - dx,
    size / 2 - dy,
    size / 2 + dx,
    size / 2 + dy,
  );
  for (let i = 0; i < colors.length; i++) {
    gradient.addColorStop(
      colors.length === 1 ? 0 : i / (colors.length - 1),
      cssColor(colors[i]),
    );
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return finishTexture(new THREE.CanvasTexture(canvas), o);
}

/**
 * Draw per-pixel random noise (useful as detail, roughness or distortion maps).
 * @param {object} [o] Options.
 * @param {number} [o.size=256] Canvas edge length in pixels.
 * @param {boolean} [o.mono=true] Grayscale noise when `true`, RGB noise when `false`.
 * @param {number} [o.alpha=1] Alpha of every pixel, 0 to 1.
 * @param {number} [o.block=1] Pixel block size; values above 1 produce chunky cells.
 * @param {number|Array<number>|object} [o.repeat] Wrapping repeat as a number, `[x, y]` or `{ x, y }`.
 * @param {boolean} [o.nearest=false] Use nearest-neighbour filtering (pixel-art look).
 * @returns {THREE.CanvasTexture} The generated noise texture.
 */
export function noiseTexture(o = {}) {
  const size = resolveSize(o);
  const mono = o.mono !== false;
  const alpha = Number.isFinite(o.alpha) ? Math.min(Math.max(o.alpha, 0), 1) : 1;
  const block = Math.max(1, Math.floor(Number(o.block) || 1));
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  const alphaByte = Math.round(alpha * 255);
  if (block > 1) {
    const cells = Math.ceil(size / block);
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        if (mono) {
          const v = (Math.random() * 256) | 0;
          ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
        } else {
          const r = (Math.random() * 256) | 0;
          const g = (Math.random() * 256) | 0;
          const b = (Math.random() * 256) | 0;
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        }
        ctx.fillRect(x * block, y * block, block, block);
      }
    }
  } else {
    const image = ctx.createImageData(size, size);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      if (mono) {
        const v = (Math.random() * 256) | 0;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
      } else {
        data[i] = (Math.random() * 256) | 0;
        data[i + 1] = (Math.random() * 256) | 0;
        data[i + 2] = (Math.random() * 256) | 0;
      }
      data[i + 3] = alphaByte;
    }
    ctx.putImageData(image, 0, 0);
  }
  return finishTexture(new THREE.CanvasTexture(canvas), o);
}

/**
 * Draw a square grid of lines that tiles seamlessly with `repeat`.
 * @param {object} [o] Options.
 * @param {number} [o.size=256] Canvas edge length in pixels.
 * @param {number} [o.divisions=8] Number of cells along each axis.
 * @param {string|number} [o.color="#ffffff"] Line colour.
 * @param {string|number} [o.background] Background colour; omit for transparency (needs a transparent material).
 * @param {number} [o.lineWidth=2] Line width in pixels.
 * @param {number|Array<number>|object} [o.repeat] Wrapping repeat as a number, `[x, y]` or `{ x, y }`.
 * @param {boolean} [o.nearest=false] Use nearest-neighbour filtering (pixel-art look).
 * @returns {THREE.CanvasTexture} The generated grid texture.
 */
export function gridTexture(o = {}) {
  const size = resolveSize(o);
  const divisions = Math.max(1, Math.floor(Number(o.divisions) || 8));
  const lineWidth = Math.max(1, Number(o.lineWidth) || 2);
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  if (o.background !== undefined && o.background !== null) {
    ctx.fillStyle = cssColor(o.background);
    ctx.fillRect(0, 0, size, size);
  }
  ctx.fillStyle = cssColor(o.color === undefined ? "#ffffff" : o.color);
  const step = size / divisions;
  for (let i = 0; i <= divisions; i++) {
    const p = Math.round(i * step);
    ctx.fillRect(p - lineWidth / 2, 0, lineWidth, size);
    ctx.fillRect(0, p - lineWidth / 2, size, lineWidth);
  }
  return finishTexture(new THREE.CanvasTexture(canvas), o);
}

/**
 * Draw a checkerboard pattern.
 * @param {object} [o] Options.
 * @param {number} [o.size=256] Canvas edge length in pixels.
 * @param {number} [o.cells=8] Checker cells along each axis.
 * @param {string|number} [o.colorA="#ffffff"] Colour of the first cell.
 * @param {string|number} [o.colorB="#000000"] Colour of the alternating cell.
 * @param {number|Array<number>|object} [o.repeat] Wrapping repeat as a number, `[x, y]` or `{ x, y }`.
 * @param {boolean} [o.nearest=false] Use nearest-neighbour filtering (pixel-art look).
 * @returns {THREE.CanvasTexture} The generated checker texture.
 */
export function checkerTexture(o = {}) {
  const size = resolveSize(o);
  const cells = Math.max(1, Math.floor(Number(o.cells) || 8));
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  const cell = size / cells;
  ctx.fillStyle = cssColor(o.colorA === undefined ? "#ffffff" : o.colorA);
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = cssColor(o.colorB === undefined ? "#000000" : o.colorB);
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      if ((x + y) % 2 === 1) ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  return finishTexture(new THREE.CanvasTexture(canvas), o);
}

/**
 * Draw repeating stripes (bands) that rotate with `angle`.
 * @param {object} [o] Options.
 * @param {number} [o.size=256] Canvas edge length in pixels.
 * @param {number} [o.count=8] Number of alternating bands across the texture.
 * @param {string|number} [o.color="#ffffff"] Stripe colour.
 * @param {string|number} [o.background] Background colour; omit for transparency (needs a transparent material).
 * @param {number} [o.angle=0] Rotation of the stripes in radians.
 * @param {number|Array<number>|object} [o.repeat] Wrapping repeat as a number, `[x, y]` or `{ x, y }`.
 * @param {boolean} [o.nearest=false] Use nearest-neighbour filtering (pixel-art look).
 * @returns {THREE.CanvasTexture} The generated stripes texture.
 */
export function stripesTexture(o = {}) {
  const size = resolveSize(o);
  const count = Math.max(2, Math.floor(Number(o.count) || 8));
  const angle = Number.isFinite(o.angle) ? o.angle : 0;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  const cover = size * 1.5;
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(angle);
  if (o.background !== undefined && o.background !== null) {
    ctx.fillStyle = cssColor(o.background);
    ctx.fillRect(-cover / 2, -cover / 2, cover, cover);
  }
  ctx.fillStyle = cssColor(o.color === undefined ? "#ffffff" : o.color);
  const step = cover / count;
  for (let i = 0; i < count; i += 2) {
    ctx.fillRect(-cover / 2 + i * step, -cover / 2, step, cover);
  }
  ctx.restore();
  return finishTexture(new THREE.CanvasTexture(canvas), o);
}

/**
 * Draw a soft round dot with a transparent falloff — the classic particle sprite.
 * @param {object} [o] Options.
 * @param {number} [o.size=128] Canvas edge length in pixels (128 by default, override if sharper edges are needed).
 * @param {string|number} [o.color="#ffffff"] Dot colour.
 * @param {number} [o.inner=0.2] Radius fraction held at full opacity before fading out.
 * @param {number|Array<number>|object} [o.repeat] Wrapping repeat as a number, `[x, y]` or `{ x, y }`.
 * @param {boolean} [o.nearest=false] Use nearest-neighbour filtering (pixel-art look).
 * @returns {THREE.CanvasTexture} The generated soft dot texture.
 */
export function softDotTexture(o = {}) {
  const size = o.size === undefined ? 128 : resolveSize(o);
  const inner = Number.isFinite(o.inner)
    ? Math.min(Math.max(o.inner, 0), 0.95)
    : 0.2;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  const c = size / 2;
  const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
  gradient.addColorStop(0, cssColor(o.color === undefined ? "#ffffff" : o.color, 1));
  gradient.addColorStop(inner, cssColor(o.color === undefined ? "#ffffff" : o.color, 1));
  gradient.addColorStop(1, cssColor(o.color === undefined ? "#ffffff" : o.color, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return finishTexture(new THREE.CanvasTexture(canvas), o);
}

/**
 * Draw a ring (hollow circle) with optional feathered edges — shockwaves, halos.
 * @param {object} [o] Options.
 * @param {number} [o.size=256] Canvas edge length in pixels.
 * @param {string|number} [o.color="#ffffff"] Ring colour.
 * @param {number} [o.thickness=0.2] Ring thickness as a fraction of the radius, 0 to 1.
 * @param {number} [o.softness=0.5] Edge feathering, 0 (crisp) to 1 (soft).
 * @param {number|Array<number>|object} [o.repeat] Wrapping repeat as a number, `[x, y]` or `{ x, y }`.
 * @param {boolean} [o.nearest=false] Use nearest-neighbour filtering (pixel-art look).
 * @returns {THREE.CanvasTexture} The generated ring texture.
 */
export function ringTexture(o = {}) {
  const size = resolveSize(o);
  const thickness = Math.min(
    Math.max(Number.isFinite(o.thickness) ? o.thickness : 0.2, 0.02),
    0.95,
  );
  const softness = Math.min(
    Math.max(Number.isFinite(o.softness) ? o.softness : 0.5, 0),
    1,
  );
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  const c = size / 2;
  const outer = c;
  const inner = c * (1 - thickness);
  const span = outer - inner;
  const feather = Math.min(Math.max(span * 0.5 * softness, 1), Math.max(span / 2, 1));
  const color = o.color === undefined ? "#ffffff" : o.color;
  const gradient = ctx.createRadialGradient(c, c, 0, c, c, outer);
  gradient.addColorStop(Math.max(0, (inner - feather) / outer), cssColor(color, 0));
  gradient.addColorStop(Math.min(1, inner / outer), cssColor(color, 1));
  gradient.addColorStop(Math.max(0, (outer - feather) / outer), cssColor(color, 1));
  gradient.addColorStop(1, cssColor(color, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return finishTexture(new THREE.CanvasTexture(canvas), o);
}

/**
 * Draw a single line of text, auto-shrunk to fit the canvas.
 * @param {string} text Text to draw (required).
 * @param {object} [o] Options.
 * @param {number} [o.size=256] Canvas edge length in pixels.
 * @param {string|number} [o.color="#ffffff"] Fill colour.
 * @param {string|number} [o.background] Background colour; omit for transparency (needs a transparent material).
 * @param {string} [o.font] CSS font shorthand; defaults to a bold face at 42% of `size`.
 * @param {"left"|"center"|"right"} [o.align="center"] Horizontal alignment.
 * @param {number} [o.padding] Keep-out margin in pixels; defaults to 8% of `size`.
 * @param {string|number} [o.stroke] Optional outline colour drawn over the fill.
 * @param {number} [o.strokeWidth] Outline width in pixels.
 * @param {number|Array<number>|object} [o.repeat] Wrapping repeat as a number, `[x, y]` or `{ x, y }`.
 * @param {boolean} [o.nearest=false] Use nearest-neighbour filtering (pixel-art look).
 * @returns {THREE.CanvasTexture} The generated text texture.
 * @throws {Error} When `text` is missing — pass the string to draw, e.g. `textTexture("Score: 0")`.
 */
export function textTexture(text, o = {}) {
  if (text === undefined || text === null) {
    throw new Error(
      'textTexture(text): "text" is required — pass the string to draw, e.g. textTexture("Score: 0")',
    );
  }
  const size = resolveSize(o);
  const align = o.align === "left" || o.align === "right" ? o.align : "center";
  const padding = Number.isFinite(o.padding)
    ? o.padding
    : Math.round(size * 0.08);
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  if (o.background !== undefined && o.background !== null) {
    ctx.fillStyle = cssColor(o.background);
    ctx.fillRect(0, 0, size, size);
  }
  const font =
    typeof o.font === "string"
      ? o.font
      : `bold ${Math.round(size * 0.42)}px system-ui, "Segoe UI", sans-serif`;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  const label = String(text);
  const available = Math.max(1, size - padding * 2);
  const measured = ctx.measureText(label).width || 1;
  const scale = measured > available ? available / measured : 1;
  const x = align === "left" ? padding : align === "right" ? size - padding : size / 2;
  const y = size / 2;
  ctx.save();
  if (scale !== 1) {
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = cssColor(o.color === undefined ? "#ffffff" : o.color);
    ctx.fillText(label, 0, 0);
    if (o.stroke !== undefined && o.stroke !== null) {
      ctx.lineWidth = (Number(o.strokeWidth) || size * 0.03) / scale;
      ctx.strokeStyle = cssColor(o.stroke);
      ctx.strokeText(label, 0, 0);
    }
  } else {
    ctx.fillStyle = cssColor(o.color === undefined ? "#ffffff" : o.color);
    ctx.fillText(label, x, y);
    if (o.stroke !== undefined && o.stroke !== null) {
      ctx.lineWidth = Number(o.strokeWidth) || size * 0.03;
      ctx.strokeStyle = cssColor(o.stroke);
      ctx.strokeText(label, x, y);
    }
  }
  ctx.restore();
  return finishTexture(new THREE.CanvasTexture(canvas), o);
}

/** Default sprite-sheet cell painter: hue-shifted tile with its frame index. */
function paintFrame(ctx, index, w, h, col, row) {
  ctx.fillStyle = `hsl(${(index * 47) % 360}, 70%, 55%)`;
  ctx.fillRect(col * w, row * h, w, h);
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.font = `bold ${Math.max(10, Math.floor(h * 0.4))}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(index), col * w + w / 2, row * h + h / 2);
}

/**
 * Draw a sprite sheet (grid of frames) and expose framed sub-textures.
 * The base `texture` shows the whole sheet; `frame(i)` returns an independent
 * texture cropped to one cell (row 0 is the top row of the canvas).
 * @param {object} [o] Options.
 * @param {number} [o.size=256] Canvas edge length in pixels.
 * @param {number} [o.cols=4] Frames per row.
 * @param {number} [o.rows=4] Rows of frames.
 * @param {function} [o.draw] Custom painter `(ctx, index, cellW, cellH, col, row)`; defaults to a numbered hue tile.
 * @param {number|Array<number>|object} [o.repeat] Wrapping repeat as a number, `[x, y]` or `{ x, y }`.
 * @param {boolean} [o.nearest=false] Use nearest-neighbour filtering (pixel-art look).
 * @returns {{texture: THREE.CanvasTexture, frame: function(number): THREE.CanvasTexture, cols: number, rows: number, dispose: function(): void}} The sheet handle: full `texture`, `frame(i)` (clamped and cached), `cols`, `rows` and `dispose()`.
 */
export function spriteSheet(o = {}) {
  const size = resolveSize(o);
  const cols = Math.max(1, Math.floor(Number(o.cols) || 4));
  const rows = Math.max(1, Math.floor(Number(o.rows) || 4));
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  const cellW = size / cols;
  const cellH = size / rows;
  const painter = typeof o.draw === "function" ? o.draw : paintFrame;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(col * cellW, row * cellH, cellW, cellH);
      ctx.clip();
      painter(ctx, row * cols + col, cellW, cellH, col, row);
      ctx.restore();
    }
  }
  const texture = finishTexture(new THREE.CanvasTexture(canvas), o);
  const frames = new Map();
  const sheet = {
    texture,
    cols,
    rows,
    /**
     * Crop one frame out of the sheet as an independent texture.
     * @param {number} i Frame index (wraps around the sheet); row 0 is the top row.
     * @returns {THREE.CanvasTexture} Texture with `repeat`/`offset` set to the requested cell.
     */
    frame(i) {
      const total = cols * rows;
      const n = ((Math.floor(Number(i) || 0) % total) + total) % total;
      const cached = frames.get(n);
      if (cached) return cached;
      const col = n % cols;
      const row = Math.floor(n / cols);
      const cell = new THREE.CanvasTexture(canvas);
      cell.colorSpace = THREE.SRGBColorSpace;
      cell.magFilter = texture.magFilter;
      cell.minFilter = texture.minFilter;
      cell.generateMipmaps = texture.generateMipmaps;
      cell.repeat.set(1 / cols, 1 / rows);
      cell.offset.set(col / cols, 1 - (row + 1) / rows);
      cell.needsUpdate = true;
      frames.set(n, cell);
      return cell;
    },
    /** Dispose the sheet texture and every texture returned by `frame()`. */
    dispose() {
      texture.dispose();
      for (const cell of frames.values()) cell.dispose();
      frames.clear();
    },
  };
  return sheet;
}

/**
 * Draw a texture with a custom 2D canvas painter.
 * @param {function} draw Painter `(ctx, canvas)` invoked with the blank canvas context (required).
 * @param {object} [o] Options.
 * @param {number} [o.size=256] Canvas edge length in pixels.
 * @param {number|Array<number>|object} [o.repeat] Wrapping repeat as a number, `[x, y]` or `{ x, y }`.
 * @param {boolean} [o.nearest=false] Use nearest-neighbour filtering (pixel-art look).
 * @returns {THREE.CanvasTexture} The texture painted by `draw`.
 * @throws {Error} When `draw` is missing or is not a function.
 */
export function canvasTexture(draw, o = {}) {
  if (typeof draw !== "function") {
    throw new Error(
      'canvasTexture(draw): "draw" must be a function (ctx, canvas) => void — e.g. canvasTexture((ctx, c) => ctx.fillRect(0, 0, c.width, c.height))',
    );
  }
  const size = resolveSize(o);
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");
  draw(ctx, canvas);
  return finishTexture(new THREE.CanvasTexture(canvas), o);
}

/**
 * Dispose one texture, or every texture in an array, created by this module.
 * Safe to call with `null`/`undefined`; unknown objects are ignored.
 * @param {THREE.Texture|Array<THREE.Texture>|null|undefined} texture Texture (or array of textures) to dispose.
 * @returns {void}
 */
export function disposeTexture(texture) {
  if (texture === null || texture === undefined) return;
  if (Array.isArray(texture)) {
    for (const t of texture) disposeTexture(t);
    return;
  }
  if (typeof texture.dispose === "function") texture.dispose();
}

// WebAudio-only sound bank for the seeded runtime.
// DOM-free, asset-free: every sound below is synthesised, nothing is loaded.
// The AudioContext is created lazily by `resume()`/first playback so importing
// this module (or calling the factory) never triggers an autoplay warning.

const NOTE_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const OSC_TYPES = new Set(["sine", "square", "sawtooth", "triangle"]);
const FILTER_TYPES = new Set([
  "lowpass",
  "highpass",
  "bandpass",
  "lowshelf",
  "highshelf",
  "peaking",
  "notch",
  "allpass",
]);
const LOOKAHEAD_SECONDS = 0.25;
const FIRST_PASS_DELAY = 0.08;
const NOISE_BUFFERS = new WeakMap();

// Built-in music loops for `audio.music(name)`. Steps use `at`/`dur` in beats.
const MUSIC_PATTERNS = {
  menu: {
    bpm: 96,
    loop: true,
    steps: [
      { at: 0, note: "C3", dur: 1, type: "triangle", gain: 0.35 },
      { at: 1, note: "G2", dur: 1, type: "triangle", gain: 0.35 },
      { at: 2, note: "A2", dur: 1, type: "triangle", gain: 0.35 },
      { at: 3, note: "F2", dur: 1, type: "triangle", gain: 0.35 },
      { at: 0, note: "E4", dur: 0.5, type: "sine", gain: 0.18 },
      { at: 0.5, note: "G4", dur: 0.5, type: "sine", gain: 0.18 },
      { at: 1, note: "D4", dur: 0.5, type: "sine", gain: 0.18 },
      { at: 1.5, note: "G4", dur: 0.5, type: "sine", gain: 0.18 },
      { at: 2, note: "C4", dur: 0.5, type: "sine", gain: 0.18 },
      { at: 2.5, note: "E4", dur: 0.5, type: "sine", gain: 0.18 },
      { at: 3, note: "A4", dur: 0.5, type: "sine", gain: 0.18 },
      { at: 3.5, note: "G4", dur: 0.5, type: "sine", gain: 0.18 },
    ],
  },
  game: {
    bpm: 128,
    loop: true,
    steps: [
      { at: 0, note: "E2", dur: 0.45, type: "square", gain: 0.28 },
      { at: 0.5, note: "E2", dur: 0.45, type: "square", gain: 0.22 },
      { at: 1, note: "E2", dur: 0.45, type: "square", gain: 0.28 },
      { at: 1.5, note: "G2", dur: 0.45, type: "square", gain: 0.22 },
      { at: 2, note: "E2", dur: 0.45, type: "square", gain: 0.28 },
      { at: 2.5, note: "A2", dur: 0.45, type: "square", gain: 0.22 },
      { at: 3, note: "E2", dur: 0.45, type: "square", gain: 0.28 },
      { at: 3.5, note: "B2", dur: 0.45, type: "square", gain: 0.22 },
      { at: 1.5, note: "B4", dur: 0.4, type: "sine", gain: 0.16 },
      { at: 3.5, note: "E5", dur: 0.4, type: "sine", gain: 0.16 },
    ],
  },
  battle: {
    bpm: 140,
    loop: true,
    steps: [
      { at: 0, note: "A2", dur: 0.4, type: "sawtooth", gain: 0.3 },
      { at: 0.5, note: "A2", dur: 0.4, type: "sawtooth", gain: 0.24 },
      { at: 1, note: "A2", dur: 0.4, type: "sawtooth", gain: 0.3 },
      { at: 1.5, note: "C3", dur: 0.4, type: "sawtooth", gain: 0.24 },
      { at: 2, note: "A2", dur: 0.4, type: "sawtooth", gain: 0.3 },
      { at: 2.5, note: "A2", dur: 0.4, type: "sawtooth", gain: 0.24 },
      { at: 3, note: "D3", dur: 0.4, type: "sawtooth", gain: 0.3 },
      { at: 3.5, note: "E3", dur: 0.4, type: "sawtooth", gain: 0.24 },
      { at: 0.5, note: "E4", dur: 0.2, type: "square", gain: 0.14 },
      { at: 2.5, note: "A4", dur: 0.2, type: "square", gain: 0.14 },
    ],
  },
  calm: {
    bpm: 72,
    loop: true,
    steps: [
      { at: 0, note: "C3", dur: 2, type: "triangle", gain: 0.3 },
      { at: 2, note: "F2", dur: 2, type: "triangle", gain: 0.3 },
      { at: 0, note: "G4", dur: 1.5, type: "sine", gain: 0.16 },
      { at: 2, note: "A4", dur: 1.5, type: "sine", gain: 0.16 },
    ],
  },
};

/** Coerce a value to a finite number, falling back when it is not usable. */
function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Clamp a volume to [0, 1]. */
function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

/** Keep only oscillator type strings `OscillatorNode` accepts. */
function oscType(value) {
  return typeof value === "string" && OSC_TYPES.has(value) ? value : "sine";
}

/** Keep only filter type strings `BiquadFilterNode` accepts. */
function filterType(value) {
  return typeof value === "string" && FILTER_TYPES.has(value) ? value : "lowpass";
}

/**
 * Convert scientific pitch notation to a frequency in Hz.
 *
 * @param {string} note Note such as `"A4"`, `"C#5"`, `"Bb3"`.
 * @returns {number|null} Frequency in Hz, or `null` when the note is invalid.
 */
function noteToFreq(note) {
  if (typeof note !== "string") return null;
  const match = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(note.trim());
  if (!match) return null;
  let semi = NOTE_SEMITONES[match[1].toUpperCase()];
  if (match[2] === "#") semi += 1;
  else if (match[2] === "b") semi -= 1;
  const midi = (Number(match[3]) + 1) * 12 + semi;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Get (and cache) a one-second white-noise buffer for a context. */
function getNoiseBuffer(ctx) {
  let buffer = NOISE_BUFFERS.get(ctx);
  if (!buffer) {
    const length = Math.max(1, Math.floor(ctx.sampleRate));
    buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    NOISE_BUFFERS.set(ctx, buffer);
  }
  return buffer;
}

function volOf(opts) {
  return num(opts && opts.volume, 1);
}

function rateOf(opts) {
  const r = num(opts && opts.rate, 1);
  return r > 0 ? r : 1;
}

function delayOf(opts) {
  const d = num(opts && opts.delay, 0);
  return d > 0 ? d : 0;
}

/**
 * Wrap an oscillator/buffer source in a playable voice handle and register it
 * for disposal. The voice retires itself through `onended`.
 */
function makeVoice(ctx, source, gainNode, voices) {
  const voice = {
    name: null,
    ended: false,
    stop(fade = 0.04) {
      if (voice.ended) return;
      voice.ended = true;
      try {
        const now = ctx.currentTime;
        const f = Math.max(0.01, num(fade, 0.04));
        gainNode.gain.cancelScheduledValues(now);
        const current = gainNode.gain.value;
        gainNode.gain.setValueAtTime(current, now);
        gainNode.gain.linearRampToValueAtTime(0.0001, now + f);
        source.stop(now + f + 0.02);
      } catch {
        // The source already finished; there is nothing left to stop.
      }
    },
  };
  source.onended = () => {
    voice.ended = true;
    voices.delete(voice);
  };
  voices.add(voice);
  return voice;
}

/** Schedule one enveloped oscillator tone; `opts.delay` is in seconds. */
function t(ctx, dest, opts, voices) {
  const start = ctx.currentTime + delayOf(opts);
  const dur = Math.max(0.02, num(opts.dur, 0.2));
  const osc = ctx.createOscillator();
  osc.type = oscType(opts.type);
  const f0 = Math.max(20, num(opts.freq, 440));
  osc.frequency.setValueAtTime(f0, start);
  const f1 = opts.freqEnd != null ? Math.max(20, num(opts.freqEnd, 0)) : 0;
  if (f1 > 0 && Math.abs(f1 - f0) > 0.5) {
    osc.frequency.exponentialRampToValueAtTime(f1, start + dur);
  }
  const gain = ctx.createGain();
  const peak = Math.max(0.0001, num(opts.gain, 0.35));
  const attack = Math.min(Math.max(num(opts.attack, 0.006), 0.001), dur * 0.6);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(peak, start + attack);
  gain.gain.linearRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(start);
  osc.stop(start + dur + 0.03);
  return makeVoice(ctx, osc, gain, voices);
}

/** Schedule one filtered noise burst; `opts.delay` is in seconds. */
function n(ctx, dest, opts, voices) {
  const start = ctx.currentTime + delayOf(opts);
  const dur = Math.max(0.02, num(opts.dur, 0.25));
  const source = ctx.createBufferSource();
  source.buffer = getNoiseBuffer(ctx);
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType(opts.filterType);
  const f0 = Math.max(20, num(opts.freq, 1200));
  filter.frequency.setValueAtTime(f0, start);
  const f1 = opts.freqEnd != null ? Math.max(20, num(opts.freqEnd, 0)) : 0;
  if (f1 > 0 && Math.abs(f1 - f0) > 0.5) {
    filter.frequency.exponentialRampToValueAtTime(f1, start + dur);
  }
  filter.Q.value = Math.max(0, num(opts.q, 1));
  const gain = ctx.createGain();
  const peak = Math.max(0.0001, num(opts.gain, 0.3));
  const attack = Math.min(Math.max(num(opts.attack, 0.005), 0.001), dur * 0.6);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(peak, start + attack);
  gain.gain.linearRampToValueAtTime(0.0001, start + dur);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  source.start(start);
  source.stop(start + dur + 0.05);
  return makeVoice(ctx, source, gain, voices);
}

/** Combine step descriptors (`{ at, kind?, … }`, `at` in seconds) into one voice. */
function seq(ctx, dest, steps, opts, voices) {
  const base = delayOf(opts);
  const parts = [];
  for (const step of steps) {
    const stepOpts = Object.assign({}, step, { delay: base + num(step.at, 0) });
    parts.push(step.kind === "n" ? n(ctx, dest, stepOpts, voices) : t(ctx, dest, stepOpts, voices));
  }
  return {
    name: null,
    stop(fade = 0.04) {
      for (const part of parts) part.stop(fade);
    },
    get ended() {
      return parts.every((part) => part.ended);
    },
  };
}

// The frozen preset set. Each entry synthesises one named effect.
const PRESETS = {
  jump(c, d, o, vs) {
    const v = volOf(o);
    const r = rateOf(o);
    return t(c, d, { freq: 300 * r, freqEnd: 720 * r, type: "square", dur: 0.16, gain: 0.28 * v, delay: delayOf(o) }, vs);
  },
  land(c, d, o, vs) {
    const v = volOf(o);
    const r = rateOf(o);
    return seq(c, d, [
      { kind: "n", at: 0, freq: 700, freqEnd: 200, dur: 0.1, gain: 0.3 * v },
      { at: 0, freq: 150 * r, freqEnd: 60 * r, type: "sine", dur: 0.13, gain: 0.3 * v },
    ], o, vs);
  },
  coin(c, d, o, vs) {
    const v = volOf(o);
    const r = rateOf(o);
    return seq(c, d, [
      { at: 0, freq: 988 * r, type: "square", dur: 0.06, gain: 0.22 * v },
      { at: 0.06, freq: 1319 * r, type: "square", dur: 0.16, gain: 0.22 * v },
    ], o, vs);
  },
  powerup(c, d, o, vs) {
    const v = volOf(o);
    const r = rateOf(o);
    return seq(c, d, [
      { at: 0, freq: 392 * r, type: "square", dur: 0.08, gain: 0.2 * v },
      { at: 0.07, freq: 523 * r, type: "square", dur: 0.08, gain: 0.2 * v },
      { at: 0.14, freq: 659 * r, type: "square", dur: 0.08, gain: 0.2 * v },
      { at: 0.21, freq: 784 * r, type: "square", dur: 0.16, gain: 0.2 * v },
    ], o, vs);
  },
  hit(c, d, o, vs) {
    const v = volOf(o);
    const r = rateOf(o);
    return seq(c, d, [
      { kind: "n", at: 0, filterType: "bandpass", freq: 1600, q: 1.5, dur: 0.1, gain: 0.32 * v },
      { at: 0, freq: 220 * r, freqEnd: 90 * r, type: "square", dur: 0.1, gain: 0.3 * v },
    ], o, vs);
  },
  hurt(c, d, o, vs) {
    const v = volOf(o);
    const r = rateOf(o);
    return seq(c, d, [
      { at: 0, freq: 300 * r, freqEnd: 110 * r, type: "sawtooth", dur: 0.28, gain: 0.3 * v },
      { kind: "n", at: 0, freq: 900, dur: 0.2, gain: 0.25 * v },
    ], o, vs);
  },
  explode(c, d, o, vs) {
    const v = volOf(o);
    const r = rateOf(o);
    return seq(c, d, [
      { kind: "n", at: 0, freq: 3200, freqEnd: 90, dur: 0.85, gain: 0.5 * v },
      { at: 0, freq: 110 * r, freqEnd: 32 * r, type: "sine", dur: 0.6, gain: 0.4 * v },
    ], o, vs);
  },
  laser(c, d, o, vs) {
    const v = volOf(o);
    const r = rateOf(o);
    return t(c, d, { freq: 1500 * r, freqEnd: 140 * r, type: "sawtooth", dur: 0.28, gain: 0.22 * v, delay: delayOf(o) }, vs);
  },
  splash(c, d, o, vs) {
    const v = volOf(o);
    return n(c, d, { filterType: "bandpass", freq: 1400, freqEnd: 350, q: 0.8, dur: 0.45, gain: 0.3 * v, delay: delayOf(o) }, vs);
  },
  click(c, d, o, vs) {
    const v = volOf(o);
    const r = rateOf(o);
    return t(c, d, { freq: 1150 * r, type: "square", dur: 0.045, gain: 0.18 * v, delay: delayOf(o) }, vs);
  },
  select(c, d, o, vs) {
    const v = volOf(o);
    const r = rateOf(o);
    return seq(c, d, [
      { at: 0, freq: 880 * r, type: "sine", dur: 0.06, gain: 0.2 * v },
      { at: 0.05, freq: 1320 * r, type: "sine", dur: 0.1, gain: 0.18 * v },
    ], o, vs);
  },
  start(c, d, o, vs) {
    const v = volOf(o);
    const r = rateOf(o);
    return seq(c, d, [
      { at: 0, freq: 523 * r, type: "square", dur: 0.1, gain: 0.2 * v },
      { at: 0.09, freq: 659 * r, type: "square", dur: 0.1, gain: 0.2 * v },
      { at: 0.18, freq: 784 * r, type: "square", dur: 0.18, gain: 0.2 * v },
    ], o, vs);
  },
  gameover(c, d, o, vs) {
    const v = volOf(o);
    const r = rateOf(o);
    return seq(c, d, [
      { at: 0, freq: 392 * r, type: "sine", dur: 0.25, gain: 0.25 * v },
      { at: 0.24, freq: 330 * r, type: "sine", dur: 0.25, gain: 0.25 * v },
      { at: 0.48, freq: 262 * r, type: "sine", dur: 0.25, gain: 0.25 * v },
      { at: 0.72, freq: 196 * r, type: "sine", dur: 0.4, gain: 0.25 * v },
    ], o, vs);
  },
  win(c, d, o, vs) {
    const v = volOf(o);
    const r = rateOf(o);
    return seq(c, d, [
      { at: 0, freq: 523 * r, type: "square", dur: 0.12, gain: 0.22 * v },
      { at: 0.1, freq: 659 * r, type: "square", dur: 0.12, gain: 0.22 * v },
      { at: 0.2, freq: 784 * r, type: "square", dur: 0.12, gain: 0.22 * v },
      { at: 0.3, freq: 1047 * r, type: "square", dur: 0.3, gain: 0.22 * v },
    ], o, vs);
  },
  lose(c, d, o, vs) {
    const v = volOf(o);
    const r = rateOf(o);
    return seq(c, d, [
      { at: 0, freq: 330 * r, type: "sawtooth", dur: 0.22, gain: 0.25 * v },
      { at: 0.18, freq: 262 * r, type: "sawtooth", dur: 0.22, gain: 0.25 * v },
      { at: 0.36, freq: 196 * r, type: "sawtooth", dur: 0.36, gain: 0.25 * v },
    ], o, vs);
  },
  check(c, d, o, vs) {
    const v = volOf(o);
    const r = rateOf(o);
    return seq(c, d, [
      { at: 0, freq: 660 * r, type: "sine", dur: 0.07, gain: 0.2 * v },
      { at: 0.06, freq: 990 * r, type: "sine", dur: 0.1, gain: 0.18 * v },
    ], o, vs);
  },
  deny(c, d, o, vs) {
    const v = volOf(o);
    const r = rateOf(o);
    return seq(c, d, [
      { at: 0, freq: 180 * r, type: "square", dur: 0.12, gain: 0.3 * v },
      { at: 0.13, freq: 150 * r, type: "square", dur: 0.22, gain: 0.3 * v },
    ], o, vs);
  },
  whoosh(c, d, o, vs) {
    const v = volOf(o);
    return n(c, d, { filterType: "bandpass", freq: 350, freqEnd: 3200, q: 1.2, dur: 0.4, gain: 0.3 * v, delay: delayOf(o) }, vs);
  },
  blip(c, d, o, vs) {
    const v = volOf(o);
    const r = rateOf(o);
    return t(c, d, { freq: 880 * r, type: "sine", dur: 0.05, gain: 0.25 * v, delay: delayOf(o) }, vs);
  },
  boom(c, d, o, vs) {
    const v = volOf(o);
    const r = rateOf(o);
    return seq(c, d, [
      { at: 0, freq: 90 * r, freqEnd: 30 * r, type: "sine", dur: 0.6, gain: 0.45 * v },
      { kind: "n", at: 0, freq: 1500, freqEnd: 60, dur: 0.7, gain: 0.4 * v },
    ], o, vs);
  },
  pickup(c, d, o, vs) {
    const v = volOf(o);
    const r = rateOf(o);
    return seq(c, d, [
      { at: 0, freq: 660 * r, type: "sine", dur: 0.07, gain: 0.22 * v },
      { at: 0.07, freq: 990 * r, type: "sine", dur: 0.14, gain: 0.22 * v },
    ], o, vs);
  },
  damage(c, d, o, vs) {
    const v = volOf(o);
    const r = rateOf(o);
    return seq(c, d, [
      { at: 0, freq: 520 * r, freqEnd: 240 * r, type: "square", dur: 0.15, gain: 0.25 * v },
      { kind: "n", at: 0, freq: 1400, dur: 0.12, gain: 0.25 * v },
    ], o, vs);
  },
  step(c, d, o, vs) {
    const v = volOf(o);
    return n(c, d, { freq: 620, dur: 0.07, gain: 0.18 * v, delay: delayOf(o) }, vs);
  },
  bounce(c, d, o, vs) {
    const v = volOf(o);
    const r = rateOf(o);
    return t(c, d, { freq: 420 * r, freqEnd: 880 * r, type: "sine", dur: 0.14, gain: 0.32 * v, delay: delayOf(o) }, vs);
  },
  portal(c, d, o, vs) {
    const v = volOf(o);
    const r = rateOf(o);
    return seq(c, d, [
      { kind: "n", at: 0, filterType: "bandpass", freq: 320, freqEnd: 2600, dur: 0.65, gain: 0.3 * v },
      { at: 0, freq: 180 * r, freqEnd: 560 * r, type: "sine", dur: 0.6, gain: 0.2 * v },
    ], o, vs);
  },
};

/**
 * Validate a music pattern and convert notes to frequencies.
 *
 * @param {object} pattern - Pattern with `{ bpm, loop?, steps: [{ at, note|freq, dur, type?, gain? }] }`.
 * @returns {{ bpm: number, passBeats: number, steps: Array<object> }} Normalised pattern.
 * @throws {Error} When `bpm`, `steps` or any step is malformed.
 */
function normalizePattern(pattern) {
  const bpm = num(pattern.bpm, 0);
  if (!(bpm > 0)) {
    throw new Error('audio.music: pattern "bpm" must be a number greater than 0.');
  }
  if (!Array.isArray(pattern.steps) || pattern.steps.length === 0) {
    throw new Error(
      'audio.music: pattern needs a non-empty "steps" array of { at, note|freq, dur, type, gain }.',
    );
  }
  const steps = [];
  let end = 0;
  for (let i = 0; i < pattern.steps.length; i++) {
    const step = pattern.steps[i] || {};
    const at = num(step.at, NaN);
    if (!Number.isFinite(at) || at < 0) {
      throw new Error(`audio.music: step ${i} needs a non-negative numeric "at" (beat position).`);
    }
    let freq = 0;
    if (step.freq != null) {
      freq = num(step.freq, 0);
      if (!(freq > 0)) {
        throw new Error(
          `audio.music: step ${i} has an invalid "freq" — use positive Hz or a "note" like "A4".`,
        );
      }
    } else if (step.note != null) {
      const parsed = noteToFreq(step.note);
      if (parsed == null) {
        throw new Error(
          `audio.music: step ${i} has an invalid note ${JSON.stringify(String(step.note))} — use scientific pitch like "A4" or "C#5".`,
        );
      }
      freq = parsed;
    } else {
      throw new Error(`audio.music: step ${i} needs either "note" (e.g. "A4") or "freq" (Hz).`);
    }
    const dur = num(step.dur, 0.5);
    if (!(dur > 0)) {
      throw new Error(`audio.music: step ${i} needs a positive "dur" in beats.`);
    }
    steps.push({
      at,
      dur,
      freq,
      type: oscType(step.type),
      gain: Math.max(0, num(step.gain, 0.3)),
    });
    end = Math.max(end, at + dur);
  }
  return { bpm, steps, passBeats: Math.max(1, Math.ceil(end - 1e-6)) };
}

/**
 * Creates a synthesised sound bank with per-bus volume control.
 *
 * The `AudioContext` is created lazily: calling the factory has no side effects
 * and never throws, even when the browser blocks autoplay. Until a user gesture
 * lets `resume()` start the context, `ready` is `false` and every play call is a
 * safe no-op returning `null`. `resume()` arms one-shot gesture listeners so a
 * single early call still unlocks audio on the first click or key press.
 *
 * @param {object} [options] All keys optional; unknown keys are ignored.
 * @param {number} [options.master=0.8] Master volume, clamped to [0, 1].
 * @param {number} [options.sfx=1] Sound-effect bus volume, clamped to [0, 1].
 * @param {number} [options.music=0.45] Music bus volume, clamped to [0, 1].
 * @returns {object} audio — members:
 *   `play(name, opts) -> voice|null` plays a preset
 *   (frozen names: `jump land coin powerup hit hurt explode laser splash click
 *   select start gameover win lose check deny whoosh blip boom pickup damage step
 *   bounce portal`); `opts = { volume = 1, rate = 1, bus = "sfx" }`; returns `null`
 *   while the context is not running or the name is unknown;
 *   `tone(opts) -> voice|null` raw oscillator
 *   (`{ freq = 440, freqEnd, type = "sine", dur = 0.2, gain = 0.35, attack, delay = 0, bus = "sfx" }`);
 *   `noise(opts) -> voice|null` filtered noise burst
 *   (`{ dur = 0.25, gain = 0.3, filterType = "lowpass", freq = 1200, freqEnd, q = 1, delay = 0, bus = "sfx" }`);
 *   `music(nameOrPattern, opts) -> { stop(fade) }|null` starts a built-in loop
 *   (`"menu" | "game" | "battle" | "calm"`) or a pattern
 *   `{ bpm, loop?, steps: [{ at, note|freq, dur, type?, gain? }] }` where `at` and `dur`
 *   are in beats and `note` is scientific pitch such as `"A4"`; `opts = { volume = 1,
 *   loop, bus = "music" }`; throws on a malformed pattern, returns `null` for an
 *   unknown built-in name or while not ready;
 *   `stopMusic(opts) -> boolean` with `opts = { fade = 0.12 }`;
 *   `mute(on?) -> boolean` (no argument toggles), `toggleMute() -> boolean`,
 *   `isMuted` (boolean), `setVolume(bus, v)`, `volume(bus)` with
 *   `bus = "master" | "sfx" | "music"`;
 *   `resume() -> Promise<boolean>` creates and starts the context (never rejects),
 *   `ready` (boolean), `update(dt)` (retires finished voices), `dispose()` closes
 *   the context and stops everything.
 *   A `voice` is `{ name, ended, stop(fade = 0.04) }`.
 * @throws {Error} On an unknown bus or a malformed music pattern.
 */
export function createAudio(options = {}) {
  const vol = {
    master: clamp01(num(options.master, 0.8)),
    sfx: clamp01(num(options.sfx, 1)),
    music: clamp01(num(options.music, 0.45)),
  };

  let ctx = null;
  let masterGain = null;
  let sfxGain = null;
  let musicGain = null;
  let muted = false;
  let disposed = false;
  let sincePrune = 0;
  let musicState = null;

  const activeVoices = new Set();
  const retryListeners = [];

  function isReady() {
    return !disposed && ctx !== null && ctx.state === "running";
  }

  function applyVolumes() {
    if (!ctx || !masterGain || !sfxGain || !musicGain) return;
    masterGain.gain.value = muted ? 0 : vol.master;
    sfxGain.gain.value = vol.sfx;
    musicGain.gain.value = vol.music;
  }

  function ensureContext() {
    if (ctx || disposed) return ctx;
    const Ctor =
      typeof globalThis !== "undefined"
        ? globalThis.AudioContext || globalThis.webkitAudioContext
        : null;
    if (!Ctor) return null;
    try {
      const created = new Ctor();
      const master = created.createGain();
      master.connect(created.destination);
      const sfx = created.createGain();
      sfx.connect(master);
      const musicBus = created.createGain();
      musicBus.connect(master);
      ctx = created;
      masterGain = master;
      sfxGain = sfx;
      musicGain = musicBus;
      applyVolumes();
      return ctx;
    } catch {
      ctx = null;
      return null;
    }
  }

  function busNode(bus) {
    if (bus === "master") return masterGain;
    if (bus === "sfx") return sfxGain;
    if (bus === "music") return musicGain;
    throw new Error(
      `audio: unknown bus ${JSON.stringify(bus)} — use "master", "sfx" or "music".`,
    );
  }

  function disarmRetry() {
    for (const entry of retryListeners) {
      window.removeEventListener(entry[0], entry[1]);
    }
    retryListeners.length = 0;
  }

  function tryResumeFromGesture() {
    if (!ctx) return;
    try {
      const result = ctx.resume();
      if (result && typeof result.then === "function") {
        result.then(
          () => {
            if (ctx && ctx.state === "running") disarmRetry();
          },
          () => undefined,
        );
      }
    } catch {
      // Resume refused; the gesture listeners stay armed for the next event.
    }
  }

  function armRetry() {
    if (retryListeners.length > 0 || typeof window === "undefined") return;
    for (const type of ["pointerdown", "keydown", "touchstart"]) {
      window.addEventListener(type, tryResumeFromGesture, { passive: true });
      retryListeners.push([type, tryResumeFromGesture]);
    }
  }

  function resume() {
    if (disposed) return Promise.resolve(false);
    const created = ensureContext();
    if (!created) return Promise.resolve(false);
    if (created.state === "running") {
      disarmRetry();
      return Promise.resolve(true);
    }
    armRetry();
    let result;
    try {
      result = created.resume();
    } catch {
      return Promise.resolve(false);
    }
    if (!result || typeof result.then !== "function") {
      return Promise.resolve(created.state === "running");
    }
    return result.then(
      () => {
        const ok = created.state === "running";
        if (ok) disarmRetry();
        return ok;
      },
      () => false,
    );
  }

  function play(name, opts = {}) {
    if (!isReady()) return null;
    const make = PRESETS[name];
    if (typeof make !== "function") return null;
    const dest = busNode(opts.bus !== undefined && opts.bus !== null ? opts.bus : "sfx");
    const voice = make(ctx, dest, opts, activeVoices);
    voice.name = String(name);
    return voice;
  }

  function tone(opts = {}) {
    if (!isReady()) return null;
    const dest = busNode(opts.bus !== undefined && opts.bus !== null ? opts.bus : "sfx");
    const voice = t(ctx, dest, opts, activeVoices);
    voice.name = "tone";
    return voice;
  }

  function noise(opts = {}) {
    if (!isReady()) return null;
    const dest = busNode(opts.bus !== undefined && opts.bus !== null ? opts.bus : "sfx");
    const voice = n(ctx, dest, opts, activeVoices);
    voice.name = "noise";
    return voice;
  }

  function releaseMusic(state, fade) {
    if (!state) return false;
    if (state.timer !== null) clearTimeout(state.timer);
    for (const voice of state.voices) voice.stop(fade);
    state.voices = [];
    return true;
  }

  function scheduleNextPass() {
    const state = musicState;
    if (!state || disposed || !ctx) return;
    const spb = 60 / state.pattern.bpm;
    const passStart = state.passStart;
    state.voices = state.voices.filter((voice) => !voice.ended);
    for (const step of state.pattern.steps) {
      const voice = t(
        ctx,
        state.dest,
        {
          freq: step.freq,
          type: step.type,
          dur: step.dur * spb,
          gain: step.gain * state.volume,
          delay: passStart + step.at * spb - ctx.currentTime,
        },
        activeVoices,
      );
      state.voices.push(voice);
    }
    state.passStart = passStart + state.pattern.passBeats * spb;
    if (state.loop) {
      const wait = Math.max(0, state.passStart - LOOKAHEAD_SECONDS - ctx.currentTime);
      state.timer = setTimeout(scheduleNextPass, wait * 1000);
    }
  }

  function music(nameOrPattern, opts = {}) {
    if (!isReady()) return null;
    let pattern = nameOrPattern;
    if (typeof pattern === "string") {
      pattern = MUSIC_PATTERNS[pattern];
      if (!pattern) return null;
    } else if (!pattern || typeof pattern !== "object") {
      throw new Error(
        'audio.music: expects a built-in name ("menu", "game", "battle", "calm") or a pattern object { bpm, steps }.',
      );
    }
    const normalized = normalizePattern(pattern);
    const dest = busNode(
      opts.bus !== undefined && opts.bus !== null ? opts.bus : "music",
    );
    const volume = num(opts.volume, 1);
    const loop = typeof opts.loop === "boolean" ? opts.loop : pattern.loop !== false;
    stopMusic({ fade: 0.03 });
    const state = {
      pattern: normalized,
      dest,
      volume,
      loop,
      passStart: ctx.currentTime + FIRST_PASS_DELAY,
      timer: null,
      voices: [],
    };
    musicState = state;
    scheduleNextPass();
    return {
      stop(fade) {
        if (musicState !== state) return false;
        return stopMusic({ fade });
      },
    };
  }

  function stopMusic(opts = {}) {
    const state = musicState;
    if (!state) return false;
    musicState = null;
    return releaseMusic(state, Math.max(0, num(opts.fade, 0.12)));
  }

  function mute(on) {
    muted = typeof on === "boolean" ? on : !muted;
    applyVolumes();
    return muted;
  }

  function toggleMute() {
    return mute();
  }

  function setVolume(bus, v) {
    const value = Number(v);
    if (!Number.isFinite(value)) {
      throw new Error(
        `audio.setVolume: "v" must be a finite number between 0 and 1 (got ${JSON.stringify(v)}).`,
      );
    }
    const clamped = clamp01(value);
    if (bus === "master") vol.master = clamped;
    else if (bus === "sfx") vol.sfx = clamped;
    else if (bus === "music") vol.music = clamped;
    else {
      throw new Error(
        `audio.setVolume: unknown bus ${JSON.stringify(bus)} — use "master", "sfx" or "music".`,
      );
    }
    applyVolumes();
    return clamped;
  }

  function volume(bus) {
    if (bus === "master") return vol.master;
    if (bus === "sfx") return vol.sfx;
    if (bus === "music") return vol.music;
    throw new Error(
      `audio.volume: unknown bus ${JSON.stringify(bus)} — use "master", "sfx" or "music".`,
    );
  }

  function update(dt) {
    if (disposed) return;
    const step = num(dt, 0);
    sincePrune += step > 0 ? step : 0;
    if (sincePrune < 1) return;
    sincePrune = 0;
    for (const voice of activeVoices) {
      if (voice.ended) activeVoices.delete(voice);
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    releaseMusic(musicState, 0);
    musicState = null;
    for (const voice of Array.from(activeVoices)) voice.stop(0.02);
    activeVoices.clear();
    disarmRetry();
    if (ctx) {
      try {
        const closing = ctx.close();
        if (closing && typeof closing.catch === "function") closing.catch(() => undefined);
      } catch {
        // The context was already closed; nothing to do.
      }
    }
    ctx = null;
    masterGain = null;
    sfxGain = null;
    musicGain = null;
  }

  return {
    play,
    tone,
    noise,
    music,
    stopMusic,
    mute,
    toggleMute,
    get isMuted() {
      return muted;
    },
    setVolume,
    volume,
    resume,
    get ready() {
      return isReady();
    },
    update,
    dispose,
  };
}

import * as THREE from "three";

// CPU-simulated particle pool with a custom shader (per-particle color and
// size attributes), plus themed helpers. No import-time side effects: the
// default texture is created lazily inside the factory.

let sharedTexture = null;

/** Soft radial dot used when no texture is supplied. Lazily created. */
function defaultTexture() {
	if (sharedTexture) return sharedTexture;
	const c = document.createElement("canvas");
	c.width = c.height = 64;
	const ctx = c.getContext("2d");
	const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
	g.addColorStop(0, "rgba(255,255,255,1)");
	g.addColorStop(0.4, "rgba(255,255,255,0.6)");
	g.addColorStop(1, "rgba(255,255,255,0)");
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, 64, 64);
	sharedTexture = new THREE.CanvasTexture(c);
	return sharedTexture;
}

const VERT = /* glsl */ `
attribute vec4 aColor;
attribute float aSize;
varying vec4 vColor;
uniform float uScale;
void main() {
	vColor = aColor;
	vec4 mv = modelViewMatrix * vec4(position, 1.0);
	gl_PointSize = aSize * uScale / max(0.001, -mv.z);
	gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
varying vec4 vColor;
uniform sampler2D uMap;
void main() {
	vec4 tex = texture2D(uMap, gl_PointCoord);
	gl_FragColor = vColor * tex;
	if (gl_FragColor.a < 0.01) discard;
}
`;

const DEFAULT_DIR = new THREE.Vector3(0, 1, 0);

/**
 * Create a particle system: a fixed-size pool simulated on the CPU each frame.
 * Add `system.object3d` to a scene to render it.
 * @param {object} [o] options
 * @param {number} [o.max=2000] pool size (hard cap on live particles)
 * @param {number} [o.gravity=-20] default vertical acceleration, matches physics.js
 * @param {number} [o.drag=1] per-second velocity damping, 0..1 (1 = none)
 * @param {THREE.Texture} [o.texture] point sprite map, defaults to a soft dot
 * @param {THREE.Blending} [o.blending=THREE.AdditiveBlending] blend mode
 * @param {boolean} [o.autoDispose=false] dispose GPU resources once the pool drains
 * @returns {{ object3d: THREE.Points, emit: (pos: object, opts?: object) => void, burst: (pos: object, opts?: object) => void, update: (dt: number) => void, clear: () => void, dispose: () => void, count: () => number, autoDispose: boolean }} particle system
 */
export function createParticles(o = {}) {
	const {
		max = 2000,
		gravity = -20,
		drag = 1,
		texture = null,
		blending = THREE.AdditiveBlending,
		autoDispose = false,
	} = o;

	const positions = new Float32Array(max * 3);
	const velocities = new Float32Array(max * 3);
	const colors = new Float32Array(max * 4);
	const sizes = new Float32Array(max);
	const sizeStarts = new Float32Array(max);
	const sizeEnds = new Float32Array(max);
	const gravities = new Float32Array(max);
	const life = new Float32Array(max); // remaining seconds, <= 0 = dead
	const maxLife = new Float32Array(max);
	let alive = 0;
	let disposed = false;
	let spawned = false; // autoDispose only after at least one emit

	const geo = new THREE.BufferGeometry();
	geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 4));
	geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
	geo.setDrawRange(0, 0);

	const mat = new THREE.ShaderMaterial({
		uniforms: {
			uMap: { value: texture || defaultTexture() },
			uScale: { value: 300 },
		},
		vertexShader: VERT,
		fragmentShader: FRAG,
		transparent: true,
		depthWrite: false,
		blending,
	});

	const points = new THREE.Points(geo, mat);
	points.frustumCulled = false;

	const dir = new THREE.Vector3();

	/**
	 * Spawn particles at a position.
	 * @param {THREE.Vector3|{x:number,y:number,z:number}} pos start position
	 * @param {object} [opts] spawn options
	 * @param {number} [opts.count=1] how many particles to spawn
	 * @param {THREE.ColorRepresentation} [opts.color=0xffffff] start color
	 * @param {number} [opts.size=1] start point size
	 * @param {number} [opts.sizeEnd] end point size (defaults to `size`)
	 * @param {number} [opts.speed=0] velocity magnitude
	 * @param {number} [opts.spread=0] cone half-angle in radians (PI = full sphere)
	 * @param {THREE.Vector3|{x:number,y:number,z:number}} [opts.direction] cone axis, default +Y
	 * @param {number} [opts.life=1] lifetime in seconds
	 * @param {number} [opts.gravity] vertical acceleration (defaults to system gravity)
	 */
	function emit(pos, opts = {}) {
		if (disposed) throw new Error("particles: emit() called after dispose(). Create a new system with createParticles().");
		spawned = true;
		const count = opts.count ?? 1;
		const color = new THREE.Color(opts.color ?? 0xffffff);
		const size = opts.size ?? 1;
		const sizeEnd = opts.sizeEnd ?? size;
		const lifeSec = opts.life ?? 1;
		const g = opts.gravity ?? gravity;
		const spread = opts.spread ?? 0;
		const speed = opts.speed ?? 0;
		dir.copy(opts.direction ? opts.direction : DEFAULT_DIR).normalize();
		// orthonormal basis around the cone axis
		const up = Math.abs(dir.y) > 0.95 ? UP_ALT : UP;
		const tan1 = new THREE.Vector3().crossVectors(dir, up).normalize();
		const tan2 = new THREE.Vector3().crossVectors(dir, tan1).normalize();
		const cosMin = Math.cos(spread);

		for (let n = 0; n < count; n++) {
			if (alive >= max) return;
			const i = alive++;
			// uniform direction inside the cone
			const cosT = cosMin + Math.random() * (1 - cosMin);
			const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
			const phi = Math.random() * Math.PI * 2;
			const s = speed * (0.5 + Math.random() * 0.5);
			const dx = dir.x + tan1.x * sinT * Math.cos(phi) + tan2.x * sinT * Math.sin(phi);
			const dy = dir.y + tan1.y * sinT * Math.cos(phi) + tan2.y * sinT * Math.sin(phi);
			const dz = dir.z + tan1.z * sinT * Math.cos(phi) + tan2.z * sinT * Math.sin(phi);
			const len = Math.hypot(dx, dy, dz) || 1;
			velocities[i * 3] = (dx / len) * s;
			velocities[i * 3 + 1] = (dy / len) * s;
			velocities[i * 3 + 2] = (dz / len) * s;

			positions[i * 3] = pos.x;
			positions[i * 3 + 1] = pos.y;
			positions[i * 3 + 2] = pos.z;
			colors[i * 4] = color.r;
			colors[i * 4 + 1] = color.g;
			colors[i * 4 + 2] = color.b;
			colors[i * 4 + 3] = 1;
			sizes[i] = size;
			sizeStarts[i] = size;
			sizeEnds[i] = sizeEnd;
			gravities[i] = g;
			life[i] = lifeSec;
			maxLife[i] = lifeSec;
		}
	}

	/**
	 * Spawn a batch of particles (same options as emit; `count` defaults to 20).
	 * @param {THREE.Vector3|{x:number,y:number,z:number}} pos start position
	 * @param {object} [opts] spawn options, `count` defaults to 20
	 */
	function burst(pos, opts = {}) {
		emit(pos, { count: 20, ...opts });
	}

	/**
	 * Advance the simulation and refresh the GPU buffers.
	 * @param {number} dt seconds since last frame
	 */
	function update(dt) {
		if (disposed || dt <= 0) return;
		const damp = drag > 0 && drag < 1 ? Math.pow(drag, dt * 60) : drag === 0 ? 0 : 1;
		let i = 0;
		while (i < alive) {
			life[i] -= dt;
			if (life[i] <= 0) {
				// swap-kill: move the newest live particle into this slot
				alive--;
				copyParticle(i, alive);
				continue;
			}
			velocities[i * 3 + 1] += gravities[i] * dt;
			if (damp !== 1) {
				velocities[i * 3] *= damp;
				velocities[i * 3 + 1] *= damp;
				velocities[i * 3 + 2] *= damp;
			}
			positions[i * 3] += velocities[i * 3] * dt;
			positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
			positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
			const k = life[i] / maxLife[i]; // 1 -> 0 over lifetime
			colors[i * 4 + 3] = k; // fade out
			sizes[i] = sizeStarts[i] + (sizeEnds[i] - sizeStarts[i]) * (1 - k);
			i++;
		}
		geo.setDrawRange(0, alive);
		geo.attributes.position.needsUpdate = true;
		geo.attributes.aColor.needsUpdate = true;
		geo.attributes.aSize.needsUpdate = true;
		if (spawned && alive === 0 && autoDispose && !disposed) dispose();
	}

	function copyParticle(from, to) {
		for (let k = 0; k < 3; k++) {
			positions[to * 3 + k] = positions[from * 3 + k];
			velocities[to * 3 + k] = velocities[from * 3 + k];
		}
		for (let k = 0; k < 4; k++) colors[to * 4 + k] = colors[from * 4 + k];
		sizes[to] = sizes[from];
		sizeStarts[to] = sizeStarts[from];
		sizeEnds[to] = sizeEnds[from];
		gravities[to] = gravities[from];
		life[to] = life[from];
		maxLife[to] = maxLife[from];
	}

	/** Remove every live particle without touching GPU resources. */
	function clear() {
		alive = 0;
		geo.setDrawRange(0, 0);
	}

	/** Free geometry and material. The texture stays with its owner. */
	function dispose() {
		if (disposed) return;
		disposed = true;
		geo.dispose();
		mat.dispose();
	}

	return {
		object3d: points,
		emit,
		burst,
		update,
		clear,
		dispose,
		count: () => alive,
		autoDispose,
	};
}

const UP = new THREE.Vector3(0, 1, 0);
const UP_ALT = new THREE.Vector3(1, 0, 0);

// --- themed helpers ---------------------------------------------------------
//
// Each helper takes (pos, opts). Pass `opts.system` to feed an existing
// emitter (required for per-frame effects like snow); otherwise a new
// one-shot system is created (autoDispose: true) and, when `opts.scene` is
// given, attached to that scene. The system is always returned.

const THEMES = {
	sparks: { count: 12, gravity: -22, blending: THREE.AdditiveBlending, life: 0.6, size: 0.35, color: 0xffd23f, speed: 7, spread: Math.PI },
	explosion: { count: 60, gravity: -14, blending: THREE.AdditiveBlending, life: 1.1, size: 0.7, color: 0xff8a3d, speed: 12, spread: Math.PI },
	smoke: { count: 14, gravity: 2, blending: THREE.NormalBlending, life: 2.4, size: 1.6, sizeEnd: 3, color: 0x9aa0a6, speed: 2, spread: Math.PI / 3 },
	confetti: { count: 40, gravity: -9, blending: THREE.NormalBlending, life: 2.6, size: 0.4, color: 0xff4d6d, speed: 8, spread: Math.PI / 2.4 },
	snow: { count: 6, gravity: -1.6, blending: THREE.NormalBlending, life: 6, size: 0.3, color: 0xffffff, speed: 0.6, spread: Math.PI / 8 },
	bubbles: { count: 5, gravity: 3, blending: THREE.AdditiveBlending, life: 3, size: 0.5, color: 0x9fe8ff, speed: 1.2, spread: Math.PI / 5 },
	fire: { count: 8, gravity: 6, blending: THREE.AdditiveBlending, life: 1.4, size: 0.8, sizeEnd: 0.2, color: 0xff6a1a, speed: 3, spread: Math.PI / 6 },
};

const PALETTES = {
	confetti: [0xff4d6d, 0xffd23f, 0x55e0ff, 0x7bff6b, 0xb06cff],
	fire: [0xff6a1a, 0xffd23f, 0xff3b1a],
};

function runTheme(name, pos, opts = {}) {
	const theme = THEMES[name];
	if (!theme) throw new Error(`Unknown particle theme "${name}".`);

	let system = opts.system;
	if (!system) {
		system = createParticles({
			max: opts.max ?? 2000,
			gravity: opts.gravity ?? theme.gravity,
			blending: opts.blending ?? theme.blending,
			autoDispose: opts.autoDispose ?? true,
		});
		if (opts.scene) opts.scene.add(system.object3d);
	}

	const palette = PALETTES[name];
	const spawn = {
		count: opts.count ?? theme.count,
		speed: opts.speed ?? theme.speed,
		spread: opts.spread ?? theme.spread,
		life: opts.life ?? theme.life,
		size: opts.size ?? theme.size,
		sizeEnd: opts.sizeEnd ?? theme.sizeEnd,
		direction: opts.direction ?? theme.direction,
		gravity: opts.gravity ?? theme.gravity,
	};
	const usePalette = palette && opts.color === undefined;
	if (!usePalette) spawn.color = opts.color ?? theme.color;

	if (usePalette) {
		// per-particle palette rotation: spawn in slices
		const per = Math.max(1, Math.floor(spawn.count / palette.length));
		let doneCount = 0;
		for (let i = 0; i < palette.length; i++) {
			const n = i === palette.length - 1 ? spawn.count - doneCount : per;
			if (n <= 0) continue;
			system.burst(pos, { ...spawn, count: n, color: palette[i] });
			doneCount += n;
		}
	} else {
		system.burst(pos, spawn);
	}
	return system;
}

/**
 * Emit a short burst of bright sparks (one-shot unless `system` is given).
 * @param {THREE.Vector3|{x:number,y:number,z:number}} pos emission point
 * @param {object} [opts] options: system, scene, count, color, size, sizeEnd, speed, spread, direction, life, gravity, blending
 * @returns {ReturnType<typeof createParticles>} the particle system
 */
export function sparks(pos, opts) {
	return runTheme("sparks", pos, opts);
}

/**
 * Emit a radial explosion burst of hot particles.
 * @param {THREE.Vector3|{x:number,y:number,z:number}} pos explosion center
 * @param {object} [opts] options: system, scene, count, color, size, sizeEnd, speed, spread, direction, life, gravity, blending
 * @returns {ReturnType<typeof createParticles>} the particle system
 */
export function explosion(pos, opts) {
	return runTheme("explosion", pos, opts);
}

/**
 * Emit slow-rising smoke puffs that grow as they fade.
 * @param {THREE.Vector3|{x:number,y:number,z:number}} pos smoke source
 * @param {object} [opts] options: system, scene, count, color, size, sizeEnd, speed, spread, direction, life, gravity, blending
 * @returns {ReturnType<typeof createParticles>} the particle system
 */
export function smoke(pos, opts) {
	return runTheme("smoke", pos, opts);
}

/**
 * Emit falling confetti from a color palette.
 * @param {THREE.Vector3|{x:number,y:number,z:number}} pos confetti origin
 * @param {object} [opts] options: system, scene, count, color, size, sizeEnd, speed, spread, direction, life, gravity, blending
 * @returns {ReturnType<typeof createParticles>} the particle system
 */
export function confetti(pos, opts) {
	return runTheme("confetti", pos, opts);
}

/**
 * Emit drifting snowflakes (pass `system` and call every frame for continuous snow).
 * @param {THREE.Vector3|{x:number,y:number,z:number}} pos snow spawn point
 * @param {object} [opts] options: system, scene, count, color, size, sizeEnd, speed, spread, direction, life, gravity, blending
 * @returns {ReturnType<typeof createParticles>} the particle system
 */
export function snow(pos, opts) {
	return runTheme("snow", pos, opts);
}

/**
 * Emit rising bubbles.
 * @param {THREE.Vector3|{x:number,y:number,z:number}} pos bubble source
 * @param {object} [opts] options: system, scene, count, color, size, sizeEnd, speed, spread, direction, life, gravity, blending
 * @returns {ReturnType<typeof createParticles>} the particle system
 */
export function bubbles(pos, opts) {
	return runTheme("bubbles", pos, opts);
}

/**
 * Emit upward-licking flames that shrink as they die.
 * @param {THREE.Vector3|{x:number,y:number,z:number}} pos fire source
 * @param {object} [opts] options: system, scene, count, color, size, sizeEnd, speed, spread, direction, life, gravity, blending
 * @returns {ReturnType<typeof createParticles>} the particle system
 */
export function fire(pos, opts) {
	return runTheme("fire", pos, opts);
}

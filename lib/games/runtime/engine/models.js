import * as THREE from "three";

// Procedural model factories. Every factory takes an options object, returns
// a THREE.Group with a dispose() method, and creates zero assets at import
// time — all geometry and materials are built inside the factory call.
// Nothing here imports from other engine modules: models stay independent.

/** @returns {{ geo: Set<THREE.BufferGeometry>, mat: Set<THREE.Material>, mesh: (g: THREE.BufferGeometry, m: THREE.Material, x?: number, y?: number, z?: number) => THREE.Mesh, done: (parts?: Record<string, THREE.Object3D>) => THREE.Group }} */
function scaffold() {
	const geo = new Set();
	const mat = new Set();
	const group = new THREE.Group();

	function track(g, m) {
		geo.add(g);
		mat.add(m);
		return new THREE.Mesh(g, m);
	}

	function mesh(g, m, x = 0, y = 0, z = 0) {
		const msh = track(g, m);
		msh.position.set(x, y, z);
		msh.castShadow = true;
		msh.receiveShadow = true;
		group.add(msh);
		return msh;
	}

	function done(parts) {
		group.userData.parts = parts || {};
		group.userData.dispose = () => {
			geo.forEach((g) => g.dispose());
			mat.forEach((m) => m.dispose());
		};
		return group;
	}

	return { geo, mat, mesh, done, group };
}

/** Merge geometries (with their world transforms applied) into one geometry. Inputs are disposed. */
function mergeGeometries(list) {
	if (list.length === 1) return list[0];
	let total = 0;
	for (const g of list) total += g.attributes.position.count;
	const pos = new Float32Array(total * 3);
	const nor = new Float32Array(total * 3);
	let o = 0;
	for (const g of list) {
		g.computeVertexNormals();
		pos.set(g.attributes.position.array, o * 3);
		nor.set(g.attributes.normal.array, o * 3);
		o += g.attributes.position.count;
		g.dispose();
	}
	const out = new THREE.BufferGeometry();
	out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
	out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
	return out;
}

/**
 * Procedural tree: tapered trunk + stacked foliage cones that sway in update().
 * @param {object} [o] options
 * @param {number} [o.height=4] total height
 * @param {number} [o.seed=1] seed for lean and color variation
 * @param {THREE.ColorRepresentation} [o.trunkColor=0x6b4a2f] trunk color
 * @param {THREE.ColorRepresentation} [o.leafColor=0x3f9b4f] foliage color
 * @param {number} [o.trunks=1] how many trees this group contains
 * @returns {THREE.Group} tree group with dispose() and update(dt, elapsed)
 */
export function makeTree(o = {}) {
	const { height = 4, seed = 1, trunkColor = 0x6b4a2f, leafColor = 0x3f9b4f, trunks = 1 } = o;
	const s = scaffold();
	const trunkMat = new THREE.MeshStandardMaterial({ color: trunkColor, roughness: 0.9 });
	const leafMat = new THREE.MeshStandardMaterial({ color: leafColor, roughness: 0.85 });
	s.mat.add(trunkMat);
	s.mat.add(leafMat);
	const foliage = [];
	for (let i = 0; i < trunks; i++) {
		const rnd = pseudo(seed * 31 + i * 7);
		const h = height * (0.8 + rnd * 0.4);
		const ox = trunks > 1 ? (rnd - 0.5) * height * 0.6 : 0;
		const oz = trunks > 1 ? (pseudo(seed * 13 + i) - 0.5) * height * 0.6 : 0;
		const trunkH = h * 0.45;
		s.mesh(new THREE.CylinderGeometry(h * 0.06, h * 0.09, trunkH, 7), trunkMat, ox, trunkH / 2, oz);
		const tiers = 3;
		for (let t = 0; t < tiers; t++) {
			const f = t / tiers;
			const r = h * (0.3 - f * 0.07);
			const cone = s.mesh(
				new THREE.ConeGeometry(r, h * 0.32, 8),
				leafMat,
				ox,
				trunkH + h * 0.18 + f * h * 0.26,
				oz
			);
			cone.userData.baseRot = (rnd - 0.5) * 0.12;
			cone.rotation.z = cone.userData.baseRot;
			cone.userData.phase = rnd * 6.28 + t;
			foliage.push(cone);
		}
	}
	const group = s.done();
	group.userData.update = (dt, elapsed) => {
		for (const leaf of foliage) {
			leaf.rotation.z = leaf.userData.baseRot + Math.sin(elapsed * 1.4 + leaf.userData.phase) * 0.05;
			leaf.rotation.x = Math.cos(elapsed * 1.1 + leaf.userData.phase) * 0.04;
		}
	};
	return group;
}

/**
 * Procedural rock: jittered icosahedron with a random rotation.
 * @param {object} [o] options
 * @param {number} [o.size=1] radius
 * @param {THREE.ColorRepresentation} [o.color=0x8a8f98] rock color
 * @param {number} [o.seed=1] seed for the vertex jitter
 * @param {number} [o.detail=1] icosahedron detail level
 * @returns {THREE.Group} rock group with dispose()
 */
export function makeRock(o = {}) {
	const { size = 1, color = 0x8a8f98, seed = 1, detail = 1 } = o;
	const s = scaffold();
	const geo = new THREE.IcosahedronGeometry(size, detail);
	const p = geo.attributes.position;
	for (let i = 0; i < p.count; i++) {
		const x = p.getX(i);
		const y = p.getY(i);
		const z = p.getZ(i);
		// Jitter by rounded position so shared corners move together
		// (no vertex tearing on non-indexed geometry).
		const k = 1 + (fract(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453) - 0.5) * 0.45;
		p.setXYZ(i, x * k, y * k * 0.8, z * k);
	}
	geo.computeVertexNormals();
	const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true });
	s.mat.add(mat);
	const msh = s.mesh(geo, mat);
	msh.rotation.set(pseudo(seed) * 0.4, pseudo(seed * 3) * 6.28, pseudo(seed * 5) * 0.3);
	return s.done();
}

/**
 * Procedural cloud: a cluster of soft spheres, drifting in update().
 * @param {object} [o] options
 * @param {number} [o.size=1] overall scale
 * @param {THREE.ColorRepresentation} [o.color=0xffffff] cloud color
 * @param {number} [o.puffs=5] number of spheres
 * @param {number} [o.seed=1] seed for puff placement
 * @returns {THREE.Group} cloud group with dispose() and update(dt, elapsed)
 */
export function makeCloud(o = {}) {
	const { size = 1, color = 0xffffff, puffs = 5, seed = 1 } = o;
	const s = scaffold();
	const mat = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: false });
	s.mat.add(mat);
	for (let i = 0; i < puffs; i++) {
		const a = pseudo(seed * 17 + i) * Math.PI * 2;
		const r = size * (0.4 + pseudo(seed * 23 + i) * 0.5);
		const sphere = s.mesh(
			new THREE.SphereGeometry(size * (0.4 + pseudo(seed * 5 + i) * 0.35), 10, 8),
			mat,
			Math.cos(a) * r,
			(pseudo(seed * 3 + i) - 0.5) * size * 0.3,
			Math.sin(a) * r
		);
		sphere.castShadow = false;
	}
	const group = s.done();
	group.userData.update = (dt, elapsed) => {
		group.position.x += Math.sin(elapsed * 0.2 + seed) * dt * 0.15;
	};
	return group;
}

/**
 * Procedural building: box tower with a merged grid of emissive windows.
 * @param {object} [o] options
 * @param {number} [o.width=4] footprint width
 * @param {number} [o.height=10] tower height
 * @param {number} [o.depth=4] footprint depth
 * @param {THREE.ColorRepresentation} [o.color=0x9aa3b0] facade color
 * @param {THREE.ColorRepresentation} [o.windowColor=0xffe9a8] lit window color
 * @param {number} [o.rows=6] window rows
 * @param {number} [o.cols=4] window columns per face
 * @param {number} [o.litRatio=0.7] fraction of windows lit
 * @param {number} [o.seed=1] seed for the lit pattern
 * @returns {THREE.Group} building group with dispose()
 */
export function makeBuilding(o = {}) {
	const {
		width = 4,
		height = 10,
		depth = 4,
		color = 0x9aa3b0,
		windowColor = 0xffe9a8,
		rows = 6,
		cols = 4,
		litRatio = 0.7,
		seed = 1,
	} = o;
	const s = scaffold();
	const wallMat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
	s.mat.add(wallMat);
	s.mesh(new THREE.BoxGeometry(width, height, depth), wallMat, 0, height / 2, 0);

	const winMat = new THREE.MeshStandardMaterial({
		color: 0x101418,
		emissive: windowColor,
		emissiveIntensity: 1.4,
		roughness: 0.4,
	});
	s.mat.add(winMat);
	const parts = [];
	const ww = (width / cols) * 0.55;
	const wh = (height / rows) * 0.5;
	const y0 = height * 0.12;
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			if (fract(Math.sin((r + 1) * 12.9898 + (c + 1) * 78.233 + seed) * 43758.5453) > litRatio) continue;
			const x = -width / 2 + (width / cols) * (c + 0.5);
			const y = y0 + (height * 0.78 / rows) * (r + 0.5);
			// front (+z) and back (-z)
			const f = new THREE.PlaneGeometry(ww, wh);
			f.translate(x, y, depth / 2 + 0.02);
			parts.push(f);
			const b = new THREE.PlaneGeometry(ww, wh);
			b.rotateY(Math.PI);
			b.translate(-x, y, -depth / 2 - 0.02);
			parts.push(b);
			// sides (+x / -x)
			const l = new THREE.PlaneGeometry(ww, wh);
			l.rotateY(-Math.PI / 2);
			l.translate(-width / 2 - 0.02, y, -x * (depth / width));
			parts.push(l);
			const rr = new THREE.PlaneGeometry(ww, wh);
			rr.rotateY(Math.PI / 2);
			rr.translate(width / 2 + 0.02, y, x * (depth / width));
			parts.push(rr);
		}
	}
	if (parts.length) s.mesh(mergeGeometries(parts), winMat);
	return s.done();
}

/**
 * Procedural ground: large plane with an optional grid on top.
 * @param {object} [o] options
 * @param {number} [o.size=40] plane edge length
 * @param {THREE.ColorRepresentation} [o.color=0x4f8f52] ground color
 * @param {boolean} [o.grid=false] overlay a grid helper
 * @param {number} [o.gridDivisions=20] grid divisions when grid is on
 * @returns {THREE.Group} ground group with dispose()
 */
export function makeGround(o = {}) {
	const { size = 40, color = 0x4f8f52, grid = false, gridDivisions = 20 } = o;
	const s = scaffold();
	const mat = new THREE.MeshStandardMaterial({ color, roughness: 1 });
	s.mat.add(mat);
	const plane = s.mesh(new THREE.PlaneGeometry(size, size), mat);
	plane.rotation.x = -Math.PI / 2;
	plane.receiveShadow = true;
	plane.castShadow = false;
	if (grid) {
		const gMat = new THREE.LineBasicMaterial({ color: 0x2c5a30 });
		s.mat.add(gMat);
		const gridGeo = new THREE.BufferGeometry();
		const verts = [];
		const half = size / 2;
		const step = size / gridDivisions;
		for (let i = 0; i <= gridDivisions; i++) {
			const p = -half + i * step;
			verts.push(-half, 0.01, p, half, 0.01, p);
			verts.push(p, 0.01, -half, p, 0.01, half);
		}
		gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
		s.geo.add(gridGeo);
		const lines = new THREE.LineSegments(gridGeo, gMat);
		lines.castShadow = false;
		lines.receiveShadow = false;
		s.group.add(lines);
	}
	return s.done();
}

/**
 * Procedural floating platform: box slab with an emissive rim.
 * @param {object} [o] options
 * @param {number} [o.width=4] platform width
 * @param {number} [o.depth=4] platform depth
 * @param {number} [o.thickness=0.5] slab thickness
 * @param {THREE.ColorRepresentation} [o.color=0x8d94a3] slab color
 * @param {THREE.ColorRepresentation} [o.rimColor=0x66e0ff] rim glow color
 * @returns {THREE.Group} platform group with dispose()
 */
export function makePlatform(o = {}) {
	const { width = 4, depth = 4, thickness = 0.5, color = 0x8d94a3, rimColor = 0x66e0ff } = o;
	const s = scaffold();
	const slab = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
	const rim = new THREE.MeshStandardMaterial({
		color: rimColor,
		emissive: rimColor,
		emissiveIntensity: 1.2,
		roughness: 0.4,
	});
	s.mat.add(slab);
	s.mat.add(rim);
	s.mesh(new THREE.BoxGeometry(width, thickness, depth), slab, 0, 0, 0);
	const edge = s.mesh(new THREE.BoxGeometry(width + 0.06, 0.08, depth + 0.06), rim, 0, thickness / 2, 0);
	edge.castShadow = false;
	return s.done();
}

/**
 * Procedural collectible coin: cylinder that spins in update().
 * @param {object} [o] options
 * @param {number} [o.size=0.5] coin radius
 * @param {THREE.ColorRepresentation} [o.color=0xffd23f] gold color
 * @param {number} [o.spinSpeed=2] radians per second
 * @returns {THREE.Group} coin group with dispose() and update(dt, elapsed)
 */
export function makeCoin(o = {}) {
	const { size = 0.5, color = 0xffd23f, spinSpeed = 2 } = o;
	const s = scaffold();
	const mat = new THREE.MeshStandardMaterial({
		color,
		metalness: 0.8,
		roughness: 0.25,
		emissive: color,
		emissiveIntensity: 0.15,
	});
	s.mat.add(mat);
	s.mesh(new THREE.CylinderGeometry(size, size, size * 0.15, 20), mat).rotation.x = Math.PI / 2;
	const group = s.done();
	group.userData.update = (dt) => {
		group.rotation.y += dt * spinSpeed;
	};
	return group;
}

/**
 * Procedural faceted gem: octahedron with a glossy material and a slow spin.
 * @param {object} [o] options
 * @param {number} [o.size=0.6] gem radius
 * @param {THREE.ColorRepresentation} [o.color=0x55e0ff] gem color
 * @param {number} [o.spinSpeed=1.2] radians per second
 * @returns {THREE.Group} gem group with dispose() and update(dt, elapsed)
 */
export function makeGem(o = {}) {
	const { size = 0.6, color = 0x55e0ff, spinSpeed = 1.2 } = o;
	const s = scaffold();
	const mat = new THREE.MeshStandardMaterial({
		color,
		metalness: 0.3,
		roughness: 0.1,
		emissive: color,
		emissiveIntensity: 0.35,
		flatShading: true,
	});
	s.mat.add(mat);
	s.mesh(new THREE.OctahedronGeometry(size, 0), mat);
	const group = s.done();
	group.userData.update = (dt) => {
		group.rotation.y += dt * spinSpeed;
	};
	return group;
}

/**
 * Procedural crystal cluster: merged shards on a shared base, pulsing in update().
 * @param {object} [o] options
 * @param {number} [o.size=1] cluster scale
 * @param {THREE.ColorRepresentation} [o.color=0xb06cff] crystal color
 * @param {number} [o.shards=5] shard count
 * @param {number} [o.seed=1] seed for shard placement
 * @returns {THREE.Group} crystal group with dispose() and update(dt, elapsed)
 */
export function makeCrystal(o = {}) {
	const { size = 1, color = 0xb06cff, shards = 5, seed = 1 } = o;
	const s = scaffold();
	const mat = new THREE.MeshStandardMaterial({
		color,
		metalness: 0.1,
		roughness: 0.15,
		emissive: color,
		emissiveIntensity: 0.5,
		flatShading: true,
		transparent: true,
		opacity: 0.9,
	});
	s.mat.add(mat);
	const parts = [];
	for (let i = 0; i < shards; i++) {
		const a = (i / shards) * Math.PI * 2 + pseudo(seed) * 2;
		const r = size * 0.35 * pseudo(seed * 7 + i);
		const h = size * (0.6 + pseudo(seed * 11 + i) * 0.8);
		const shard = new THREE.ConeGeometry(size * 0.18, h, 5);
		shard.rotateZ((pseudo(seed * 3 + i) - 0.5) * 0.7);
		shard.translate(Math.cos(a) * r, h / 2, Math.sin(a) * r);
		parts.push(shard);
	}
	s.mesh(mergeGeometries(parts), mat);
	const group = s.done();
	group.userData.update = (dt, elapsed) => {
		mat.emissiveIntensity = 0.4 + Math.sin(elapsed * 2.2) * 0.2;
	};
	return group;
}

/**
 * Procedural star: extruded 5-point star that pulses in update().
 * @param {object} [o] options
 * @param {number} [o.size=0.5] outer radius
 * @param {THREE.ColorRepresentation} [o.color=0xffe14d] star color
 * @returns {THREE.Group} star group with dispose() and update(dt, elapsed)
 */
export function makeStar(o = {}) {
	const { size = 0.5, color = 0xffe14d } = o;
	const s = scaffold();
	const shape = new THREE.Shape();
	const inner = size * 0.45;
	for (let i = 0; i < 10; i++) {
		const r = i % 2 === 0 ? size : inner;
		const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
		if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
		else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
	}
	shape.closePath();
	const mat = new THREE.MeshStandardMaterial({
		color,
		emissive: color,
		emissiveIntensity: 0.6,
		roughness: 0.4,
	});
	s.mat.add(mat);
	const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
	geo.center();
	s.mesh(geo, mat);
	const group = s.done();
	group.userData.baseScale = group.scale.clone();
	group.userData.update = (dt, elapsed) => {
		const k = 1 + Math.sin(elapsed * 3) * 0.08;
		group.scale.copy(group.userData.baseScale).multiplyScalar(k);
	};
	return group;
}

/**
 * Procedural treasure chest: base, hinged lid, and a merged lock plate.
 * @param {object} [o] options
 * @param {number} [o.size=1] chest scale
 * @param {THREE.ColorRepresentation} [o.color=0x8a5a2b] wood color
 * @param {THREE.ColorRepresentation} [o.metalColor=0xd8b64a] metal trim color
 * @returns {THREE.Group} chest group with dispose()
 */
export function makeChest(o = {}) {
	const { size = 1, color = 0x8a5a2b, metalColor = 0xd8b64a } = o;
	const s = scaffold();
	const wood = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
	const metal = new THREE.MeshStandardMaterial({ color: metalColor, metalness: 0.85, roughness: 0.3 });
	s.mat.add(wood);
	s.mat.add(metal);
	const w = size;
	const h = size * 0.6;
	const d = size * 0.7;
	s.mesh(new THREE.BoxGeometry(w, h, d), wood, 0, h / 2, 0);
	s.mesh(new THREE.BoxGeometry(w * 1.02, h * 0.4, d * 1.02), wood, 0, h + h * 0.2, 0);
	// lock plate + bands as merged geometry
	const plate = new THREE.BoxGeometry(w * 0.22, h * 0.3, 0.06);
	plate.translate(0, h * 0.75, d / 2 + 0.03);
	const band1 = new THREE.BoxGeometry(w * 0.1, h * 1.4, d * 1.04);
	band1.translate(-w * 0.3, h * 0.7, 0);
	const band2 = band1.clone();
	band2.translate(w * 0.6, 0, 0);
	s.mesh(mergeGeometries([plate, band1, band2]), metal);
	return s.done();
}

/**
 * Procedural heart pickup: extruded heart shape that pulses in update().
 * @param {object} [o] options
 * @param {number} [o.size=0.5] heart width
 * @param {THREE.ColorRepresentation} [o.color=0xff4d6d] heart color
 * @returns {THREE.Group} heart group with dispose() and update(dt, elapsed)
 */
export function makeHeart(o = {}) {
	const { size = 0.5, color = 0xff4d6d } = o;
	const s = scaffold();
	const shape = new THREE.Shape();
	const k = size;
	shape.moveTo(0, -k * 0.75);
	shape.bezierCurveTo(k * 0.9, -k * 0.1, k * 0.6, k * 0.75, 0, k * 0.35);
	shape.bezierCurveTo(-k * 0.6, k * 0.75, -k * 0.9, -k * 0.1, 0, -k * 0.75);
	const mat = new THREE.MeshStandardMaterial({
		color,
		emissive: color,
		emissiveIntensity: 0.5,
		roughness: 0.35,
	});
	s.mat.add(mat);
	const geo = new THREE.ExtrudeGeometry(shape, { depth: size * 0.3, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03 });
	geo.center();
	s.mesh(geo, mat);
	const group = s.done();
	group.userData.baseScale = group.scale.clone();
	group.userData.update = (dt, elapsed) => {
		const k2 = 1 + Math.sin(elapsed * 4) * 0.1;
		group.scale.copy(group.userData.baseScale).multiplyScalar(k2);
	};
	return group;
}

/**
 * Procedural crate: box with a merged edge frame.
 * @param {object} [o] options
 * @param {number} [o.size=1] crate edge length
 * @param {THREE.ColorRepresentation} [o.color=0xb0824a] wood color
 * @param {THREE.ColorRepresentation} [o.frameColor=0x7a5530] frame color
 * @returns {THREE.Group} crate group with dispose()
 */
export function makeCrate(o = {}) {
	const { size = 1, color = 0xb0824a, frameColor = 0x7a5530 } = o;
	const s = scaffold();
	const wood = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
	const frame = new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.8 });
	s.mat.add(wood);
	s.mat.add(frame);
	s.mesh(new THREE.BoxGeometry(size, size, size), wood, 0, size / 2, 0);
	// 12 edges merged into one geometry
	const t = size * 0.08;
	const h = size / 2;
	const bars = [];
	const add = (sx, sy, sz, x, y, z) => {
		const b = new THREE.BoxGeometry(sx, sy, sz);
		b.translate(x, y, z);
		bars.push(b);
	};
	for (const y of [-h, h]) {
		for (const z of [-h, h]) add(size + t, t, t, 0, y, z);
		for (const x of [-h, h]) add(t, t, size + t, x, y, 0);
	}
	for (const x of [-h, h]) for (const z of [-h, h]) add(t, size + t, t, x, 0, z);
	s.mesh(mergeGeometries(bars), frame).position.y = size / 2;
	return s.done();
}

/**
 * Procedural sword: blade, guard, and grip merged into one mesh.
 * @param {object} [o] options
 * @param {number} [o.length=1.6] overall sword length
 * @param {THREE.ColorRepresentation} [o.bladeColor=0xd8dde4] blade color
 * @param {THREE.ColorRepresentation} [o.hiltColor=0x8a5a2b] grip color
 * @returns {THREE.Group} sword group with dispose()
 */
export function makeSword(o = {}) {
	const { length = 1.6, bladeColor = 0xd8dde4, hiltColor = 0x8a5a2b } = o;
	const s = scaffold();
	const bladeMat = new THREE.MeshStandardMaterial({ color: bladeColor, metalness: 0.9, roughness: 0.15 });
	const hiltMat = new THREE.MeshStandardMaterial({ color: hiltColor, roughness: 0.7 });
	s.mat.add(bladeMat);
	s.mat.add(hiltMat);
	const gripLen = length * 0.25;
	const bladeLen = length - gripLen - length * 0.08;
	// blade: tapered flat box
	const blade = new THREE.BoxGeometry(length * 0.09, bladeLen, length * 0.025);
	blade.scale(1, 1, 1);
	blade.translate(0, gripLen + length * 0.08 + bladeLen / 2, 0);
	// tip
	const tip = new THREE.ConeGeometry(length * 0.045, length * 0.1, 4);
	tip.rotateY(Math.PI / 4);
	tip.translate(0, gripLen + length * 0.08 + bladeLen + length * 0.05, 0);
	s.mesh(mergeGeometries([blade, tip]), bladeMat);
	// guard + grip
	const guard = new THREE.BoxGeometry(length * 0.3, length * 0.05, length * 0.05);
	guard.translate(0, gripLen + length * 0.06, 0);
	const grip = new THREE.CylinderGeometry(length * 0.03, length * 0.035, gripLen, 8);
	grip.translate(0, gripLen / 2, 0);
	const pommel = new THREE.SphereGeometry(length * 0.045, 8, 6);
	pommel.translate(0, 0, 0);
	s.mesh(mergeGeometries([guard, grip, pommel]), hiltMat);
	return s.done();
}

/**
 * Procedural shield: rounded disc with a boss and rim.
 * @param {object} [o] options
 * @param {number} [o.size=0.8] shield radius
 * @param {THREE.ColorRepresentation} [o.color=0x4a7bd0] face color
 * @param {THREE.ColorRepresentation} [o.trimColor=0xd8b64a] trim color
 * @returns {THREE.Group} shield group with dispose()
 */
export function makeShield(o = {}) {
	const { size = 0.8, color = 0x4a7bd0, trimColor = 0xd8b64a } = o;
	const s = scaffold();
	const face = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2 });
	const trim = new THREE.MeshStandardMaterial({ color: trimColor, metalness: 0.8, roughness: 0.3 });
	s.mat.add(face);
	s.mat.add(trim);
	const disc = s.mesh(new THREE.CylinderGeometry(size, size, size * 0.1, 24), face);
	disc.rotation.x = Math.PI / 2;
	const rim = s.mesh(new THREE.TorusGeometry(size, size * 0.07, 8, 24), trim);
	rim.position.z = 0;
	const boss = s.mesh(new THREE.SphereGeometry(size * 0.2, 12, 8), trim);
	boss.position.z = size * 0.06;
	return s.done();
}

/**
 * Procedural ship: stylized boat or rocket built from primitives.
 * @param {object} [o] options
 * @param {"boat"|"rocket"} [o.style="boat"] which vehicle to build
 * @param {number} [o.size=1] overall scale
 * @param {THREE.ColorRepresentation} [o.color=0xc0563a] hull color
 * @param {THREE.ColorRepresentation} [o.accentColor=0xf2f2f2] accent color
 * @returns {THREE.Group} ship group with dispose()
 */
export function makeShip(o = {}) {
	const { style = "boat", size = 1, color = 0xc0563a, accentColor = 0xf2f2f2 } = o;
	if (style !== "boat" && style !== "rocket") {
		throw new Error(`makeShip: style must be "boat" or "rocket", got "${String(style)}".`);
	}
	const s = scaffold();
	const hull = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
	const accent = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.4 });
	s.mat.add(hull);
	s.mat.add(accent);
	if (style === "boat") {
		// hull: tapered box with a raised bow
		const hullGeo = new THREE.BoxGeometry(size * 1.2, size * 0.5, size * 3);
		hullGeo.translate(0, 0, 0);
		s.mesh(hullGeo, hull, 0, 0, 0);
		const bow = new THREE.ConeGeometry(size * 0.6, size * 1.2, 4);
		bow.rotateX(Math.PI / 2);
		bow.rotateY(Math.PI / 4);
		bow.scale(1, 0.45, 1);
		bow.translate(0, 0, size * 1.9);
		s.mesh(bow, hull);
		// cabin
		s.mesh(new THREE.BoxGeometry(size * 0.8, size * 0.6, size * 1), accent, 0, size * 0.5, -size * 0.3);
		// mast + sail
		const mast = new THREE.CylinderGeometry(size * 0.05, size * 0.05, size * 2, 6);
		mast.translate(0, size * 1.3, size * 0.4);
		s.mesh(mast, accent);
		const sail = new THREE.PlaneGeometry(size * 1.2, size * 1.4);
		sail.translate(0, size * 1.4, size * 0.4);
		const sailMesh = s.mesh(sail, accent);
		sailMesh.material.side = THREE.DoubleSide;
		sailMesh.castShadow = false;
	} else {
		// rocket: body + nose + fins
		const body = new THREE.CylinderGeometry(size * 0.5, size * 0.5, size * 2.4, 14);
		body.rotateX(Math.PI / 2);
		s.mesh(body, accent);
		const nose = new THREE.ConeGeometry(size * 0.5, size * 1.1, 14);
		nose.rotateX(Math.PI / 2);
		nose.translate(0, 0, size * 1.75);
		s.mesh(nose, hull);
		const windowRing = new THREE.TorusGeometry(size * 0.22, size * 0.05, 8, 16);
		windowRing.translate(0, 0, size * 0.5);
		const glass = new THREE.CircleGeometry(size * 0.2, 16);
		glass.translate(0, 0, size * 0.5);
		s.mesh(mergeGeometries([windowRing, glass]), hull);
		// fins
		const fins = [];
		for (let i = 0; i < 3; i++) {
			const a = (i / 3) * Math.PI * 2;
			const fin = new THREE.BoxGeometry(size * 0.1, size * 0.9, size * 0.7);
			fin.translate(0, size * 0.7, -size * 0.8);
			fin.rotateZ(a);
			fins.push(fin);
		}
		s.mesh(mergeGeometries(fins), hull);
	}
	return s.done();
}

/**
 * Procedural car: box body, cabin, and four wheels.
 * @param {object} [o] options
 * @param {number} [o.size=1] car scale
 * @param {THREE.ColorRepresentation} [o.color=0x3b82f6] body color
 * @param {THREE.ColorRepresentation} [o.wheelColor=0x1a1a1a] wheel color
 * @returns {THREE.Group} car group with dispose()
 */
export function makeCar(o = {}) {
	const { size = 1, color = 0x3b82f6, wheelColor = 0x1a1a1a } = o;
	const s = scaffold();
	const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.4 });
	const wheelMat = new THREE.MeshStandardMaterial({ color: wheelColor, roughness: 0.9 });
	const glassMat = new THREE.MeshStandardMaterial({
		color: 0xaad4ff,
		roughness: 0.1,
		metalness: 0.2,
		transparent: true,
		opacity: 0.7,
	});
	s.mat.add(bodyMat);
	s.mat.add(wheelMat);
	s.mat.add(glassMat);
	s.mesh(new THREE.BoxGeometry(size, size * 0.35, size * 2), bodyMat, 0, size * 0.35, 0);
	s.mesh(new THREE.BoxGeometry(size * 0.85, size * 0.3, size * 0.9), bodyMat, 0, size * 0.67, -size * 0.1);
	s.mesh(new THREE.BoxGeometry(size * 0.87, size * 0.22, size * 0.8), glassMat, 0, size * 0.67, -size * 0.1);
	const wheelGeo = new THREE.CylinderGeometry(size * 0.22, size * 0.22, size * 0.15, 14);
	for (const x of [-size * 0.5, size * 0.5]) {
		for (const z of [-size * 0.6, size * 0.6]) {
			const w = s.mesh(wheelGeo, wheelMat, x, size * 0.22, z);
			w.rotation.z = Math.PI / 2;
		}
	}
	return s.done();
}

/**
 * Procedural portal: torus frame with a pulsing inner disc that spins in update().
 * @param {object} [o] options
 * @param {number} [o.radius=1.5] portal radius
 * @param {THREE.ColorRepresentation} [o.color=0x8a5cff] energy color
 * @param {number} [o.spinSpeed=1] inner disc spin, radians per second
 * @returns {THREE.Group} portal group with dispose() and update(dt, elapsed)
 */
export function makePortal(o = {}) {
	const { radius = 1.5, color = 0x8a5cff, spinSpeed = 1 } = o;
	const s = scaffold();
	const frameMat = new THREE.MeshStandardMaterial({
		color,
		emissive: color,
		emissiveIntensity: 0.8,
		roughness: 0.3,
	});
	const discMat = new THREE.MeshBasicMaterial({
		color,
		transparent: true,
		opacity: 0.45,
		side: THREE.DoubleSide,
	});
	s.mat.add(frameMat);
	s.mat.add(discMat);
	s.mesh(new THREE.TorusGeometry(radius, radius * 0.12, 12, 32), frameMat);
	const disc = s.mesh(new THREE.CircleGeometry(radius * 0.9, 32), discMat);
	disc.castShadow = false;
	// swirl rings for visual interest
	const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
	s.mat.add(ringMat);
	const ring = s.mesh(new THREE.RingGeometry(radius * 0.3, radius * 0.42, 24), ringMat);
	ring.position.z = 0.02;
	ring.castShadow = false;
	const group = s.done();
	group.userData.update = (dt, elapsed) => {
		ring.rotation.z += dt * spinSpeed * 2;
		discMat.opacity = 0.35 + Math.sin(elapsed * 3) * 0.15;
		frameMat.emissiveIntensity = 0.7 + Math.sin(elapsed * 3) * 0.25;
	};
	return group;
}

/**
 * Procedural character: boxy humanoid with named parts and procedural
 * locomotion in update(dt, { speed, air, t }) — no AnimationMixer.
 * The character faces +Z (three.js forward).
 * @param {object} [o] options
 * @param {number} [o.height=1.8] total height in world units
 * @param {{ body?: THREE.ColorRepresentation, accent?: THREE.ColorRepresentation, skin?: THREE.ColorRepresentation }} [o.palette] colors for body, accent (limbs/trim), and skin
 * @param {"humanoid"} [o.style="humanoid"] character style
 * @returns {{ group: THREE.Group, parts: Record<string, THREE.Object3D>, update: (dt: number, state?: {speed?: number, air?: boolean, t?: number}) => void, dispose: () => void }} character with named parts
 */
export function makeCharacter(o = {}) {
	const { height = 1.8, palette = {}, style = "humanoid" } = o;
	if (style !== "humanoid") {
		throw new Error(`makeCharacter: style must be "humanoid", got "${String(style)}".`);
	}
	const body = palette.body ?? 0x3b82f6;
	const accent = palette.accent ?? 0x2d3748;
	const skin = palette.skin ?? 0xf2c29a;

	const s = scaffold();
	const bodyMat = new THREE.MeshStandardMaterial({ color: body, roughness: 0.7 });
	const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.8 });
	const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 });
	s.mat.add(bodyMat);
	s.mat.add(accentMat);
	s.mat.add(skinMat);

	const u = height / 1.8; // proportions are authored at height 1.8
	const head = s.mesh(new THREE.BoxGeometry(0.5 * u, 0.5 * u, 0.5 * u), skinMat, 0, 1.65 * u, 0);
	const torso = s.mesh(new THREE.BoxGeometry(0.6 * u, 0.7 * u, 0.35 * u), bodyMat, 0, 1.05 * u, 0);

	// Limbs pivot from the top joint: geometry is translated so its origin
	// sits at the joint, letting rotation.x swing the whole limb.
	function limb(w, h, d, mat, x, y) {
		const g = new THREE.BoxGeometry(w, h, d);
		g.translate(0, -h / 2, 0);
		return s.mesh(g, mat, x, y, 0);
	}

	const armL = limb(0.2 * u, 0.7 * u, 0.2 * u, skinMat, 0.42 * u, 1.35 * u);
	const armR = limb(0.2 * u, 0.7 * u, 0.2 * u, skinMat, -0.42 * u, 1.35 * u);
	const legL = limb(0.24 * u, 0.7 * u, 0.24 * u, accentMat, 0.16 * u, 0.7 * u);
	const legR = limb(0.24 * u, 0.7 * u, 0.24 * u, accentMat, -0.16 * u, 0.7 * u);

	const parts = { head, torso, armL, armR, legL, legR };
	const group = s.done(parts);

	const TORSO_Y = 1.05 * u;
	const HEAD_Y = 1.65 * u;
	let phase = 0;

	/**
	 * Advance procedural locomotion (walk cycle, air pose, idle bob).
	 * @param {number} dt seconds since last frame
	 * @param {{ speed?: number, air?: boolean, t?: number }} [state] movement state:
	 *   `speed` drives cadence and swing amplitude, `air` switches to a jump pose,
	 *   `t` overrides the animation phase (deterministic, for tests)
	 */
	function update(dt, state = {}) {
		const { speed = 0, air = false, t } = state;
		const moving = Math.abs(speed) > 0.01;
		phase += dt * (moving ? Math.max(6, Math.abs(speed) * 2.2) : 4);
		if (typeof t === "number") phase = t; // deterministic override

		const swing = moving ? Math.sin(phase) * 0.7 : Math.sin(phase) * 0.05;
		if (air) {
			armL.rotation.x = -0.9;
			armR.rotation.x = -0.9;
			legL.rotation.x = 0.4;
			legR.rotation.x = -0.3;
			torso.rotation.x = 0.1;
		} else {
			armL.rotation.x = swing;
			armR.rotation.x = -swing;
			legL.rotation.x = -swing;
			legR.rotation.x = swing;
			torso.rotation.x = moving ? 0.08 : 0;
		}
		// subtle bob: real bounce when running, gentle breath when idle
		const bob = moving ? Math.abs(Math.sin(phase)) * 0.05 * Math.min(1, Math.abs(speed) / 4) : Math.sin(phase * 0.5) * 0.02;
		torso.position.y = TORSO_Y + bob;
		head.position.y = HEAD_Y + bob;
		head.rotation.y = Math.sin(phase * 0.3) * 0.05;
	}

	group.userData.update = update;
	return { group, parts, update, dispose: group.userData.dispose };
}

// --- module-private helpers -------------------------------------------------

/** Deterministic pseudo-random in [0, 1) from an integer seed. */
function pseudo(seed) {
	return fract(Math.sin(seed * 12.9898) * 43758.5453);
}

/** Fractional part of n. */
function fract(n) {
	return n - Math.floor(n);
}

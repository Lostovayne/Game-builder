// Barrel for the seeded game kit: one import path, every public factory.
//
// Plain browser ESM — `export * from` each module, nothing else. Every module
// is side-effect free at import time, so importing this barrel costs nothing
// until a factory is called. Export names are unique across the kit (the
// contract this barrel is built from keeps them that way), so the star
// re-exports never collide.

export * from "./math.js"
export * from "./engine.js"
export * from "./controls.js"
export * from "./hud.js"
export * from "./audio.js"
export * from "./textures.js"
export * from "./materials.js"
export * from "./lighting.js"
export * from "./models.js"
export * from "./particles.js"
export * from "./animation.js"
export * from "./physics.js"
export * from "./camera.js"

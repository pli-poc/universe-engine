# Astrava

A WebGPU-native procedural universe prototype. The live entry is `demo.html`; the product website and engine documentation are published by GitHub Pages.

## Phase 2B: seam-safe terrain

Implemented: Float64 universe coordinates, rotating reference frames, camera-relative rendering, reverse-Z depth, a complete budget-bounded cube-sphere cut, neighbours across all six faces, atomic 2:1 balancing, geometric edge stitching without skirts, common-refinement source/target morphing, consistent outward winding/backface culling, and version-isolated scripts/shaders with visible GPU errors.

The selector uses projected patch footprint, not yet a certified geometric-error bound. It runs on the CPU with a max-heap. Horizon culling is NOT active. Logical cuts default to 1,536 tiles; transitional rendering has a separate 4,096-instance capacity. Endpoint surfaces morph together over 0.35 simulation seconds.

The environment is still a visual prototype: the sky is a rim approximation, terrain is seeded fractal noise, normals remain radial and low terrain is colored blue rather than being a separate ocean simulation. No landing physics or ground-level centimetre precision is claimed.

## Development

```sh
python -m http.server 8080
# open http://localhost:8080/demo.html
npm run check
npm run build
```

The static release goes to `dist/`. The build isolates the full engine dependency graph below `runtime/<commit>/engine/` and exposes its commit ID in the HUD.

## Controls

Click the viewport for pointer lock. Mouse looks; WASD flies; Q/E move vertically; Shift boosts; Esc releases the pointer. R resets orbit, L toggles the tile grid. Inspection buttons show near orbit, a cube-face seam, a cube corner and 10 km altitude. These are inspection poses, not a landing mode.

## Tests and publication

`npm run check` runs JavaScript syntax and all `tests/*.test.mjs` suites, including reference frames/depth, safe TypedArray uploads, cube topology, budget invariants and transition continuity. Linux browser CI uses Playwright Chromium with Vulkan/SwiftShader under Xvfb. `scripts/browser-smoke.mjs` tests real production rendering and failure states. `scripts/terrain-browser.mjs` tests the production vertex path with a flat coverage fragment shader through seams, corners, intermediate morphs, descent/ascent and six-root budgets. Both gate Pages publication; screenshots and JSON evidence are retained as Actions artifacts. Software-GPU timing is not a hardware performance benchmark.

## Documentation

- `docs/index.html`: architecture overview
- `docs/planets.html`: implemented planet system versus design targets
- `docs/terrain-2b.html`: complete Phase 2B contracts, algorithms, GPU ABI, test strategy and limitations
- `docs/rendering-recovery.md`: earlier renderer failure/recovery findings

Next: close-up precision and shading, physical atmosphere, real generated-tile residency/caching, and only then further rendering/simulation layers.

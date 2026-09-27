# Astrava

A WebGPU-native procedural universe prototype. `demo.html` is the live entry; the product website and engine documentation publish through GitHub Pages.

## Phase 2B: seam-safe terrain

Implemented: Float64 coordinates, rotating reference frames, camera-relative rendering, reverse-Z depth, budget-bounded cube-sphere cuts, cross-face neighbours, atomic 2:1 balancing, geometric stitching without skirts, coordinated source/target morphing, outward winding/backface culling, and version-isolated scripts/shaders with visible GPU errors.

The CPU selector uses projected patch footprint, not a certified geometric-error bound. Horizon culling is not active. Logical cuts default to 1,536 tiles; transitions have a separate 4,096-instance capacity and morph over 0.35 simulation seconds.

The environment remains a prototype: rim-light atmosphere, seeded fractal terrain, radial normals and blue low terrain rather than a separate ocean. No landing physics or centimetre-scale surface precision is claimed.

## Development

```sh
npm ci --ignore-scripts
npm run check
npm run build
npm run check:site
python -m http.server 8080 --directory dist
```

The build isolates the engine dependency graph below `runtime/<commit>/engine/` and exposes the commit in the HUD.

## Controls

Click for pointer lock. Mouse looks; WASD flies; Q/E move vertically; Shift boosts; Esc releases. R resets orbit, L toggles the tile grid. Inspection buttons show near orbit, a face seam, a cube corner and 10 km altitude, not a landing mode.

## Implemented tiered pipeline

`.github/workflows/pages.yml` calls reusable `validation.yml`. Every change runs fast tests and builds once. Conservative path classification selects docs-only, production smoke, or full regression. Full terrain validation retains all 67 cases in three independent parallel groups. Matching Playwright containers and locked npm dependencies avoid repeated browser provisioning. Tests explicitly step frames instead of redrawing continuously during screenshots.

The exact SHA256-verified build artifact is published after the required gate. A small fresh-browser check verifies published identity and a visible planet, rather than repeating full terrain regression. Weekly/manual exhaustive regression never deploys. Pipeline/tooling changes and unknown baselines default to full validation.

```sh
# Install browser/dependencies once when not using the matching container.
npx playwright install --with-deps chromium
xvfb-run -a npm run test:smoke
xvfb-run -a npm run test:browser
xvfb-run -a node scripts/terrain-browser.mjs --group=edges
xvfb-run -a npm run test:terrain
```

On a desktop display omit `xvfb-run -a`. Build first. `ASTRAVA_SCREENSHOTS=all` retains all successful captures; normal runs retain representative/failure PNGs and all JSON measurements. Software-GPU timing is not a hardware benchmark.

## Documentation

- [Engine overview](docs/index.html)
- [Planet system](docs/planets.html)
- [Phase 2B contracts and limitations](docs/terrain-2b.html)
- [Build, test and publish: complete pipeline](docs/pipeline.html)
- [Renderer recovery findings](docs/rendering-recovery.md)

Next engine layers remain close-up precision/shading, physical atmosphere and actual generated-tile caching. This CI update does not change the renderer.

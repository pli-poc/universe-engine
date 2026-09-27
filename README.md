# Astrava

Astrava is a WebGPU-native procedural universe engine and browser game technology demonstrator.

## Current status

**Phase 1 runtime proof has started.** The repository now includes a live WebGPU engine demo in `demo.html` with:

- Float64 authoritative solar-system coordinates
- hierarchical rotating reference frames
- camera-relative Float32 GPU rendering
- free-flight camera controls
- a procedural cube-sphere planet
- seeded WGSL terrain displacement
- stellar directional lighting
- first-pass atmospheric rim lighting
- runtime diagnostics for altitude, distance and frame time

This is intentionally **not yet** the final quadtree terrain system or physical atmosphere LUT implementation. Those are the next engine layers defined in the docs.

## Run locally

Serve the repository through HTTP (WebGPU modules and shader fetches require a web origin), for example:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080/demo.html` in a WebGPU-capable browser.

## Build/check

```bash
npm run check
npm run build
```

The deployable site is written to `dist/`.

## Controls

- click viewport: pointer lock
- mouse: look
- W/A/S/D: fly
- Q/E: down/up
- Shift: boost
- Esc: release pointer

## Architecture

See `docs/` for the reference-frame, renderer, planet, atmosphere, streaming, persistence and simulation design.

# Astrava

Astrava is a WebGPU-native procedural universe engine and browser game technology demonstrator.

## Current runtime

Phase 2 planetary geometry is now underway. The live `demo.html` includes:

- Float64 astronomical coordinates and hierarchical rotating reference frames
- camera-relative Float32 WebGPU rendering
- reusable patch-grid terrain geometry
- six-face cube-sphere addressing
- CPU quadtree selection with screen-size LOD and hysteresis
- horizon rejection
- instanced tile metadata instead of unique meshes
- terrain skirts to hide mixed-LOD edge cracks
- deterministic seeded WGSL terrain displacement and materials
- directional stellar lighting and first-pass atmosphere rim
- free-flight controls and live tile/LOD diagnostics

The selector intentionally runs on the CPU first. Its tile metadata format is already suitable for a later compute-driven visibility/indirect-draw path. Instance uploads use an exact Float32Array view for the selected tiles, avoiding offset/size unit ambiguity in WebGPU.

## Run locally

Serve the repository over HTTP, then open `demo.html`.

```bash
python -m http.server 8080
```

## Controls

Click viewport for pointer lock. Mouse looks; W/A/S/D flies; Q/E moves vertically; Shift boosts; Esc releases pointer.

## Next engine layers

1. validate quadtree seams and neighbor LOD constraints
2. tile residency/cache and parent fallback
3. move visibility selection toward WebGPU compute
4. physical atmosphere LUTs and continuous descent
5. local physics/collision and higher-frequency geological detail

See `docs/` for the architecture.

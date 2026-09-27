# Astrava

Astrava is a planned WebGPU-native procedural universe engine and browser game technology demonstrator.

This repository currently contains **Phase 0: product site + high-level/low-level technical design documentation**. The runtime 3D engine is intentionally not implemented yet.

## Commands

```bash
npm run check
npm run build
```

The static build is written to `dist/`.

## Documentation

Start at `docs/index.html`. The design covers reference frames, WebGPU rendering, cube-sphere planetary LOD, procedural geology, atmosphere/cloud/ocean/star rendering, streaming, persistence, physics and validation.

## Deployment

`.github/workflows/pages.yml` validates, builds and deploys `dist/` to GitHub Pages on pushes to `main`.

## Status

**Website/documentation:** implemented  
**3D engine runtime:** deliberately deferred to the next phase

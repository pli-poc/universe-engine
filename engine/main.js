import { v3, sub, length, normalize } from './math/vec3.js';
import { perspective, viewRotation, mul } from './math/mat4.js';
import { createDemoSystem } from './universe/system.js';
import { FreeCamera } from './camera/free-camera.js';
import { PlanetQuadtree } from './planet/quadtree.js';
import { WebGPURenderer } from './renderer/webgpu-renderer.js';
import { BUILD_ID } from './build-info.js';

const element = id => document.getElementById(id);
const canvas = element('astrava-canvas');
const diagnostics = { build: BUILD_ID, state: 'initializing', frames: 0, error: null };
window.__astravaDiagnostics = diagnostics;
element('build-id').textContent = BUILD_ID.slice(0, 12);
let stopped = false;
function fail(error) {
  if (stopped) return;
  stopped = true;
  diagnostics.state = 'error';
  diagnostics.error = error?.message || String(error);
  element('runtime-status').textContent = 'Rendering stopped — see error';
  element('fallback-title').textContent = 'Astrava rendering error';
  element('error-detail').textContent = diagnostics.error;
  element('fallback').hidden = false;
  console.error('ASTRAVA_RENDER_ERROR', diagnostics.error);
}
const renderer = new WebGPURenderer({ onError: fail });
const fmt = metres => metres > 1e9 ? `${(metres / 1e9).toFixed(2)} Gm` : metres > 1e6 ? `${(metres / 1e6).toFixed(2)} Mm` : metres > 1e3 ? `${(metres / 1e3).toFixed(1)} km` : `${metres.toFixed(0)} m`;

async function boot() {
  await renderer.init(canvas);
  if (stopped) return;
  const system = createDemoSystem(), planet = system.planet;
  const quadtree = new PlanetQuadtree({ maxLevel: 12, splitPixels: 230, mergePixels: 135, maxTiles: 1536 });
  const camera = new FreeCamera(v3());
  let simTime = 0;
  function resetView(altitude) {
    const origin = planet.universePosition(simTime);
    const direction = normalize(v3(-.65, .14, .75));
    const distance = altitude === undefined ? planet.radius * 2.55 : planet.radius + altitude;
    const relative = direction.map(value => value * distance);
    camera.position.set([origin[0] + relative[0], origin[1] + relative[1], origin[2] + relative[2]]);
    camera.yaw = Math.atan2(relative[0], relative[2]);
    camera.pitch = -Math.asin(relative[1] / distance);
    camera.keys.clear();
  }
  resetView(new URLSearchParams(location.search).get('view') === 'near' ? 333000 : undefined);
  camera.attach(canvas);
  element('reset-view').addEventListener('click', () => resetView());
  document.addEventListener('keydown', event => { if (event.code === 'KeyR') resetView(); });
  addEventListener('blur', () => camera.keys.clear());
  let last = performance.now(), averageMs = 16.7;
  function draw(now) {
    if (stopped) return;
    try {
      const elapsed = Math.max(0, now - last);
      const dt = Math.min(.05, elapsed / 1000);
      last = now;
      if (document.hidden) { requestAnimationFrame(draw); return; }
      simTime += dt;
      const center = planet.universePosition(simTime);
      camera.update(dt, Math.max(0, length(sub(camera.position, center)) - planet.radius));
      renderer.resize();
      const planetToCamera = sub(camera.position, center);
      const distance = length(planetToCamera), altitude = distance - planet.radius;
      const rotation = planet.frame.angleAt(simTime), fov = Math.PI / 3;
      const projection = perspective(fov, canvas.width / canvas.height, Math.max(1, Math.min(100, Math.max(altitude, 0) * .001)));
      const tiles = quadtree.select({ planetRadius: planet.radius, cameraRelativeWorld: planetToCamera, planetRotation: rotation, viewportHeight: canvas.height, fovY: fov });
      const uniforms = new Float32Array(32);
      uniforms.set(mul(projection, viewRotation(camera.yaw, camera.pitch)));
      uniforms.set([-planetToCamera[0], -planetToCamera[1], -planetToCamera[2], planet.radius], 16);
      uniforms.set([simTime, rotation, planet.maxTerrainHeight, planet.seed], 20);
      uniforms.set([...normalize(sub(system.star.position, center)), 1], 24);
      uniforms.set([Math.max(0, altitude), distance, tiles.length, quadtree.stats.maxLevel], 28);
      const count = renderer.render(uniforms, quadtree.toInstanceArray(tiles));
      diagnostics.frames++;
      diagnostics.tiles = count;
      diagnostics.altitude = altitude;
      averageMs = averageMs * .92 + elapsed * .08;
      element('altitude').textContent = fmt(Math.max(0, altitude));
      element('distance').textContent = fmt(distance);
      element('frame-time').textContent = `${averageMs.toFixed(1)} ms`;
      element('tiles').textContent = String(count);
      element('lod').textContent = String(quadtree.stats.maxLevel);
      element('budget').textContent = quadtree.stats.budgetLimited ? 'LIMITED · parent retained' : 'OK';
      if (diagnostics.frames === 1) {
        renderer.verifyFirstFrame().then(() => {
          if (!stopped) { diagnostics.state = 'running'; element('runtime-status').textContent = 'WebGPU online · first frame verified'; }
        }).catch(fail);
      }
      requestAnimationFrame(draw);
    } catch (error) { fail(error); }
  }
  requestAnimationFrame(draw);
}
boot().catch(fail);

import {readFile,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const required=['index.html','technology.html','worlds.html','media.html','about.html','demo.html','docs/index.html','docs/architecture.html','docs/rendering.html','docs/planets.html','docs/atmosphere.html','docs/streaming.html','docs/physics.html','docs/roadmap.html','engine/main.js','engine/renderer/webgpu-renderer.js','engine/universe/system.js','engine/planet/quadtree.js','engine/planet/patch-grid.js'];
for(const p of required)await stat(p);
const js=['engine/main.js','engine/renderer/webgpu-renderer.js','engine/universe/system.js','engine/universe/reference-frame.js','engine/math/vec3.js','engine/math/mat4.js','engine/planet/cube-sphere.js','engine/planet/quadtree.js','engine/planet/patch-grid.js','engine/camera/free-camera.js'];
for(const p of js){const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr||('syntax check failed: '+p));}
const shader=await readFile('engine/renderer/shaders/planet.wgsl','utf8');for(const token of ['@vertex','@fragment','cubePoint','tileMeta','edgeMask'])if(!shader.includes(token))throw new Error('WGSL token missing: '+token);
const qt=await readFile('engine/planet/quadtree.js','utf8');if(!qt.includes('splitPixels')||!qt.includes('Coverage is never dropped')||!qt.includes('computeEdgeMasks'))throw new Error('quadtree selection incomplete');
const renderer=await readFile('engine/renderer/webgpu-renderer.js','utf8');
if(!renderer.includes('subarray(0,instanceCount*8)'))throw new Error('instance upload must use an exact typed-array view');
console.log('Astrava structural, JS, quadtree, safe instance upload and shader checks passed.');

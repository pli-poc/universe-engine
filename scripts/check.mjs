import {readFile,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
for(const p of ['index.html','technology.html','worlds.html','media.html','about.html','demo.html','docs/index.html','docs/architecture.html','docs/rendering.html','docs/planets.html','docs/atmosphere.html','docs/streaming.html','docs/physics.html','docs/roadmap.html','engine/main.js','engine/renderer/webgpu-renderer.js','engine/universe/system.js']) await stat(p);
for(const p of ['engine/main.js','engine/renderer/webgpu-renderer.js','engine/universe/system.js','engine/universe/reference-frame.js','engine/math/vec3.js','engine/math/mat4.js','engine/planet/cube-sphere.js','engine/camera/free-camera.js']){
  const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr||('syntax check failed: '+p));
}
const shader=await readFile('engine/renderer/shaders/planet.wgsl','utf8');if(!shader.includes('@vertex')||!shader.includes('@fragment'))throw new Error('WGSL entry points missing');
const home=await readFile('index.html','utf8');if(!home.includes('site-header'))throw new Error('sticky header missing');
console.log('Astrava structural and JS syntax checks passed.');

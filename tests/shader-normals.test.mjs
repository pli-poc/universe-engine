import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('planet lighting normal follows displaced geometry rather than radial-only shading', async()=>{
  const shader=await readFile('engine/renderer/shaders/planet.wgsl','utf8');
  assert.match(shader,/fn displacedNormal\(i:VSOut\)->vec3<f32>/);
  assert.match(shader,/dpdx\(i\.worldPos\)/);
  assert.match(shader,/dpdy\(i\.worldPos\)/);
  assert.match(shader,/cross\(dx,dy\)/);
  assert.match(shader,/if\(dot\(n,radial\)<0\.0\)\{n=-n;\}/);
  assert.match(shader,/let n=displacedNormal\(i\)/);
});

test('radial normal remains only as a degenerate geometric-normal fallback', async()=>{
  const shader=await readFile('engine/renderer/shaders/planet.wgsl','utf8');
  assert.match(shader,/if\(l2<1e-10\)\{return radial;\}/);
  assert.doesNotMatch(shader,/@fragment fn fsMain[\s\S]{0,120}let n=normalize\(i\.normal\)/);
});

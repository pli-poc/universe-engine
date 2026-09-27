import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {tileAt} from '../engine/planet/topology.js';
import {tileAnchorCameraRelative} from '../engine/planet/tile-anchor.js';
import {renderInstances,RENDER_INSTANCE_FLOATS} from '../engine/planet/transitions.js';

test('tile-local anchor preserves a small camera-relative value near a planetary surface',()=>{
  const tile=tileAt(4,0,0,0),radius=6371000;
  const anchor=tileAnchorCameraRelative(tile,radius,0,[0,0,-6381000]);
  assert.ok(Math.abs(anchor[2]+10000)<1e-6,`unexpected anchor ${anchor}`);
  assert.ok(Math.abs(anchor[0])<1e-9&&Math.abs(anchor[1])<1e-9);
});
test('render instance ABI carries four anchor floats after transition metadata',()=>{
  const tile=tileAt(4,0,0,0),data=renderInstances([{...tile,source:tile,target:tile}],()=>[1,2,3,0]);
  assert.equal(RENDER_INSTANCE_FLOATS,20);assert.equal(data.length,20);assert.deepEqual([...data.slice(16,20)],[1,2,3,0]);
});
test('surface shader contains local anchors, PBR, HDR transform and debug views',async()=>{
  const s=await readFile('engine/renderer/shaders/planet.wgsl','utf8');
  for(const token of ['anchorCamera','toCameraRelative','materialWeights','distributionGGX','visibilitySmith','aces','linearToSrgb','renderParams'])assert.ok(s.includes(token),token);
  assert.ok(s.includes('dpdx(i.worldPos)')&&s.includes('dpdy(i.worldPos)'));
});

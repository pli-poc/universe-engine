import test from 'node:test';
import assert from 'node:assert/strict';
import {facePoint,faceDirection} from '../engine/planet/cube-sphere.js';
import {tileAt,FACE_EDGES,edgeUV,pointUV,neighborAddress,neighborsOf} from '../engine/planet/topology.js';
import {PlanetQuadtree,worldToPlanet} from '../engine/planet/quadtree.js';
import {TerrainTransitions,transitionCut,renderInstances,RENDER_INSTANCE_FLOATS} from '../engine/planet/transitions.js';
import {createPatchGrid} from '../engine/planet/patch-grid.js';
import {uploadInstances} from '../engine/renderer/buffer-upload.js';
import {surface,morphSurface,renderVertex,RES} from './surface-reference.mjs';
const R=6371000,normalize=a=>{const l=Math.hypot(...a);return a.map(v=>v/l);};
const rotate=(v,a)=>[Math.cos(a)*v[0]+Math.sin(a)*v[2],v[1],-Math.sin(a)*v[0]+Math.cos(a)*v[2]];
const camera=(direction=[0,0,1],altitude=333000,rotation=0)=>({planetRadius:R,cameraRelativeWorld:rotate(normalize(direction).map(v=>v*(R+altitude)),rotation),planetRotation:rotation,viewportHeight:1080,fovY:Math.PI/3});
const close=(a,b,tol=1e-6)=>assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<tol,`${a} != ${b}`);
function validateCut(tiles,budget=Infinity){
 assert.ok(tiles.length<=budget);const map=new Map(tiles.map(t=>[t.key,t]));assert.equal(map.size,tiles.length);
 for(let face=0;face<6;face++)assert.ok(Math.abs(tiles.filter(t=>t.face===face).reduce((a,t)=>a+t.size*t.size,0)-4)<1e-10,'Complete face '+face);
 for(const t of tiles){
  for(let l=t.level-1;l>=0;l--){const s=2**(t.level-l);assert.ok(!map.has(`${t.face}:${l}:${Math.floor(t.x/s)}:${Math.floor(t.y/s)}`),'Overlapping ancestor');}
  for(let e=0;e<4;e++)for(const n of neighborsOf(map,t,e)){assert.ok(Math.abs(n.level-t.level)<=1,`Unbalanced ${t.key} -> ${n.key}`);assert.equal(!!(t.edgeMask&(1<<e)),n.level<t.level,'Stitch owned by finer tile');}
 }
 return map;
}
test('all 24 directed cube edges round-trip at levels 0..12, including reversed axes',()=>{
 for(let face=0;face<6;face++)for(let e=0;e<4;e++){
  const c=FACE_EDGES[face][e],back=FACE_EDGES[c.face][c.edge];assert.equal(back.face,face);assert.equal(back.edge,e);assert.equal(back.reversed,c.reversed);
  for(const level of [0,1,4,12])for(const fraction of [0,.5,1]){const n=2**level,k=Math.min(n-1,Math.floor(fraction*n)),x=e===1?n-1:e===3?0:k,y=e===0?0:e===2?n-1:k;const t=tileAt(face,level,x,y),a=neighborAddress(t,e),b=neighborAddress(a,a.edge);assert.equal(b.key,t.key);for(const s of [0,.125,.5,.875,1])close(facePoint(face,...edgeUV(t,e,s)),facePoint(a.face,...edgeUV(a,a.edge,a.reversed?1-s:s)),1e-12);}
 }
});
test('outward winding on all six faces, without skirts or duplicate walls',()=>{
 const mesh=createPatchGrid(4);assert.equal(mesh.vertices.length/4,25);assert.equal(mesh.indices.length,96);
 for(let face=0;face<6;face++)for(let i=0;i<mesh.indices.length;i+=3){const p=[0,1,2].map(k=>{const j=mesh.indices[i+k]*4;return faceDirection(face,mesh.vertices[j]*2-1,mesh.vertices[j+1]*2-1);});const a=p[1].map((v,j)=>v-p[0][j]),b=p[2].map((v,j)=>v-p[0][j]);const c=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];assert.ok(c.reduce((s,v,j)=>s+v*p[0][j],0)>0);}
 assert.throws(()=>createPatchGrid(3));
});
test('atomic balancing fits tiny and saturated budgets without holes',()=>{for(const budget of [6,8,9,24,60,192,512,1536]){const q=new PlanetQuadtree({maxTiles:budget});for(const d of [[0,0,1],[1,0,1],[-1,1,1],[0,1,0]])validateCut(q.select(camera(d,1000)),budget);}});
test('rotating-frame invariance selects identical tiles for an equivalent camera',()=>{const pose=camera([-1,.1,1],333000);for(const angle of [.2,Math.PI/2,Math.PI,5.8]){close(worldToPlanet(rotate(pose.cameraRelativeWorld,angle),angle),pose.cameraRelativeWorld,1e-8);const a=new PlanetQuadtree({maxTiles:300}),b=new PlanetQuadtree({maxTiles:300});assert.deepEqual(a.select(pose).map(t=>[t.key,t.edgeMask]),b.select(camera([-1,.1,1],333000,angle)).map(t=>[t.key,t.edgeMask]));}});
test('descent, ascent, six faces and cube corners retain complete balanced cuts',()=>{const q=new PlanetQuadtree({maxTiles:300});for(const d of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],[1,1,1],[-1,-1,-1]])for(const alt of [1e7,333000,10000,1000,10000,333000,1e7])validateCut(q.select(camera(d,alt)),300);});
const makeCut=(d,budget)=>new PlanetQuadtree({maxTiles:budget}).select(camera(d,10000));
test('common refinement fits old+new budgets and remains balanced',()=>{for(const [a,b] of [[24,60],[96,192],[300,300]]){const from=makeCut([-1,.2,1],a),to=makeCut([1,1,1],b),union=transitionCut(from,to);validateCut(union,from.length+to.length-6);for(const t of union){assert.ok(t.source.level<=t.level);assert.ok(t.target.level<=t.level);}assert.equal(renderInstances(union).length,union.length*RENDER_INSTANCE_FLOATS);}});
test('stitched chords agree through every morph phase, across cube faces',()=>{
 const union=transitionCut(makeCut([-1,.2,1],96),makeCut([1,1,1],150)),map=validateCut(union);let stitched=0,crossFace=0;
 for(const t of union)for(let e=0;e<4;e++){
  const neighbors=neighborsOf(map,t,e);if(neighbors.length!==1||neighbors[0].level>t.level)continue;const n=neighbors[0];if(t.edgeMask&(1<<e))stitched++;if(n.face!==t.face)crossFace++;
  for(const alpha of [0,.2,.5,.8,1])for(let j=0;j<=RES;j++){const uv=edgeUV(t,e,j/RES),otherUV=pointUV(n.face,facePoint(t.face,...uv));const x=e===1?RES:e===3?0:j,y=e===0?0:e===2?RES:j;close(renderVertex(t,x,y,alpha),morphSurface(n,otherUV,alpha),5e-8);}
 }
 assert.ok(stitched>10);assert.ok(crossFace>10);
});
test('transition endpoints equal old/new surfaces at sampled vertices',()=>{const union=transitionCut(makeCut([-1,.2,1],96),makeCut([1,1,1],150));for(const t of union)for(let y=0;y<=RES;y+=4)for(let x=0;x<=RES;x+=4){const uv=[t.u0+t.size*x/RES,t.v0+t.size*y/RES];close(renderVertex(t,x,y,0),surface(t.source,uv),1e-8);close(renderVertex(t,x,y,1),surface(t.target,uv),1e-8);}});
test('transitions freeze targets, obey draw capacity and settle without overlap',()=>{
 const a=makeCut([0,0,1],24),b=makeCut([1,0,1],60),c=makeCut([-1,0,1],96),m=new TerrainTransitions({capacity:192});assert.equal(m.offer(a),true);assert.equal(m.alpha,1);assert.equal(m.offer(b),true);assert.equal(m.active,true);assert.equal(m.alpha,0);assert.equal(m.offer(c),false);
 m.advance(.175);assert.ok(Math.abs(m.alpha-.5)<1e-12);validateCut(m.renderTiles,192);m.advance(.175);assert.equal(m.active,false);assert.equal(m.alpha,1);assert.equal(m.current,b);validateCut(m.renderTiles,192);
 const tight=new TerrainTransitions({capacity:24});tight.offer(a);assert.equal(tight.offer(c),false);assert.equal(tight.current,a);validateCut(tight.renderTiles,24);assert.throws(()=>m.advance(-1));
});
test('invalid LOD inputs fail explicitly',()=>{assert.throws(()=>new PlanetQuadtree({maxTiles:5}));assert.throws(()=>new PlanetQuadtree({mergePixels:300}));assert.throws(()=>new PlanetQuadtree().select({...camera(),planetRotation:NaN}));});
test('16-float transition records upload completely, retaining TypedArray offsets',()=>{const allocation=new Float32Array(64),data=allocation.subarray(16,48),calls=[];const q={writeBuffer(...args){calls.push(args);}};assert.equal(uploadInstances(q,{},data,4096,16),2);assert.equal(calls[0].length,3);assert.equal(calls[0][2],data);assert.equal(data.byteLength,128);assert.throws(()=>uploadInstances(q,{},new Float32Array(17),4096,16));});

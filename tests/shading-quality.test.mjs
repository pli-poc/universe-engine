import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {shadingDifference} from '../scripts/testing/shading-quality.mjs';
const image=rgb=>({width:32,height:32,data:Uint8Array.from({length:32*32*4},(_,i)=>i%4===3?255:rgb[i%4])});
test('shading metrics accept identical frames and expose salt-and-pepper noise',()=>{
 const clean=image([90,110,130]),noisy=image([90,110,130]);
 assert.equal(shadingDifference(clean,clean).mean,0);
 for(let i=0;i<noisy.data.length;i+=8)for(let c=0;c<3;c++)noisy.data[i+c]=230;
 assert.ok(shadingDifference(clean,noisy).mean>20);
});
test('normal metric measures angular perturbation and rejects invalid normals',()=>{
 const normal=image([128,128,255]),tilted=image([150,128,253]);
 assert.ok(shadingDifference(normal,tilted,{normals:true}).max<12.5);
 assert.ok(shadingDifference(normal,image([200,128,232]),{normals:true}).max>20);
 assert.throws(()=>shadingDifference(normal,image([255,255,255]),{normals:true}),/Non-unit/);
});
test('normal-detail shader filters the input spectrum and bounds tangent slopes',async()=>{
 const s=await readFile('engine/renderer/shaders/planet.wgsl','utf8');
 const detail=s.slice(s.indexOf('fn detailNormal('),s.indexOf('fn pow5('));
 assert.match(detail,/dpdx\(radial\)/);assert.match(detail,/dpdy\(radial\)/);
 assert.doesNotMatch(detail,/dpdx\(d\)|dpdy\(d\)|normalize\(dpdx/);
 assert.match(s,/1.0-smoothstep\(0.125,0.5,cellsPerPixel\)/);
 assert.match(detail,/0.18\/max\(length\(gradient\),1e-8\)/);
 assert.match(detail,/bodyNormal\*dot\(gradient,bodyNormal\)/);
 assert.match(detail,/rotateY\(radial,-rotation\)/);
 for(const width of ['2048.0','256.0','32.0','4.0'])assert.ok(detail.includes(width));
});

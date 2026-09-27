import test from 'node:test';
import assert from 'node:assert/strict';
import {WebGPURenderer} from '../engine/renderer/webgpu-renderer.js';
test('at most two frames are queued, and completion restores capacity',async()=>{
 const done=[],errors=[];const r=new WebGPURenderer({onError:e=>errors.push(e)});
 r.resize=()=>{};r.depth={createView:()=>({})};r.context={getCurrentTexture:()=>({createView:()=>({})})};
 const pass={setPipeline(){},setBindGroup(){},setVertexBuffer(){},setIndexBuffer(){},end(){}};
 r.device={queue:{writeBuffer(){},submit(){},onSubmittedWorkDone(){return new Promise(resolve=>done.push(resolve));}},createCommandEncoder(){return {beginRenderPass:()=>pass,finish:()=>({})};}};
 assert.equal(r.canRender,true);r.render(new Float32Array(32),new Float32Array());r.render(new Float32Array(32),new Float32Array());
 assert.equal(r.inFlight,2);assert.equal(r.canRender,false);assert.throws(()=>r.render(new Float32Array(32),new Float32Array()),/saturated/);
 done[0]();await Promise.resolve();assert.equal(r.inFlight,1);assert.equal(r.canRender,true);
 done[1]();await Promise.resolve();assert.equal(r.inFlight,0);assert.equal(errors.length,0);
});
test('queue failure is exposed and prevents more frames',()=>{
 const errors=[],r=new WebGPURenderer({onError:e=>errors.push(e)});r.fail(new Error('test queue failure'));assert.equal(r.canRender,false);assert.equal(errors.length,1);assert.throws(()=>r.render(new Float32Array(32),new Float32Array()),/test queue failure/);
});
test('GPU error objects preserve their diagnostic message rather than their object tag',()=>{
 const messages=[],r=new WebGPURenderer({onError:e=>messages.push(e.message)});
 r.fail({message:'planet.wgsl:1:1 error: unexpected token',toString:()=> '[object GPUValidationError]'});
 assert.deepEqual(messages,['planet.wgsl:1:1 error: unexpected token']);assert.equal(r.canRender,false);
});

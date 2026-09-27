import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createPatchGrid } from '../engine/planet/patch-grid.js';
import { PlanetQuadtree } from '../engine/planet/quadtree.js';
import { perspective, viewRotation, mul } from '../engine/math/mat4.js';
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><canvas id="c" width="640" height="480"></canvas>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const original=await readFile('engine/renderer/shaders/planet.wgsl','utf8');
const mesh=createPatchGrid(32);
const q=new PlanetQuadtree({maxLevel:12,maxTiles:4095});
const r=6371000;const camera=[0,r*.18,r*2.55];
const tiles=q.select({planetRadius:r,cameraRelativeWorld:camera,planetRotation:0,viewportHeight:480,fovY:Math.PI/3});
const u=new Float32Array(32);u.set(mul(perspective(Math.PI/3,640/480,100,r*30),viewRotation(0,-.07)));u.set([0,-camera[1],-camera[2],r],16);u.set([0,0,12000,1847],20);u.set([-1,0,0,1],24);
for(const mode of ['flat','procedural']) {
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
 const page=await browser.newPage();
 page.on('console',m=>console.log(mode,m.type(),m.text()));
 page.on('pageerror',e=>console.log(mode,'PAGE_ERROR',e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 try {
  const result=await page.evaluate(async data=>{
   const gpu=navigator.gpu;const adapter=await gpu.requestAdapter();const device=await adapter.requestDevice();window.keep={gpu,adapter,device};
   const errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));device.lost.then(i=>{console.log('LOST',i.message);errors.push(i.message)});
   console.log('DEVICE_READY');
   const module=device.createShaderModule({code:data.code});
   console.log('MODULE_CREATED');
   const info=await module.getCompilationInfo();console.log('COMPILE_INFO',JSON.stringify(info.messages.map(x=>({type:x.type,text:x.message,line:x.lineNum}))));
   const format=navigator.gpu.getPreferredCanvasFormat();const canvas=document.querySelector('#c');const context=canvas.getContext('webgpu');context.configure({device,format});
   const pipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module,entryPoint:'vsMain',buffers:[{arrayStride:16,attributes:[{shaderLocation:0,offset:0,format:'float32x4'}]},{arrayStride:32,stepMode:'instance',attributes:[{shaderLocation:1,offset:0,format:'float32x4'},{shaderLocation:2,offset:16,format:'float32x4'}]}]},fragment:{module,entryPoint:'fsMain',targets:[{format}]},primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth24plus',depthWriteEnabled:true,depthCompare:'less'}});
   console.log('PIPELINE_READY');
   const make=(array,usage)=>{let buffer=device.createBuffer({size:array.byteLength,usage:usage|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(buffer,0,array);return buffer};
   const ub=make(new Float32Array(data.u),GPUBufferUsage.UNIFORM);const vb=make(new Float32Array(data.v),GPUBufferUsage.VERTEX);const ib=make(new Uint32Array(data.i),GPUBufferUsage.INDEX);const inst=make(new Float32Array(data.instances),GPUBufferUsage.VERTEX);
   const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:ub}}]});
   const depth=device.createTexture({size:[640,480],format:'depth24plus',usage:GPUTextureUsage.RENDER_ATTACHMENT});
   const encoder=device.createCommandEncoder();const pass=encoder.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:1},loadOp:'clear',storeOp:'store'}],depthStencilAttachment:{view:depth.createView(),depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'store'}});
   pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.setVertexBuffer(0,vb);pass.setVertexBuffer(1,inst);pass.setIndexBuffer(ib,'uint32');pass.drawIndexed(data.i.length,data.instances.length/8);pass.end();device.queue.submit([encoder.finish()]);await device.queue.onSubmittedWorkDone();await new Promise(r=>setTimeout(r,500));return {errors,tiles:data.instances.length/8};
  },{code:mode==='flat'?original.replace('let h=terrain(d);','let h=0.0;'):original,u:[...u],v:[...mesh.vertices],i:[...mesh.indices],instances:[...q.toInstanceArray(tiles)]});
  console.log('PROBE_RESULT',mode,JSON.stringify(result));
 } catch(e) {console.log('PROBE_FAILURE',mode,e.message);}
 await browser.close();
}
await new Promise(r=>server.close(r));

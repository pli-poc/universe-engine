import { createPatchGrid } from '../planet/patch-grid.js';
import { PATCH_RESOLUTION, RENDER_INSTANCE_FLOATS } from '../planet/transitions.js';
import { uploadInstances } from './buffer-upload.js';
export class WebGPURenderer {
  constructor({onError=()=>{}}={}){this.onError=onError;this.error=null;this.instanceCapacity=4096;this.disposed=false;}
  fail(error){if(this.disposed||this.error)return;this.error=error instanceof Error?error:new Error(String(error));this.onError(this.error);}
  async init(canvas){
    this.gpu=navigator.gpu;if(!this.gpu)throw new Error('WebGPU is unavailable. Use an HTTPS page and a WebGPU-capable browser.');
    this.canvas=canvas;this.adapter=await this.gpu.requestAdapter({powerPreference:'high-performance'});
    if(!this.adapter)throw new Error('The browser could not provide a WebGPU adapter.');
    this.device=await this.adapter.requestDevice();
    this.device.addEventListener('uncapturederror',event=>this.fail(event.error));
    this.device.lost.then(info=>{if(info.reason!=='destroyed')this.fail(new Error(`WebGPU device lost (${info.reason}): ${info.message}`));});
    this.context=canvas.getContext('webgpu');if(!this.context)throw new Error('Unable to create a WebGPU canvas context.');
    this.format=this.gpu.getPreferredCanvasFormat();
    const response=await fetch(new URL('./shaders/planet.wgsl',import.meta.url));if(!response.ok)throw new Error(`Planet shader failed to load: HTTP ${response.status}`);
    const code=(await response.text()).replace('const GRID: f32 = 32.0;',`const GRID: f32 = ${PATCH_RESOLUTION}.0;`);
    const module=this.device.createShaderModule({label:'Astrava stitched planet WGSL',code});
    const compilation=await module.getCompilationInfo(),errors=compilation.messages.filter(m=>m.type==='error');
    if(errors.length)throw new Error(errors.map(m=>`planet.wgsl:${m.lineNum}:${m.linePos} ${m.message}`).join('\n'));
    const mesh=createPatchGrid(PATCH_RESOLUTION);this.indexCount=mesh.indices.length;
    const makeBuffer=(label,data,usage)=>{const b=this.device.createBuffer({label,size:data.byteLength,usage:usage|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(b,0,data);return b;};
    this.vertexBuffer=makeBuffer('Surface-only patch vertices',mesh.vertices,GPUBufferUsage.VERTEX);this.indexBuffer=makeBuffer('Outward CCW patch indices',mesh.indices,GPUBufferUsage.INDEX);
    this.uniformBuffer=this.device.createBuffer({label:'Planet uniforms',size:128,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    this.instanceBuffer=this.device.createBuffer({label:'Terrain transition instances',size:this.instanceCapacity*RENDER_INSTANCE_FLOATS*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
    this.pipeline=await this.device.createRenderPipelineAsync({label:'Astrava stitched terrain reverse-Z',layout:'auto',
      vertex:{module,entryPoint:'vsMain',buffers:[
        {arrayStride:16,stepMode:'vertex',attributes:[{shaderLocation:0,offset:0,format:'float32x4'}]},
        {arrayStride:RENDER_INSTANCE_FLOATS*4,stepMode:'instance',attributes:[{shaderLocation:1,offset:0,format:'float32x4'},{shaderLocation:2,offset:16,format:'float32x4'},{shaderLocation:3,offset:32,format:'float32x4'},{shaderLocation:4,offset:48,format:'float32x4'}]},
      ]},fragment:{module,entryPoint:'fsMain',targets:[{format:this.format}]},primitive:{topology:'triangle-list',cullMode:'back',frontFace:'ccw'},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'greater'}});
    this.bindGroup=this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniformBuffer}}]});
    this.resize();this.resizeObserver=new ResizeObserver(()=>{try{this.resize();}catch(e){this.fail(e);}});this.resizeObserver.observe(canvas);if(this.error)throw this.error;
  }
  resize(){
    if(!this.device||this.disposed||this.error)return;
    const dpr=Math.min(globalThis.devicePixelRatio||1,1.5),limit=this.device.limits.maxTextureDimension2D;
    const width=Math.max(1,Math.min(limit,Math.floor(this.canvas.clientWidth*dpr))),height=Math.max(1,Math.min(limit,Math.floor(this.canvas.clientHeight*dpr)));
    if(this.depth&&this.canvas.width===width&&this.canvas.height===height)return;
    this.canvas.width=width;this.canvas.height=height;this.context.configure({device:this.device,format:this.format,alphaMode:'opaque'});this.depth?.destroy();
    this.depth=this.device.createTexture({label:'Planet reverse-Z depth',size:[width,height],format:'depth32float',usage:GPUTextureUsage.RENDER_ATTACHMENT});
  }
  render(uniforms,instances){
    if(this.error)throw this.error;if(this.disposed)throw new Error('Renderer is disposed');
    if(!(uniforms instanceof Float32Array)||uniforms.length!==32||!uniforms.every(Number.isFinite))throw new Error('Invalid planet uniforms');
    this.resize();this.device.queue.writeBuffer(this.uniformBuffer,0,uniforms);
    const count=uploadInstances(this.device.queue,this.instanceBuffer,instances,this.instanceCapacity,RENDER_INSTANCE_FLOATS);
    const encoder=this.device.createCommandEncoder({label:'Planet frame'}),pass=encoder.beginRenderPass({
      colorAttachments:[{view:this.context.getCurrentTexture().createView(),clearValue:{r:.0015,g:.004,b:.008,a:1},loadOp:'clear',storeOp:'store'}],
      depthStencilAttachment:{view:this.depth.createView(),depthClearValue:0,depthLoadOp:'clear',depthStoreOp:'store'},
    });
    pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.bindGroup);pass.setVertexBuffer(0,this.vertexBuffer);pass.setVertexBuffer(1,this.instanceBuffer);pass.setIndexBuffer(this.indexBuffer,'uint32');if(count)pass.drawIndexed(this.indexCount,count);pass.end();this.device.queue.submit([encoder.finish()]);return count;
  }
  async verifyFirstFrame(){await this.device.queue.onSubmittedWorkDone();if(this.error)throw this.error;}
  dispose(){this.disposed=true;this.resizeObserver?.disconnect();for(const key of ['depth','vertexBuffer','indexBuffer','instanceBuffer','uniformBuffer'])this[key]?.destroy();this.context?.unconfigure();this.device?.destroy();}
}

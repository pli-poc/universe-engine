
import {createCubeSphere} from "../planet/cube-sphere.js";
export class WebGPURenderer{
  async init(canvas){
    if(!navigator.gpu)throw new Error("WebGPU unavailable");
    this.canvas=canvas;this.adapter=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});
    if(!this.adapter)throw new Error("No WebGPU adapter");
    this.device=await this.adapter.requestDevice();
    this.context=canvas.getContext("webgpu");this.format=navigator.gpu.getPreferredCanvasFormat();
    const shaderText=await fetch(new URL("./shaders/planet.wgsl",import.meta.url)).then(r=>r.text());
    const module=this.device.createShaderModule({code:shaderText});
    const mesh=createCubeSphere(64);this.indexCount=mesh.indices.length;
    this.vertexBuffer=this.device.createBuffer({size:mesh.vertices.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
    this.indexBuffer=this.device.createBuffer({size:mesh.indices.byteLength,usage:GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST});
    this.device.queue.writeBuffer(this.vertexBuffer,0,mesh.vertices);this.device.queue.writeBuffer(this.indexBuffer,0,mesh.indices);
    this.uniformBuffer=this.device.createBuffer({size:128,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    this.pipeline=this.device.createRenderPipeline({
      layout:"auto",
      vertex:{module,entryPoint:"vsMain",buffers:[{arrayStride:12,attributes:[{shaderLocation:0,offset:0,format:"float32x3"}]}]},
      fragment:{module,entryPoint:"fsMain",targets:[{format:this.format}]},
      primitive:{topology:"triangle-list",cullMode:"back"},
      depthStencil:{format:"depth24plus",depthWriteEnabled:true,depthCompare:"less"}
    });
    this.bindGroup=this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniformBuffer}}]});
    this.resize();
    new ResizeObserver(()=>this.resize()).observe(canvas);
  }
  resize(){
    if(!this.device)return;
    const dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.floor(this.canvas.clientWidth*dpr)),h=Math.max(1,Math.floor(this.canvas.clientHeight*dpr));
    if(this.canvas.width===w&&this.canvas.height===h)return;
    this.canvas.width=w;this.canvas.height=h;
    this.context.configure({device:this.device,format:this.format,alphaMode:"opaque"});
    this.depth=this.device.createTexture({size:[w,h],format:"depth24plus",usage:GPUTextureUsage.RENDER_ATTACHMENT});
  }
  render(uniformFloats){
    this.resize();this.device.queue.writeBuffer(this.uniformBuffer,0,uniformFloats);
    const encoder=this.device.createCommandEncoder();
    const pass=encoder.beginRenderPass({
      colorAttachments:[{view:this.context.getCurrentTexture().createView(),clearValue:{r:.0015,g:.004,b:.008,a:1},loadOp:"clear",storeOp:"store"}],
      depthStencilAttachment:{view:this.depth.createView(),depthClearValue:1,depthLoadOp:"clear",depthStoreOp:"store"}
    });
    pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.bindGroup);pass.setVertexBuffer(0,this.vertexBuffer);pass.setIndexBuffer(this.indexBuffer,"uint32");pass.drawIndexed(this.indexCount);pass.end();
    this.device.queue.submit([encoder.finish()]);
  }
}

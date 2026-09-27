import { createPatchGrid } from '../planet/patch-grid.js';
import { uploadInstances } from './buffer-upload.js';

export class WebGPURenderer {
  constructor({ onError = () => {} } = {}) {
    this.onError = onError;
    this.error = null;
    this.instanceCapacity = 4096;
    this.disposed = false;
  }
  fail(error) {
    if (this.disposed || this.error) return;
    this.error = error instanceof Error ? error : new Error(String(error));
    this.onError(this.error);
  }
  async init(canvas) {
    this.gpu = navigator.gpu;
    if (!this.gpu) throw new Error('WebGPU is unavailable. Use an HTTPS page and a WebGPU-capable browser.');
    this.canvas = canvas;
    this.adapter = await this.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!this.adapter) throw new Error('The browser could not provide a WebGPU adapter.');
    this.device = await this.adapter.requestDevice();
    this.device.addEventListener('uncapturederror', event => this.fail(event.error));
    this.device.lost.then(info => {
      if (info.reason !== 'destroyed') this.fail(new Error(`WebGPU device lost (${info.reason}): ${info.message}`));
    });
    this.context = canvas.getContext('webgpu');
    if (!this.context) throw new Error('Unable to create a WebGPU canvas context.');
    this.format = this.gpu.getPreferredCanvasFormat();
    const response = await fetch(new URL('./shaders/planet.wgsl', import.meta.url));
    if (!response.ok) throw new Error(`Planet shader failed to load: HTTP ${response.status}`);
    const module = this.device.createShaderModule({ label: 'Astrava planet WGSL', code: await response.text() });
    const compilation = await module.getCompilationInfo();
    const errors = compilation.messages.filter(message => message.type === 'error');
    if (errors.length) throw new Error(errors.map(m => `planet.wgsl:${m.lineNum}:${m.linePos} ${m.message}`).join('\n'));
    const mesh = createPatchGrid(32);
    this.indexCount = mesh.indices.length;
    const makeBuffer = (label, data, usage) => {
      const buffer = this.device.createBuffer({ label, size: data.byteLength, usage: usage | GPUBufferUsage.COPY_DST });
      this.device.queue.writeBuffer(buffer, 0, data);
      return buffer;
    };
    this.vertexBuffer = makeBuffer('Planet patch vertices', mesh.vertices, GPUBufferUsage.VERTEX);
    this.indexBuffer = makeBuffer('Planet patch indices', mesh.indices, GPUBufferUsage.INDEX);
    this.uniformBuffer = this.device.createBuffer({ label: 'Planet uniforms', size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.instanceBuffer = this.device.createBuffer({ label: 'Planet tile instances', size: this.instanceCapacity * 32, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.pipeline = await this.device.createRenderPipelineAsync({
      label: 'Astrava planet reverse-Z', layout: 'auto',
      vertex: { module, entryPoint: 'vsMain', buffers: [
        { arrayStride: 16, stepMode: 'vertex', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }] },
        { arrayStride: 32, stepMode: 'instance', attributes: [
          { shaderLocation: 1, offset: 0, format: 'float32x4' },
          { shaderLocation: 2, offset: 16, format: 'float32x4' },
        ] },
      ] },
      fragment: { module, entryPoint: 'fsMain', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' },
    });
    this.bindGroup = this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }] });
    this.resize();
    this.resizeObserver = new ResizeObserver(() => {
      try { this.resize(); } catch (error) { this.fail(error); }
    });
    this.resizeObserver.observe(canvas);
    if (this.error) throw this.error;
  }
  resize() {
    if (!this.device || this.disposed || this.error) return;
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 1.5);
    const limit = this.device.limits.maxTextureDimension2D;
    const width = Math.max(1, Math.min(limit, Math.floor(this.canvas.clientWidth * dpr)));
    const height = Math.max(1, Math.min(limit, Math.floor(this.canvas.clientHeight * dpr)));
    // Matching default canvas dimensions must not skip initial context/depth setup.
    if (this.depth && this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.context.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });
    this.depth?.destroy();
    this.depth = this.device.createTexture({ label: 'Planet reverse-Z depth', size: [width, height], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT });
  }
  render(uniforms, instances) {
    if (this.error) throw this.error;
    if (this.disposed) throw new Error('Renderer is disposed');
    if (!(uniforms instanceof Float32Array) || uniforms.length !== 32 || !uniforms.every(Number.isFinite)) throw new Error('Invalid planet uniforms');
    this.resize();
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniforms);
    const count = uploadInstances(this.device.queue, this.instanceBuffer, instances, this.instanceCapacity);
    const encoder = this.device.createCommandEncoder({ label: 'Planet frame' });
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: this.context.getCurrentTexture().createView(), clearValue: { r: .0015, g: .004, b: .008, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: this.depth.createView(), depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.setVertexBuffer(1, this.instanceBuffer);
    pass.setIndexBuffer(this.indexBuffer, 'uint32');
    if (count) pass.drawIndexed(this.indexCount, count);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    return count;
  }
  async verifyFirstFrame() {
    await this.device.queue.onSubmittedWorkDone();
    if (this.error) throw this.error;
  }
  dispose() {
    this.disposed = true;
    this.resizeObserver?.disconnect();
    for (const key of ['depth', 'vertexBuffer', 'indexBuffer', 'instanceBuffer', 'uniformBuffer']) this[key]?.destroy();
    this.context?.unconfigure();
    this.device?.destroy();
  }
}

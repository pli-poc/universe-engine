import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve('dist');
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!path.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    const body = await readFile(path);
    const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.wgsl':'text/plain', '.svg':'image/svg+xml', '.json':'application/json'};
    res.writeHead(200, {'Content-Type':types[extname(path)] || 'application/octet-stream', 'Cache-Control':'no-store'});
    res.end(body);
  } catch { res.writeHead(404).end('Not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = process.env.ASTRAVA_BASE_URL || `http://127.0.0.1:${server.address().port}/`;
const name = process.env.ASTRAVA_TEST_NAME || 'local';
await mkdir('test-results', {recursive:true});
// Vulkan compositing and Xvfb are required for WebGPU canvas interop in Linux CI.
const browser = await chromium.launch({headless:false, args:['--enable-gpu','--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--enable-features=Vulkan','--use-vulkan=swiftshader','--use-angle=swiftshader','--use-webgpu-adapter=swiftshader','--disable-vulkan-surface','--no-sandbox']});
const page = await browser.newPage({viewport:{width:960,height:720}, deviceScaleFactor:1});
const events = [];
page.on('pageerror', e => { events.push({type:'pageerror', message:e.message}); console.log('PAGE_ERROR:',e.message); });
page.on('console', m => { if (events.length < 80) { events.push({type:m.type(),message:m.text()}); console.log('BROWSER:',m.type(),m.text()); } });
await page.addInitScript(() => {
  window.__gpuErrors = []; window.__submitted = 0;
  if (typeof GPUAdapter === 'undefined') return;
  const request = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function(...args) {
    const device = await request.apply(this,args);
    device.addEventListener('uncapturederror', e => { window.__gpuErrors.push(e.error.message); console.error('GPU_VALIDATION',e.error.message); });
    device.lost.then(info => { if(info.reason!=='destroyed') window.__gpuErrors.push('Device lost: '+info.message); });
    return device;
  };
  const submit = GPUQueue.prototype.submit;
  GPUQueue.prototype.submit = function(...args) { window.__submitted++; return submit.apply(this,args); };
});
let failure;
try {
  await page.goto(base+'demo.html', {waitUntil:'networkidle', timeout:60000});
  await page.waitForTimeout(4000);
  const state = await page.evaluate(() => ({secure:isSecureContext, gpu:!!navigator.gpu, errors:window.__gpuErrors, submitted:window.__submitted, status:document.querySelector('#runtime-status')?.textContent, tiles:document.querySelector('#tiles')?.textContent, diagnostic:window.__astravaDiagnostics || null}));
  console.log('RENDER_STATE:',JSON.stringify(state));
  await writeFile(`test-results/${name}-state.json`,JSON.stringify({state,events},null,2));
  await page.screenshot({path:`test-results/${name}-page.png`});
  await page.addStyleTag({content:'.engine-hud,.site-header,.engine-fallback{visibility:hidden!important}'});
  const pngBytes = await page.locator('#astrava-canvas').screenshot();
  await writeFile(`test-results/${name}-canvas.png`,pngBytes);
  const png = PNG.sync.read(pngBytes);
  const bg = [...png.data.slice(0,3)]; let foreground=0;const colors=new Set();
  for (let i=0;i<png.data.length;i+=4) {
    if(Math.max(...bg.map((v,c)=>Math.abs(png.data[i+c]-v)))>8) foreground++;
    colors.add((png.data[i]<<16)|(png.data[i+1]<<8)|png.data[i+2]);
  }
  const fraction = foreground/(png.width*png.height);
  console.log('RENDER_PIXELS:',JSON.stringify({width:png.width,height:png.height,bg,foreground,fraction,colors:colors.size}));
  assert.equal(events.filter(e=>e.type==='pageerror').length,0,'JavaScript runtime exceptions');
  assert.equal(state.errors.length,0,'WebGPU validation errors');
  assert.ok(state.submitted>=2,'At least two frames must reach WebGPU');
  assert.ok(fraction>0.01 && fraction<0.90 && colors.size>64,'Visible planet against space, not blank or a full-screen error');
  console.log('WEBGPU_SMOKE_PASS:',name);
} catch (e) { failure=e; }
finally { await browser.close(); await new Promise(r=>server.close(r)); }
if(failure) throw failure;

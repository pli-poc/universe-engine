/** Shared browser harness. No production shader/geometry is substituted here. */
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';

export async function harness({ coverage = false, width = 960, height = 720, name = 'browser' } = {}) {
  const root = resolve('dist');
  let server, browser;
  const results = [], errors = [], requests = [];
  const output = `test-results/${name}`;
  await mkdir(output, { recursive: true });
  let base = process.env.ASTRAVA_BASE_URL;
  if (!base) {
    server = createServer(async (req, res) => {
      try {
        const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
        if (!path.startsWith(root + '/')) { res.writeHead(403).end(); return; }
        const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.wgsl':'text/plain', '.json':'application/json', '.svg':'image/svg+xml' };
        const body = await readFile(path);
        res.writeHead(200, { 'Content-Type':types[extname(path)] || 'application/octet-stream', 'Cache-Control':'no-store' });
        res.end(body);
      } catch { res.writeHead(404).end('Not found'); }
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}/`;
  }
  base = base.replace(/\/?$/, '/');
  const expected = process.env.ASTRAVA_EXPECT_COMMIT || process.env.GITHUB_SHA || JSON.parse(await readFile('dist/build-info.json', 'utf8')).commit;
  try {
    browser = await chromium.launch({
      headless: false,
      ...(process.env.ASTRAVA_CHROMIUM ? { executablePath:process.env.ASTRAVA_CHROMIUM } : {}),
      // CI is correctness testing on an ephemeral software GPU, not a performance benchmark.
      args:['--enable-gpu','--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--enable-features=Vulkan','--use-vulkan=swiftshader','--use-angle=swiftshader','--use-webgpu-adapter=swiftshader','--disable-vulkan-surface','--no-sandbox'],
    });
  } catch (error) { server?.close(); throw error; }
  const page = await browser.newPage({ viewport:{ width,height }, deviceScaleFactor:1 });
  page.setDefaultTimeout(60000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (new URL(r.url()).pathname.includes('/engine/')) requests.push(r.url()); });
  page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.addInitScript(() => {
    window.__testGPUErrors = [];
    if (typeof GPUAdapter !== 'undefined') {
      const original = GPUAdapter.prototype.requestDevice;
      GPUAdapter.prototype.requestDevice = async function(...args) {
        const device = await original.apply(this, args);
        window.__testGPUDevice = device;
        device.addEventListener('uncapturederror', e => window.__testGPUErrors.push(e.error.message));
        device.lost.then(i => { if (i.reason !== 'destroyed') window.__testGPUErrors.push(i.message); });
        return device;
      };
    }
    // Start normally. Pause only after production startup has submitted real frames.
    const raf = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
    let paused = false, serial = 1e9;
    const waiting = new Map();
    window.requestAnimationFrame = fn => { if (!paused) return raf(fn); const id = ++serial; waiting.set(id,fn); return id; };
    window.cancelAnimationFrame = id => { waiting.delete(id); cancel(id); };
    window.__testFrames = {
      async pause() {
        paused = true;
        await new Promise(raf);
        if (window.__testGPUDevice) await window.__testGPUDevice.queue.onSubmittedWorkDone();
      },
      async step() {
        if (!paused) throw new Error('Pause before explicit frame stepping');
        if (window.__testGPUDevice) await window.__testGPUDevice.queue.onSubmittedWorkDone();
        const callbacks = [...waiting.values()]; waiting.clear();
        for (const fn of callbacks) fn(performance.now());
        if (window.__testGPUDevice) await window.__testGPUDevice.queue.onSubmittedWorkDone();
        await new Promise(raf);
      },
      resume() { paused = false; const callbacks = [...waiting.values()]; waiting.clear(); for (const fn of callbacks) raf(fn); },
    };
  });
  if (coverage) await page.route('**/planet.wgsl', async route => {
    const response = await route.fetch(), source = await response.text();
    assert.ok(source.includes('@fragment fn fsMain'), 'Production fragment entry missing');
    // Only fragment color is replaced; execute the production vertex/morph path.
    await route.fulfill({ response, body:source.replace(/@fragment fn fsMain[\s\S]*$/, '@fragment fn fsMain(i:VSOut)->@location(0) vec4<f32>{return vec4<f32>(.85,.85,.85,1.0);}') });
  });
  const state = () => page.evaluate(() => ({ ...window.__astravaDiagnostics, gpuErrors:window.__testGPUErrors }));
  async function ready() {
    await page.waitForFunction(() => window.__astravaDiagnostics?.state === 'error' || (window.__astravaDiagnostics?.state === 'running' && window.__astravaDiagnostics.frames >= 2));
    const s = await state(); assert.equal(s.state, 'running', s.error || 'Renderer failed');
    assert.equal(s.build, expected, 'Unexpected/mixed build');
    await page.evaluate(() => window.__testFrames.pause());
  }
  async function open(query = '') { await page.goto(`${base}demo.html${query}`, { waitUntil:'domcontentloaded' }); await ready(); }
  async function frame(label, kind = 'orbit', save = false) {
    const before = (await state()).frames;
    await page.evaluate(() => window.__testFrames.step());
    const s = await state();
    assert.equal(s.state,'running',s.error || 'Renderer stopped');
    assert.ok(s.frames > before, 'Requested frame was not rendered');
    assert.equal(s.build,expected); assert.deepEqual(s.gpuErrors,[]); assert.deepEqual(errors,[]);
    assert.ok(s.tiles > 0 && s.tiles <= s.drawCapacity); assert.ok(s.logicalTiles <= s.cutBudget); assert.ok(s.inFlight <= 2);
    for (const request of requests) assert.ok(new URL(request).pathname.includes(`/runtime/${expected}/engine/`), `Mixed-version asset ${request}`);
    const overlay = await page.addStyleTag({ content:'.engine-hud,.site-header,.engine-fallback{visibility:hidden!important}' });
    let bytes;
    try { const clip = await page.locator('#astrava-canvas').boundingBox(); assert.ok(clip?.width > 0); bytes = await page.screenshot({ clip,timeout:60000 }); }
    finally { await overlay.evaluate(el => el.remove()); }
    const png = PNG.sync.read(bytes), colors = new Set(); let covered = 0, different = 0;
    const bg = [...png.data.subarray(0,3)];
    for (let i=0;i<png.data.length;i+=4) {
      const r=png.data[i],g=png.data[i+1],b=png.data[i+2];
      if (coverage ? r>128&&g>128&&b>128 : Math.max(r,Math.abs(g-1),Math.abs(b-2))>2) covered++;
      if (Math.max(Math.abs(r-bg[0]),Math.abs(g-bg[1]),Math.abs(b-bg[2]))>8) different++;
      if (!coverage) colors.add((r<<16)|(g<<8)|b);
    }
    const count = png.width*png.height;
    const record={ label, coverage:covered/count, fraction:different/count, colors:colors.size, tiles:s.tiles, logical:s.logicalTiles, morph:s.morph, frames:s.frames, build:s.build };
    results.push(record); console.log('RENDER_CHECK',JSON.stringify(record));
    try {
      if (coverage) assert.ok(record.coverage>.999, `${label}: missing terrain, coverage=${record.coverage}`);
      else if (kind==='near') { assert.ok(record.coverage>.99,`${label}: missing near-orbit terrain`); assert.ok(colors.size>16,'Unshaded/blank close view'); }
      else { assert.ok(record.fraction>.01 && record.fraction<.9,'Planet missing against space'); assert.ok(colors.size>64,'Blank or unshaded orbit view'); }
    } catch(error) { await writeFile(`${output}/${label}-failure.png`,bytes); throw error; }
    if (save || process.env.ASTRAVA_SCREENSHOTS==='all') await writeFile(`${output}/${label}.png`,bytes);
    return record;
  }
  async function pose(direction, altitude=333000, alpha=1) {
    const active = await page.evaluate(p => window.__astravaDebug.transitionTo(p),{ direction,altitude });
    if (active) await page.evaluate(a => window.__astravaDebug.setMorph(a),alpha);
    return active;
  }
  async function close(error) {
    if (error) await page.screenshot({ path:`${output}/failure-page.png`,timeout:15000 }).catch(()=>{});
    await writeFile(`${output}/results.json`,JSON.stringify({ expected,results,errors,error:error?.message,requests },null,2));
    await browser.close(); if (server) await new Promise(r => server.close(r));
  }
  return { page,browser,base,expected,results,errors,open,ready,frame,pose,close,state };
}

import assert from 'node:assert/strict';
import { harness } from './testing/browser-harness.mjs';
const profile = process.argv.find(a=>a.startsWith('--profile='))?.split('=')[1] || 'quick';
if (!['quick','full','delivery'].includes(profile)) throw new Error(`Unknown profile ${profile}`);
const h = await harness({ name:process.env.ASTRAVA_TEST_NAME || `smoke-${profile}` });
let failure;
try {
  await h.open('?diagnostics');
  await h.frame('orbit','orbit',true);
  if (profile !== 'delivery') {
    await h.pose([-.65,.14,.75]); await h.frame('near','near');
    const active=await h.pose([-1,.14,1],333000,.5);
    assert.ok(active,'Smoke must exercise a real LOD transition');
    await h.frame('seam-mid-morph','near');
    await h.page.evaluate(()=>window.__astravaDebug.setMorph(1));
    await h.frame('seam-complete','near');
  }
  if (profile === 'full') {
    const session=await h.page.context().newCDPSession(h.page);
    await session.send('Network.clearBrowserCache');
    await h.page.reload({waitUntil:'domcontentloaded'}); await h.ready(); await h.frame('hard-reload','orbit');
    await h.page.setViewportSize({width:1366,height:768}); await h.frame('resized','orbit');
    await h.page.locator('#reset-view').click(); await h.frame('reset','orbit');
    await h.page.route('**/planet.wgsl',r=>r.fulfill({status:200,contentType:'text/plain',body:'intentionally invalid WGSL'}));
    await h.page.reload({waitUntil:'domcontentloaded'});
    await h.page.locator('#fallback').waitFor({state:'visible'});
    assert.ok((await h.page.locator('#error-detail').textContent()).length>15);
    assert.ok(!(await h.page.locator('#runtime-status').textContent()).includes('online'));
    const noGPU=await h.browser.newPage();
    await noGPU.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined}));
    await noGPU.goto(h.base+'demo.html',{waitUntil:'domcontentloaded'});
    await noGPU.locator('#fallback').waitFor({state:'visible'});
    assert.match(await noGPU.locator('#error-detail').textContent(),/WebGPU.*unavailable/);
    await noGPU.close();
  }
  console.log('WEBGPU_SMOKE_PASS',profile);
} catch(error) {failure=error;} finally {await h.close(failure);}
if(failure) throw failure;

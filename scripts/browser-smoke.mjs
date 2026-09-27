import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('dist');
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!path.startsWith(root+'/')){res.writeHead(403).end();return;}const body=await readFile(path),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wgsl':'text/plain','.svg':'image/svg+xml','.json':'application/json'};res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404).end('Not found');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=process.env.ASTRAVA_BASE_URL||`http://127.0.0.1:${server.address().port}/`,name=process.env.ASTRAVA_TEST_NAME||'local',expected=process.env.ASTRAVA_EXPECT_COMMIT||process.env.GITHUB_SHA;
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch({headless:false,args:['--enable-gpu','--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--enable-features=Vulkan','--use-vulkan=swiftshader','--use-angle=swiftshader','--use-webgpu-adapter=swiftshader','--disable-vulkan-surface','--no-sandbox']});
const page=await browser.newPage({viewport:{width:960,height:720},deviceScaleFactor:1});page.setDefaultTimeout(90000);
const events=[],runtimeRequests=[],results=[];
page.on('pageerror',e=>{events.push({type:'pageerror',message:e.message});console.log('PAGE_ERROR:',e.message);});
page.on('console',m=>{if(events.length<100){events.push({type:m.type(),message:m.text()});console.log('BROWSER:',m.type(),m.text());}});
page.on('request',req=>{if(new URL(req.url()).pathname.includes('/engine/'))runtimeRequests.push(req.url());});
await page.addInitScript(()=>{
 window.__gpuErrors=[];window.__submitted=0;if(typeof GPUAdapter==='undefined')return;
 const request=GPUAdapter.prototype.requestDevice;GPUAdapter.prototype.requestDevice=async function(...args){const device=await request.apply(this,args);window.__testGPUDevice=device;device.addEventListener('uncapturederror',e=>window.__gpuErrors.push(e.error.message));device.lost.then(info=>{if(info.reason!=='destroyed')window.__gpuErrors.push('Device lost: '+info.message);});return device;};
 const submit=GPUQueue.prototype.submit;GPUQueue.prototype.submit=function(...args){window.__submitted++;return submit.apply(this,args);};
});
async function assertRendered(label,near=false){
 await page.waitForFunction(()=>{const d=window.__astravaDiagnostics;return d&&(d.state==='error'||(d.state==='running'&&d.frames>=2&&!d.transitioning));},null,{timeout:90000});
 // Synchronize with submitted GPU work instead of mistaking queued CPU frames for pixels.
 await page.evaluate(async()=>{if(window.__astravaDiagnostics.state==='running')await window.__testGPUDevice.queue.onSubmittedWorkDone();});
 const state=await page.evaluate(()=>({secure:isSecureContext,gpu:!!navigator.gpu,errors:window.__gpuErrors,submitted:window.__submitted,status:document.querySelector('#runtime-status')?.textContent,tiles:document.querySelector('#tiles')?.textContent,diagnostic:window.__astravaDiagnostics}));
 console.log('RENDER_STATE:',label,JSON.stringify(state));await page.screenshot({path:`test-results/${name}-${label}-page.png`,timeout:90000});
 assert.equal(state.diagnostic.state,'running',state.diagnostic.error||'Engine must report a verified first frame');assert.equal(state.errors.length,0,'WebGPU validation/device loss');assert.equal(events.filter(e=>e.type==='pageerror').length,0,'JavaScript exceptions');assert.ok(state.submitted>=2);assert.ok(state.diagnostic.inFlight<=2,'GPU queue must remain bounded');if(expected)assert.equal(state.diagnostic.build,expected);
 for(const url of runtimeRequests)assert.ok(new URL(url).pathname.includes(`/runtime/${state.diagnostic.build}/engine/`),'Mixed-version module/shader '+url);
 const overlay=await page.addStyleTag({content:'.engine-hud,.site-header,.engine-fallback{visibility:hidden!important}'});
 // This canvas has fixed viewport bounds. Clip a page screenshot directly:
 // locator screenshots wait for consecutive animation-frame layout samples,
 // which is unreliable on heavily loaded software GPUs even when bounds do not change.
 const clip=await page.locator('#astrava-canvas').boundingBox();assert.ok(clip&&clip.width>0&&clip.height>0);
 const bytes=await page.screenshot({clip,timeout:90000});await overlay.evaluate(el=>el.remove());await writeFile(`test-results/${name}-${label}-canvas.png`,bytes);
 const png=PNG.sync.read(bytes),bg=[...png.data.slice(0,3)],colors=new Set();let foreground=0,nonClear=0;
 for(let i=0;i<png.data.length;i+=4){if(Math.max(Math.abs(png.data[i]-bg[0]),Math.abs(png.data[i+1]-bg[1]),Math.abs(png.data[i+2]-bg[2]))>8)foreground++;if(Math.max(Math.abs(png.data[i]),Math.abs(png.data[i+1]-1),Math.abs(png.data[i+2]-2))>2)nonClear++;colors.add((png.data[i]<<16)|(png.data[i+1]<<8)|png.data[i+2]);}
 const pixels={width:png.width,height:png.height,bg,foreground,fraction:foreground/(png.width*png.height),coverage:nonClear/(png.width*png.height),colors:colors.size};console.log('RENDER_PIXELS:',label,JSON.stringify(pixels));
 if(near){assert.ok(pixels.coverage>.99,'Near-orbit planet must fill the nadir viewport');assert.ok(colors.size>16,'Surface must be shaded');}else{assert.ok(colors.size>64,'Shaded planet required');assert.ok(pixels.fraction>.01&&pixels.fraction<.9,'Planet against space required');}
 results.push({label,state,pixels});await writeFile(`test-results/${name}-state.json`,JSON.stringify({results,events,runtimeRequests},null,2));
}
let failure;
try{
 await page.goto(base+'demo.html',{waitUntil:'networkidle',timeout:90000});await assertRendered('initial');
 const session=await page.context().newCDPSession(page);await session.send('Network.clearBrowserCache');await page.reload({waitUntil:'networkidle'});await assertRendered('hard-reload');
 await page.setViewportSize({width:1366,height:768});await assertRendered('resized');
 await page.goto(base+'demo.html?view=near',{waitUntil:'networkidle'});await assertRendered('near-orbit',true);
 await page.locator('#reset-view').click();
 await page.waitForFunction(()=>{const d=window.__astravaDiagnostics;return d.state==='error'||(d.altitude>9e6&&!d.transitioning);},null,{timeout:90000});await assertRendered('reset-orbit');
 await page.route('**/planet.wgsl',route=>route.fulfill({status:200,contentType:'text/plain',body:'this is deliberately invalid WGSL'}));await page.reload({waitUntil:'networkidle'});await page.locator('#fallback').waitFor({state:'visible'});
 const error=await page.locator('#error-detail').textContent();assert.ok(error&&error.length>15);assert.ok(!(await page.locator('#runtime-status').textContent()).includes('online'));await page.screenshot({path:`test-results/${name}-shader-error.png`});console.log('EXPECTED_SHADER_ERROR_VISIBLE:',error.slice(0,200));
 const noGPU=await browser.newPage();await noGPU.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined}));await noGPU.goto(base+'demo.html',{waitUntil:'networkidle'});await noGPU.locator('#fallback').waitFor({state:'visible'});assert.match(await noGPU.locator('#error-detail').textContent(),/WebGPU.*unavailable/);await noGPU.close();
 console.log('WEBGPU_SMOKE_PASS:',name,'initial, hard reload, resize, near orbit, reset, shader failure, unsupported browser');
}catch(e){failure=e;await writeFile(`test-results/${name}-failure.json`,JSON.stringify({message:e.message,events,results},null,2));}
finally{await browser.close();await new Promise(r=>server.close(r));}
if(failure)throw failure;

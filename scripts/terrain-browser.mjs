/** Geometry-only regression using the production vertex shader. The fragment
 * entry point is replaced by a coverage color; production shading has its own test.
 */
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('dist'),server=createServer(async(req,res)=>{try{const p=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(root+'/')){res.writeHead(403).end();return;}const body=await readFile(p),types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.wgsl':'text/plain'};res.writeHead(200,{'Content-Type':types[extname(p)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=process.env.ASTRAVA_BASE_URL||`http://127.0.0.1:${server.address().port}/`,expected=process.env.ASTRAVA_EXPECT_COMMIT||process.env.GITHUB_SHA;
await mkdir('test-results/terrain',{recursive:true});
const browser=await chromium.launch({headless:false,args:['--enable-gpu','--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--enable-features=Vulkan','--use-vulkan=swiftshader','--use-angle=swiftshader','--use-webgpu-adapter=swiftshader','--disable-vulkan-surface','--no-sandbox']});
const page=await browser.newPage({viewport:{width:640,height:560},deviceScaleFactor:1});const failures=[],results=[];
await page.route('**/planet.wgsl',async route=>{const response=await route.fetch(),source=await response.text();assert.ok(source.includes('@fragment fn fsMain'));const shader=source.replace(/@fragment fn fsMain[\s\S]*$/,'@fragment fn fsMain(i:VSOut)->@location(0) vec4<f32>{return vec4<f32>(.85,.85,.85,1.0);}');await route.fulfill({response,body:shader});});
page.on('pageerror',e=>failures.push(e.message));
await page.addInitScript(()=>{window.__gpuErrors=[];if(typeof GPUAdapter==='undefined')return;const original=GPUAdapter.prototype.requestDevice;GPUAdapter.prototype.requestDevice=async function(...args){const d=await original.apply(this,args);d.addEventListener('uncapturederror',e=>window.__gpuErrors.push(e.error.message));d.lost.then(i=>{if(i.reason!=='destroyed')window.__gpuErrors.push(i.message);});return d;};});
async function frame(label){
 const before=await page.evaluate(()=>window.__astravaDiagnostics.frames);
 await page.waitForFunction(n=>window.__astravaDiagnostics.state==='error'||window.__astravaDiagnostics.frames>=n+2,before,{timeout:90000});
 const s=await page.evaluate(()=>({...window.__astravaDiagnostics,errors:window.__gpuErrors}));
 assert.equal(s.state,'running',s.error||'Renderer not running');assert.equal(s.errors.length,0,s.errors.join('\n'));assert.equal(failures.length,0,failures.join('\n'));if(expected)assert.equal(s.build,expected);assert.ok(s.tiles<=s.drawCapacity);assert.ok(s.logicalTiles<=s.cutBudget);
 const bytes=await page.locator('#astrava-canvas').screenshot({timeout:90000}),png=PNG.sync.read(bytes);let visible=0;
 for(let i=0;i<png.data.length;i+=4)if(png.data[i]>128&&png.data[i+1]>128&&png.data[i+2]>128)visible++;
 const coverage=visible/(png.width*png.height);assert.ok(coverage>.999,`${label}: coverage ${coverage}`);
 const r={label,coverage,tiles:s.tiles,logical:s.logicalTiles,morph:s.morph};results.push(r);console.log('TERRAIN_FRAME',JSON.stringify(r));await writeFile(`test-results/terrain/${label}.png`,bytes);
}
async function pose(label,direction,altitude=333000,alphas=[1]){const active=await page.evaluate(p=>window.__astravaDebug.transitionTo(p),{direction,altitude});for(const alpha of alphas){if(active)await page.evaluate(a=>window.__astravaDebug.setMorph(a),alpha);await frame(`${label}-${alpha}`);}}
let failure;
try{
 await page.goto(base+'demo.html?diagnostics&lodBudget=96',{waitUntil:'networkidle',timeout:90000});await page.waitForFunction(()=>window.__astravaDiagnostics?.state==='running',{timeout:90000});
 await page.addStyleTag({content:'.engine-hud,.site-header,.engine-fallback{visibility:hidden!important}'});
 await pose('morph',[-1,.14,1],333000,[0,.1,.2,.3,.4,.5,.6,.7,.8,.9,1]);
 let edge=0;
 for(const free of [0,1,2])for(const a of [-1,1])for(const b of [-1,1]){const fixed=[0,1,2].filter(i=>i!==free);for(const side of [-1,1]){const d=[0,0,0];d[free]=.13;d[fixed[0]]=a*(1+side*.025);d[fixed[1]]=b;await pose(`edge-${edge}-${side}`,d);}edge++;}
 for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])await pose(`corner-${x}-${y}-${z}`,[x,y,z]);
 for(const altitude of [333000,100000,10000,100000,333000])await pose(`flight-${results.length}`,[-1,.14,1],altitude,[0,.5,1]);
 for(const budget of [6,24,96]){await page.evaluate(n=>window.__astravaDebug.setBudget(n),budget);await pose(`budget-${budget}`,[-1,1,1],333000,[0,.5,1]);}
 console.log('TERRAIN_BROWSER_PASS',results.length,'coverage frames: seams, corners, morphs, descent/ascent and tiny budgets');
}catch(e){failure=e;console.error('TERRAIN_BROWSER_FAILURE',e.message);await page.screenshot({path:'test-results/terrain/failure.png',timeout:90000}).catch(()=>{});}
finally{await writeFile('test-results/terrain/results.json',JSON.stringify({results,failures,error:failure?.message},null,2));await browser.close();await new Promise(r=>server.close(r));}
if(failure)throw failure;

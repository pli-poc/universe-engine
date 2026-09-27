import { mkdir, writeFile } from 'node:fs/promises';
import { digest } from './artifact.mjs';
const base=process.env.ASTRAVA_BASE_URL,commit=process.env.ASTRAVA_EXPECT_COMMIT,expected=process.env.ASTRAVA_MANIFEST_SHA;
if(!base||!commit||!expected)throw new Error('Published verification requires URL, commit and manifest hash');
const get=async path=>{const url=new URL(path,base);url.searchParams.set('verify',`${process.env.GITHUB_RUN_ID}-${Date.now()}`);const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error(`${path}: HTTP ${r.status}`);return Buffer.from(await r.arrayBuffer());};
const deadline=Date.now()+180000;let manifest,lastError;
while(Date.now()<deadline) {
  try {
    const info=JSON.parse(await get('build-info.json'));if(info.commit!==commit)throw new Error('Pages still serves a different build');
    const bytes=await get('artifact-manifest.json');if(digest(bytes)!==expected)throw new Error('Published manifest differs from tested artifact');
    manifest=JSON.parse(bytes);if(manifest.commit!==commit)throw new Error('Manifest build mismatch');
    for(const path of ['demo.html','src/styles.css',`runtime/${commit}/engine/boot.js`,`runtime/${commit}/engine/main.js`,`runtime/${commit}/engine/renderer/shaders/planet.wgsl`]) {
      if(!manifest.files[path]||digest(await get(path))!==manifest.files[path])throw new Error(`Published asset integrity mismatch: ${path}`);
    }
    break;
  }catch(error){lastError=error;manifest=null;await new Promise(r=>setTimeout(r,5000));}
}
if(!manifest)throw lastError;
await mkdir('test-results',{recursive:true});await writeFile('test-results/published-integrity.json',JSON.stringify({commit,manifestSha:expected,checkedAt:new Date().toISOString()},null,2));
console.log('Published identity and sampled content integrity verified',commit);

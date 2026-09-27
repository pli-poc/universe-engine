import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classify, assertGate } from '../scripts/ci/plan.mjs';
import { digest, inventory, verifyTree } from '../scripts/ci/artifact.mjs';
import { GROUPS, terrainCases } from '../scripts/testing/terrain-cases.mjs';

test('docs-only and presentation tiers are allow-listed; runtime/tooling/unknown changes stay full',()=>{
  for(const paths of [['README.md'],['docs/pipeline.html','docs/planets.html'],[]])assert.equal(classify(paths).tier,'docs');
  for(const p of ['src/styles.css','demo.html','engine/demo.css','assets/astrava-logo.svg'])assert.equal(classify([p]).tier,'smoke');
  for(const p of ['engine/main.js','engine/renderer/shaders/planet.wgsl','.github/workflows/pages.yml','scripts/build.mjs','package-lock.json','tests/terrain.test.mjs','unexpected.xyz','docs/injected.js'])assert.equal(classify([p]).tier,'full');
  assert.equal(classify(['README.md'],{known:false}).tier,'full');
  assert.equal(classify(['README.md'],{forceFull:true}).tier,'full');
  assert.equal(classify(['README.md','engine/planet/quadtree.js']).tier,'full');
});
test('gate handles only intentionally skipped tests; failures and cancellations are never passes',()=>{
  assert.doesNotThrow(()=>assertGate({tier:'docs'},{prepare:'success',smoke:'skipped',terrain:'skipped'}));
  assert.doesNotThrow(()=>assertGate({tier:'smoke'},{prepare:'success',smoke:'success',terrain:'skipped'}));
  assert.doesNotThrow(()=>assertGate({tier:'full'},{prepare:'success',smoke:'success',terrain:'success'}));
  for(const job of ['prepare','smoke','terrain'])for(const result of ['skipped','failure','cancelled','pending',''])assert.throws(()=>assertGate({tier:'full'},{prepare:'success',smoke:'success',terrain:'success',[job]:result}));
  assert.throws(()=>assertGate({tier:'unknown'},{prepare:'success',smoke:'success',terrain:'success'}));
});
test('three independent terrain groups retain all 67 coverage cases with unique labels',()=>{
  const counts=GROUPS.map(group=>terrainCases(group).reduce((sum,c)=>sum+(c.alphas||[1]).length,0));
  assert.deepEqual(counts,[24,19,24]);
  const labels=GROUPS.flatMap(group=>terrainCases(group).flatMap(c=>(c.alphas||[1]).map(a=>`${c.label}-${a}`)));
  assert.equal(labels.length,67);assert.equal(new Set(labels).size,67);
  assert.throws(()=>terrainCases('invalid'));
});
test('release manifest enforces commit, every byte and exact file set',async()=>{
  const root=await mkdtemp(join(tmpdir(),'astrava-artifact-'));
  try {
    await writeFile(join(root,'demo.html'),'initial');
    const manifest=JSON.stringify({commit:'abc',files:await inventory(root)});
    await writeFile(join(root,'artifact-manifest.json'),manifest);
    await verifyTree(root,digest(manifest),'abc');
    await assert.rejects(verifyTree(root,'0'.repeat(64),'abc'));
    await assert.rejects(verifyTree(root,digest(manifest),'wrong'));
    await writeFile(join(root,'demo.html'),'modified');await assert.rejects(verifyTree(root,digest(manifest),'abc'));
    await writeFile(join(root,'demo.html'),'initial');await writeFile(join(root,'extra.js'),'unexpected');await assert.rejects(verifyTree(root,digest(manifest),'abc'));
  } finally {await rm(root,{recursive:true,force:true});}
});
test('workflow contracts: locked matching browser, no full regression after publishing, separate permissions',async()=>{
  const pkg=JSON.parse(await readFile('package.json')),lock=JSON.parse(await readFile('package-lock.json'));
  assert.equal(pkg.devDependencies.playwright,lock.packages['node_modules/playwright'].version);
  for(const path of ['.github/workflows/pages.yml','.github/workflows/validation.yml']){
    const source=await readFile(path,'utf8');assert.ok(source.includes(`playwright:v${pkg.devDependencies.playwright}-noble`));assert.ok(!source.includes('playwright install'));assert.ok(!source.includes('npm install'));
  }
  const pages=await readFile('.github/workflows/pages.yml','utf8');
  const delivery=pages.split('  verify-published:')[1];assert.ok(delivery.includes('--profile=delivery'));assert.ok(!delivery.includes('terrain-browser'));assert.ok(!delivery.includes('npm run build'));
  const validation=await readFile('.github/workflows/validation.yml','utf8');assert.equal((validation.match(/npm run build/g)||[]).length,1);assert.ok(!validation.includes('pages: write'));assert.ok(validation.includes('if: always()'));
});

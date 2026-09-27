import { harness } from './testing/browser-harness.mjs';
import { GROUPS, terrainCases } from './testing/terrain-cases.mjs';
const group=process.argv.find(a=>a.startsWith('--group='))?.split('=')[1]||'all';
if(group!=='all'&&!GROUPS.includes(group))throw new Error(`Unknown terrain group ${group}`);
let checked=0;
for(const part of group==='all'?GROUPS:[group]) {
  const h=await harness({coverage:true,width:640,height:560,name:`terrain-${part}`});
  let failure;
  try {
    await h.open('?diagnostics&lodBudget=96');
    for(const test of terrainCases(part)) {
      if(test.budget)await h.page.evaluate(n=>window.__astravaDebug.setBudget(n),test.budget);
      const active=await h.pose(test.direction,test.altitude??333000,0);
      for(const alpha of test.alphas||[1]) {
        if(active)await h.page.evaluate(a=>window.__astravaDebug.setMorph(a),alpha);
        await h.frame(`${test.label}-${alpha}`,'near',h.results.length===0);checked++;
      }
    }
    console.log('TERRAIN_BROWSER_PASS',part,h.results.length);
  } catch(error) {failure=error;} finally {await h.close(failure);}
  if(failure)throw failure;
}
console.log('TERRAIN_TOTAL',checked);

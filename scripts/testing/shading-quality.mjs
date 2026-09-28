import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {PNG} from 'pngjs';

/** Compare identical frozen poses, not different camera frames or LOD cuts. */
export function shadingDifference(a,b,{normals=false}={}) {
  assert.equal(a.width,b.width);assert.equal(a.height,b.height);
  let count=0,total=0,maximum=0;
  for(let y=2;y<a.height-2;y++)for(let x=2;x<a.width-2;x++) {
    const k=(y*a.width+x)*4;
    const p=[a.data[k],a.data[k+1],a.data[k+2]],q=[b.data[k],b.data[k+1],b.data[k+2]];
    if(Math.max(...p)<=8&&Math.max(...q)<=8)continue; // untouched space
    let error;
    if(normals) {
      const n=p.map(v=>v/127.5-1),m=q.map(v=>v/127.5-1);
      const ln=Math.hypot(...n),lm=Math.hypot(...m);
      assert.ok(ln>.97&&ln<1.03&&lm>.97&&lm<1.03,'Non-unit/invalid rendered normal');
      error=Math.acos(Math.max(-1,Math.min(1,n.reduce((s,v,i)=>s+v*m[i],0)/(ln*lm))))*180/Math.PI;
    } else error=p.reduce((s,v,i)=>s+Math.abs(v-q[i]),0)/3;
    total+=error;maximum=Math.max(maximum,error);count++;
  }
  assert.ok(count>100,'Not enough shaded samples for a quality comparison');
  return {samples:count,mean:total/count,max:maximum};
}

export async function surfaceQuality(h,{output,negativeControl=false}) {
  const records={};
  const capture=async(label,kind,mode,strength)=>{
    await h.page.locator(`[data-debug="${mode}"]`).click();
    await h.page.evaluate(v=>window.__astravaDebug.setDetailStrength(v),strength);
    const before=(await h.state()).frames;
    await h.page.evaluate(()=>window.__testFrames.step());
    const state=await h.state();
    assert.equal(state.state,'running',state.error||'Shading frame failed');
    assert.equal(state.build,h.expected);assert.ok(state.frames>before&&state.tiles>0);
    assert.deepEqual(state.gpuErrors,[]);assert.deepEqual(h.errors,[]);
    const overlay=await h.page.addStyleTag({content:'.engine-hud,.site-header{visibility:hidden!important}'});
    let bytes;
    try {bytes=await h.page.screenshot({clip:await h.page.locator('#astrava-canvas').boundingBox(),timeout:60000});}
    finally {await overlay.evaluate(el=>el.remove());}
    await writeFile(`${output}/${label}.png`,bytes);
    return PNG.sync.read(bytes);
  };
  try {
    await h.pose([-.65,.14,.75],6371000*1.55);
    const orbitOff=await capture('quality-orbit-detail-off','orbit',0,0);
    const orbitOn=await capture('quality-orbit-filtered','orbit',0,1);
    records.orbit=shadingDifference(orbitOff,orbitOn);
    assert.ok(records.orbit.mean<.5&&records.orbit.max<4,'Subpixel detail must disappear from orbit, not sparkle');

    await h.pose([-1,.14,1],13000);
    const closeOff=await capture('quality-close-geometric-normals','near',1,0);
    const closeOn=await capture('quality-close-detail-normals','near',1,1);
    records.closeNormals=shadingDifference(closeOff,closeOn,{normals:true});
    assert.ok(records.closeNormals.max<12.5,'Normal detail exceeds the bounded surface slope');
    assert.ok(records.closeNormals.mean>.01,'Resolved close-up detail was removed entirely');
    await capture('quality-close-beauty','near',0,1);

    // This actual legacy shader is a negative control, not a production option.
    // It proves the new image test rejects the originally shipped noisy path.
    if(negativeControl) {
      const legacy='fn detailNormal(n0:vec3<f32>,radial:vec3<f32>,rough:f32,i:VSOut)->vec3<f32>{let d=noise(radial*1800.0+vec3<f32>(u.timeRotationHeight.w*.031));let gx=dpdx(d);let gy=dpdy(d);let tx=normalize(dpdx(i.worldPos));let ty=normalize(dpdy(i.worldPos));return normalize(n0-(tx*gx+ty*gy)*(5.0+rough*9.0)*u.renderParams.z);}\n';
      const routeLegacy=async route=>{
        const response=await route.fetch(),source=await response.text();
        const start=source.indexOf('fn detailNormal('),end=source.indexOf('fn pow5(',start);
        assert.ok(start>=0&&end>start);
        await route.fulfill({response,body:source.slice(0,start)+legacy+source.slice(end)});
      };
      await h.page.route('**/planet.wgsl',routeLegacy);
      try {
        await h.page.reload({waitUntil:'domcontentloaded'});await h.ready();
        await h.pose([-.65,.14,.75],6371000*1.55);
        const off=await capture('quality-legacy-detail-off','orbit',0,0);
        const on=await capture('quality-legacy-noise-negative-control','orbit',0,1);
        records.legacy=shadingDifference(off,on);
        assert.ok(records.legacy.mean>2,'Negative control did not reproduce the noisy detail regression');
      } finally {await h.page.unroute('**/planet.wgsl',routeLegacy);}
      // The following full-profile hard-reload test restores the production shader.
    }
    console.log('SURFACE_QUALITY_PASS',JSON.stringify(records));
  } finally {await writeFile(`${output}/surface-quality.json`,JSON.stringify(records,null,2));}
}

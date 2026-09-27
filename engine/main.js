
import {v3,sub,length,normalize} from "./math/vec3.js";
import {perspective,viewRotation,mul} from "./math/mat4.js";
import {createDemoSystem} from "./universe/system.js";
import {FreeCamera} from "./camera/free-camera.js";
import {WebGPURenderer} from "./renderer/webgpu-renderer.js";

const canvas=document.querySelector("#astrava-canvas"),fallback=document.querySelector("#fallback");
const statusEl=document.querySelector("#runtime-status"),altitudeEl=document.querySelector("#altitude"),distanceEl=document.querySelector("#distance"),frameEl=document.querySelector("#frame-time");
const fmt=m=>m>1e9?(m/1e9).toFixed(2)+" Gm":m>1e6?(m/1e6).toFixed(2)+" Mm":m>1e3?(m/1e3).toFixed(1)+" km":m.toFixed(0)+" m";

async function boot(){
  const renderer=new WebGPURenderer();
  try{await renderer.init(canvas)}catch(err){console.error(err);fallback.hidden=false;statusEl.textContent="WebGPU unavailable";return}
  const system=createDemoSystem(),planet=system.planet;
  const t0=performance.now()/1000,planetPos=planet.universePosition(t0);
  const camera=new FreeCamera(v3(planetPos[0],planetPos[1]+planet.radius*.18,planetPos[2]+planet.radius*2.55));
  camera.pitch=-.07;camera.attach(canvas);statusEl.textContent="WebGPU online · Astra-1 procedural prototype";
  let last=performance.now(),fpsSmooth=16.7;
  function frame(now){
    const dt=Math.min(.05,(now-last)/1000);last=now;const simTime=now/1000;
    const p=planet.universePosition(simTime),toPlanet=sub(camera.position,p),dist=length(toPlanet),alt=dist-planet.radius;
    camera.update(dt,Math.max(0,alt));
    const p2=planet.universePosition(simTime),rel=sub(p2,camera.position);
    const proj=perspective(Math.PI/3,canvas.width/Math.max(1,canvas.height),100,Math.max(planet.radius*20,dist*4));
    const view=viewRotation(camera.yaw,camera.pitch),vp=mul(proj,view);
    const sunDir=normalize(sub(system.star.position,p2));
    const f=new Float32Array(32);f.set(vp,0);
    f.set([rel[0],rel[1],rel[2],planet.radius],16);
    f.set([simTime,planet.frame.angleAt(simTime),planet.maxTerrainHeight,planet.seed],20);
    f.set([sunDir[0],sunDir[1],sunDir[2],1],24);
    f.set([Math.max(0,alt),dist,0,0],28);
    renderer.render(f);
    fpsSmooth=fpsSmooth*.92+(dt*1000)*.08;altitudeEl.textContent=fmt(Math.max(0,alt));distanceEl.textContent=fmt(dist);frameEl.textContent=fpsSmooth.toFixed(1)+" ms";
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
boot();

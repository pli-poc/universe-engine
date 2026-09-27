
import {v3,sub,length,normalize} from "./math/vec3.js";
import {perspective,viewRotation,mul} from "./math/mat4.js";
import {createDemoSystem} from "./universe/system.js";
import {FreeCamera} from "./camera/free-camera.js";
import {PlanetQuadtree} from "./planet/quadtree.js";
import {WebGPURenderer} from "./renderer/webgpu-renderer.js";

const canvas=document.querySelector("#astrava-canvas"),fallback=document.querySelector("#fallback");
const statusEl=document.querySelector("#runtime-status"),altitudeEl=document.querySelector("#altitude"),distanceEl=document.querySelector("#distance"),frameEl=document.querySelector("#frame-time"),tilesEl=document.querySelector("#tiles"),lodEl=document.querySelector("#lod");
const fmt=m=>m>1e9?(m/1e9).toFixed(2)+" Gm":m>1e6?(m/1e6).toFixed(2)+" Mm":m>1e3?(m/1e3).toFixed(1)+" km":m.toFixed(0)+" m";

async function boot(){
  const renderer=new WebGPURenderer();
  try{await renderer.init(canvas)}catch(err){console.error(err);fallback.hidden=false;statusEl.textContent="WebGPU unavailable";return}
  const system=createDemoSystem(),planet=system.planet,quadtree=new PlanetQuadtree({maxLevel:12,splitPixels:190,maxTiles:4096});
  const t0=performance.now()/1000,planetPos=planet.universePosition(t0);
  const camera=new FreeCamera(v3(planetPos[0],planetPos[1]+planet.radius*.18,planetPos[2]+planet.radius*2.55));
  camera.pitch=-.07;camera.attach(canvas);statusEl.textContent="WebGPU online · quadtree planetary LOD";
  let last=performance.now(),fpsSmooth=16.7;
  function frame(now){
    const dt=Math.min(.05,(now-last)/1000);last=now;const simTime=now/1000;
    const p=planet.universePosition(simTime),toPlanet=sub(camera.position,p),dist=length(toPlanet),alt=dist-planet.radius;
    camera.update(dt,Math.max(0,alt));
    const p2=planet.universePosition(simTime),cameraToPlanet=sub(p2,camera.position),planetToCamera=sub(camera.position,p2),dist2=length(planetToCamera),alt2=dist2-planet.radius;
    const fov=Math.PI/3,proj=perspective(fov,canvas.width/Math.max(1,canvas.height),Math.max(1,Math.min(100,Math.max(1,alt2*.001))),Math.max(planet.radius*30,dist2*5));
    const view=viewRotation(camera.yaw,camera.pitch),vp=mul(proj,view),rotation=planet.frame.angleAt(simTime);
    const tiles=quadtree.select({planetRadius:planet.radius,cameraRelativeWorld:planetToCamera,planetRotation:rotation,viewportHeight:canvas.height,fovY:fov});
    const instances=quadtree.toInstanceArray(tiles);
    const sunDir=normalize(sub(system.star.position,p2));
    const u=new Float32Array(32);u.set(vp,0);
    u.set([cameraToPlanet[0],cameraToPlanet[1],cameraToPlanet[2],planet.radius],16);
    u.set([simTime,rotation,planet.maxTerrainHeight,planet.seed],20);
    u.set([sunDir[0],sunDir[1],sunDir[2],1],24);
    u.set([Math.max(0,alt2),dist2,tiles.length,quadtree.stats.maxLevel],28);
    const drawn=renderer.render(u,instances);
    fpsSmooth=fpsSmooth*.92+(dt*1000)*.08;altitudeEl.textContent=fmt(Math.max(0,alt2));distanceEl.textContent=fmt(dist2);frameEl.textContent=fpsSmooth.toFixed(1)+" ms";
    if(tilesEl)tilesEl.textContent=String(drawn);if(lodEl)lodEl.textContent=String(quadtree.stats.maxLevel);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
boot();

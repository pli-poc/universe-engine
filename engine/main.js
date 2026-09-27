import {v3,sub,length,normalize} from './math/vec3.js';
import {perspective,viewRotation,mul} from './math/mat4.js';
import {createDemoSystem} from './universe/system.js';
import {FreeCamera} from './camera/free-camera.js';
import {PlanetQuadtree} from './planet/quadtree.js';
import {TerrainTransitions} from './planet/transitions.js';
import {WebGPURenderer} from './renderer/webgpu-renderer.js';
import {BUILD_ID} from './build-info.js';
const element=id=>document.getElementById(id),canvas=element('astrava-canvas');
const diagnostics={build:BUILD_ID,state:'initializing',frames:0,error:null};window.__astravaDiagnostics=diagnostics;element('build-id').textContent=BUILD_ID.slice(0,12);
let stopped=false;
function fail(error){if(stopped)return;stopped=true;diagnostics.state='error';diagnostics.error=error?.message||String(error);element('runtime-status').textContent='Rendering stopped — see error';element('fallback-title').textContent='Astrava rendering error';element('error-detail').textContent=diagnostics.error;element('fallback').hidden=false;console.error('ASTRAVA_RENDER_ERROR',diagnostics.error);}
const renderer=new WebGPURenderer({onError:fail});
const fmt=m=>m>1e9?`${(m/1e9).toFixed(2)} Gm`:m>1e6?`${(m/1e6).toFixed(2)} Mm`:m>1e3?`${(m/1e3).toFixed(1)} km`:`${m.toFixed(0)} m`;
async function boot(){
  await renderer.init(canvas);if(stopped)return;
  const system=createDemoSystem(),planet=system.planet,params=new URLSearchParams(location.search);
  const maxLogical=Math.min(1536,Math.floor(renderer.instanceCapacity/2)),requested=Number(params.get('lodBudget')||maxLogical);
  const budget=Number.isFinite(requested)?Math.max(6,Math.min(maxLogical,Math.floor(requested))):maxLogical;
  const quadtree=new PlanetQuadtree({maxLevel:12,splitPixels:230,mergePixels:135,maxTiles:budget});
  const transitions=new TerrainTransitions({capacity:renderer.instanceCapacity,duration:.35}),camera=new FreeCamera(v3());
  let simTime=0,selectionAge=1,grid=false,hold=false;
  function setView({direction=[-.65,.14,.75],altitude=planet.radius*1.55}={}){
    if(direction.length!==3||!direction.every(Number.isFinite)||Math.hypot(...direction)===0||!Number.isFinite(altitude)||altitude<=0)throw new RangeError('Invalid inspection pose');
    const d=normalize(v3(...direction)),a=planet.frame.angleAt(simTime),c=Math.cos(a),s=Math.sin(a),distance=planet.radius+altitude;
    const relative=[c*d[0]+s*d[2],d[1],-s*d[0]+c*d[2]].map(v=>v*distance),origin=planet.universePosition(simTime);
    camera.position.set(relative.map((v,i)=>origin[i]+v));camera.yaw=Math.atan2(relative[0],relative[2]);camera.pitch=-Math.asin(relative[1]/distance);camera.keys.clear();selectionAge=1;
  }
  const presets={orbit:{},near:{altitude:333000},seam:{direction:[-1,.14,1],altitude:333000},corner:{direction:[-1,1,1],altitude:333000},low:{direction:[-1,.14,1],altitude:10000}};
  setView(presets[params.get('view')]||presets.orbit);camera.attach(canvas);
  element('reset-view').addEventListener('click',()=>setView());
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>setView(presets[button.dataset.view])));
  element('toggle-grid')?.addEventListener('click',()=>{grid=!grid;element('toggle-grid').setAttribute('aria-pressed',String(grid));});
  document.addEventListener('keydown',event=>{if(event.code==='KeyR')setView();if(event.code==='KeyL')grid=!grid;});addEventListener('blur',()=>camera.keys.clear());
  if(params.has('diagnostics'))window.__astravaDebug={
    setView,
    setBudget(value){if(!Number.isInteger(value)||value<6||value>maxLogical)throw new RangeError('Invalid tile budget');quadtree.maxTiles=value;selectionAge=1;},
    hold(value){hold=!!value;},
    transitionTo(pose){if(transitions.active)transitions.advance(transitions.duration);setView(pose);const center=planet.universePosition(simTime);transitions.offer(quadtree.select({planetRadius:planet.radius,cameraRelativeWorld:sub(camera.position,center),planetRotation:planet.frame.angleAt(simTime),viewportHeight:canvas.height,fovY:Math.PI/3}));hold=true;selectionAge=0;return transitions.active;},
    setMorph(alpha){if(!hold||!transitions.active||alpha<0||alpha>1)throw new Error('Hold an active transition before setting alpha');transitions.alpha=alpha;},
    getCut(){return (transitions.renderTiles||[]).map(({face,level,x,y,edgeMask})=>({face,level,x,y,edgeMask}));},
  };
  let last=performance.now(),averageMs=16.7;
  function draw(now){
    if(stopped)return;
    // Keep input/event processing responsive without building an unbounded GPU queue.
    if(!renderer.canRender){requestAnimationFrame(draw);return;}
    try{
      const elapsed=Math.max(0,now-last),dt=Math.min(.05,elapsed/1000);last=now;if(document.hidden){requestAnimationFrame(draw);return;}
      if(!hold){simTime+=dt;transitions.advance(dt);selectionAge+=dt;}
      const center=planet.universePosition(simTime);if(!hold)camera.update(dt,Math.max(0,length(sub(camera.position,center))-planet.radius));renderer.resize();
      const relative=sub(camera.position,center),distance=length(relative),altitude=distance-planet.radius,rotation=planet.frame.angleAt(simTime),fov=Math.PI/3;
      if(!transitions.current||(!hold&&!transitions.active&&selectionAge>=.12)){
        transitions.offer(quadtree.select({planetRadius:planet.radius,cameraRelativeWorld:relative,planetRotation:rotation,viewportHeight:canvas.height,fovY:fov}));selectionAge=0;
      }
      const projection=perspective(fov,canvas.width/canvas.height,Math.max(1,Math.min(100,Math.max(altitude,0)*.001))),uniforms=new Float32Array(32);
      uniforms.set(mul(projection,viewRotation(camera.yaw,camera.pitch)));uniforms.set([-relative[0],-relative[1],-relative[2],planet.radius],16);uniforms.set([simTime,rotation,planet.maxTerrainHeight,planet.seed],20);uniforms.set([...normalize(sub(system.star.position,center)),1],24);uniforms.set([Math.max(0,altitude),distance,grid?1:0,transitions.alpha],28);
      const count=renderer.render(uniforms,transitions.instances);
      Object.assign(diagnostics,{frames:diagnostics.frames+1,tiles:count,altitude,logicalTiles:transitions.target.length,cutBudget:quadtree.maxTiles,drawCapacity:renderer.instanceCapacity,inFlight:renderer.inFlight,transitioning:transitions.active,morph:transitions.alpha,stitchedEdges:quadtree.stats.stitchedEdges,balanceSplits:quadtree.stats.balanceSplits,phase:'2B'});
      averageMs=averageMs*.92+elapsed*.08;element('altitude').textContent=fmt(Math.max(0,altitude));element('distance').textContent=fmt(distance);element('frame-time').textContent=`${averageMs.toFixed(1)} ms`;element('tiles').textContent=String(count);element('lod').textContent=String(quadtree.stats.maxLevel);element('budget').textContent=quadtree.stats.budgetLimited?'LIMITED · balanced parents retained':'OK';
      if(element('stitches'))element('stitches').textContent=String(quadtree.stats.stitchedEdges);if(element('transition'))element('transition').textContent=transitions.active?`Morphing ${(transitions.alpha*100).toFixed(0)}%`:'Stable';
      if(diagnostics.frames===1)renderer.verifyFirstFrame().then(()=>{if(!stopped){diagnostics.state='running';element('runtime-status').textContent='WebGPU online · seam-safe terrain';}}).catch(fail);
      requestAnimationFrame(draw);
    }catch(error){fail(error);}
  }
  requestAnimationFrame(draw);
}
boot().catch(fail);

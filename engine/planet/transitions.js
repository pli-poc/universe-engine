import { tileAt, childrenOf, coveringLeaf, setStitchMasks } from './topology.js';
export const RENDER_INSTANCE_FLOATS=20;
export const PATCH_RESOLUTION=32;
const signature=tiles=>tiles.map(t=>`${t.key}/${t.edgeMask}`).sort().join('|');
/** Common refinement: draw neither overlapping parents/children nor incomplete branches. */
export function transitionCut(from,to){
  const a=new Map(from.map(t=>[t.key,t])),b=new Map(to.map(t=>[t.key,t])),result=[];
  function visit(t){const source=coveringLeaf(a,t),target=coveringLeaf(b,t);if(source&&target){result.push({...t,source,target});return;}if(t.level>=20)throw new Error('Incomplete transition cut');for(const child of childrenOf(t))visit(child);}
  for(let face=0;face<6;face++)visit(tileAt(face,0,0,0));return setStitchMasks(result);
}
export function renderInstances(tiles,anchorForTile){const data=new Float32Array(tiles.length*RENDER_INSTANCE_FLOATS);tiles.forEach((t,i)=>{const a=t.source||t,b=t.target||t,anchor=anchorForTile?anchorForTile(t):[0,0,0,0];if(anchor.length!==4||!anchor.every(Number.isFinite))throw new Error('Invalid tile anchor');data.set([t.face,t.u0,t.v0,t.size,t.level,t.x,t.y,t.edgeMask,a.u0,a.v0,a.size,a.edgeMask,b.u0,b.v0,b.size,b.edgeMask,...anchor],i*RENDER_INSTANCE_FLOATS);});return data;}
export class TerrainTransitions {
  constructor({duration=.35,capacity=4096}={}){if(!(duration>0)||!Number.isFinite(duration)||!Number.isInteger(capacity)||capacity<6)throw new RangeError('Invalid transition limits');Object.assign(this,{duration,capacity});this.current=null;this.active=false;this.alpha=1;this.revision=0;this.blocked=false;}
  offer(tiles){
    if(this.active)return false; // Endpoints remain frozen while geometry moves.
    if(tiles.length>this.capacity){this.blocked=true;return false;}
    const next=signature(tiles);if(next===this.signature)return false;
    const render=transitionCut(this.current||tiles,tiles);
    if(render.length>this.capacity){this.blocked=true;return false;}
    this.blocked=false;this.target=tiles;this.pendingSignature=next;this.renderTiles=render;this.instances=renderInstances(render);this.revision++;this.elapsed=0;this.active=!!this.current;this.alpha=this.active?0:1;
    if(!this.active){this.current=tiles;this.signature=next;}return true;
  }
  advance(dt){
    if(!Number.isFinite(dt)||dt<0)throw new RangeError('Invalid transition time');if(!this.active)return;
    this.elapsed+=dt;const t=Math.min(1,this.elapsed/this.duration);this.alpha=t*t*(3-2*t);
    if(t===1){this.current=this.target;this.signature=this.pendingSignature;this.active=false;this.renderTiles=transitionCut(this.current,this.current);this.instances=renderInstances(this.renderTiles);this.revision++;}
  }
}

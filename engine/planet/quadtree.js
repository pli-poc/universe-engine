import { faceDirection } from './cube-sphere.js';
import { tileAt, childrenOf, coveringLeaf, neighborAddress, setStitchMasks } from './topology.js';
class MaxHeap {
  constructor(){this.items=[];}
  better(a,b){return a.priority>b.priority||(a.priority===b.priority&&a.key<b.key);}
  push(t){const a=this.items;let i=a.length;a.push(t);while(i>0){const p=(i-1)>>1;if(!this.better(t,a[p]))break;a[i]=a[p];i=p;}a[i]=t;}
  pop(){const a=this.items,head=a[0],tail=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let j=i*2+1;if(j+1<a.length&&this.better(a[j+1],a[j]))j++;if(!this.better(a[j],tail))break;a[i]=a[j];i=j;}a[i]=tail;}return head;}
  get length(){return this.items.length;}
}
export function worldToPlanet(v,a){const c=Math.cos(a),s=Math.sin(a);return [c*v[0]-s*v[2],v[1],s*v[0]+c*v[2]];}
/** Complete, budget-bounded 2:1 leaf cut. Splits and their neighbour closure are atomic.
 * Priority is projected patch footprint, not yet a certified geometric error bound.
 */
export class PlanetQuadtree {
  constructor({maxLevel=12,splitPixels=230,mergePixels=135,maxTiles=1536}={}){
    if(!Number.isInteger(maxLevel)||maxLevel<0||maxLevel>20)throw new RangeError('maxLevel must be 0..20');
    if(!Number.isInteger(maxTiles)||maxTiles<6)throw new RangeError('At least six root tiles are required');
    if(!(mergePixels>0&&splitPixels>mergePixels))throw new RangeError('Require 0 < mergePixels < splitPixels');
    Object.assign(this,{maxLevel,splitPixels,mergePixels,maxTiles});this.splitState=new Set();this.stats={};
  }
  select({planetRadius,cameraRelativeWorld,planetRotation,viewportHeight,fovY}){
    if(!(planetRadius>0&&viewportHeight>0&&fovY>0&&fovY<Math.PI)||!Number.isFinite(planetRotation)||!cameraRelativeWorld.every(Number.isFinite))throw new RangeError('Invalid LOD camera');
    // The inverse already changes the sign; passing -angle was a double inversion.
    const camera=worldToPlanet(cameraRelativeWorld,planetRotation),focal=viewportHeight/(2*Math.tan(fovY/2));
    const leaves=new Map(),heap=new MaxHeap(),splitNext=new Set();let candidates=0,balanceSplits=0,budgetLimited=false;
    const measure=t=>{candidates++;const center=faceDirection(t.face,t.u0+t.size/2,t.v0+t.size/2).map(v=>v*planetRadius);const distance=Math.max(1,Math.hypot(...camera.map((v,i)=>v-center[i])));t.projected=planetRadius*1.7*t.size*focal/distance;t.priority=t.projected/(this.splitState.has(t.key)?this.mergePixels:this.splitPixels);return t;};
    const insert=t=>{measure(t);leaves.set(t.key,t);if(t.level<this.maxLevel&&t.priority>1)heap.push(t);};
    for(let face=0;face<6;face++)insert(tileAt(face,0,0,0));
    while(heap.length){
      const t=heap.pop();if(!leaves.has(t.key))continue;const plan=new Map();
      const requireSplit=tile=>{if(plan.has(tile.key))return;plan.set(tile.key,tile);for(let e=0;e<4;e++){const n=coveringLeaf(leaves,neighborAddress(tile,e));if(n&&n.level<tile.level)requireSplit(n);}};
      requireSplit(t);
      if(leaves.size+3*plan.size>this.maxTiles){budgetLimited=true;continue;}
      balanceSplits+=plan.size-1;
      for(const parent of plan.values()){leaves.delete(parent.key);splitNext.add(parent.key);for(const child of childrenOf(parent))insert(child);}
    }
    this.splitState=splitNext;const result=setStitchMasks([...leaves.values()].sort((a,b)=>a.key.localeCompare(b.key)));
    this.stats={tiles:result.length,maxLevel:Math.max(...result.map(t=>t.level)),candidates,balanceSplits,budgetLimited,stitchedEdges:result.reduce((n,t)=>n+[0,1,2,3].filter(e=>t.edgeMask&(1<<e)).length,0)};return result;
  }
  // Compact logical-cut serializer; transitions use a separate 16-float render ABI.
  toInstanceArray(tiles){const a=new Float32Array(tiles.length*8);tiles.forEach((t,i)=>a.set([t.face,t.u0,t.v0,t.size,t.level,t.x,t.y,t.edgeMask],i*8));return a;}
}

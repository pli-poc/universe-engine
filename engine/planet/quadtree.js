import {faceDirection} from "./cube-sphere.js";

function rotateYInverse(v,a){
  const c=Math.cos(a),s=Math.sin(a);
  return [c*v[0]-s*v[2],v[1],s*v[0]+c*v[2]];
}
function distance3(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])}

export class PlanetQuadtree{
  constructor({maxLevel=12,splitPixels=230,mergePixels=135,maxTiles=4095}={}){
    this.maxLevel=maxLevel;
    this.splitPixels=splitPixels;
    this.mergePixels=mergePixels;
    this.maxTiles=maxTiles;
    this.splitState=new Set();
    this.stats={tiles:0,maxLevel:0,candidates:0,budgetLimited:false};
  }

  select({planetRadius,cameraRelativeWorld,planetRotation,viewportHeight,fovY}){
    const cameraLocal=rotateYInverse(cameraRelativeWorld,-planetRotation);
    const focal=viewportHeight/(2*Math.tan(fovY/2));
    let candidates=0;

    const makeTile=(face,level,x,y)=>{
      candidates++;
      const n=1<<level;
      const size=2/n;
      const u0=-1+x*size;
      const v0=-1+y*size;
      const center=faceDirection(face,u0+size*.5,v0+size*.5);
      const tileWorld=[center[0]*planetRadius,center[1]*planetRadius,center[2]*planetRadius];
      const tileDistance=Math.max(1,distance3(cameraLocal,tileWorld));
      const angularSpan=1.7*size;
      const projected=planetRadius*angularSpan/tileDistance*focal;
      return {face,level,x,y,u0,v0,size,projected,edgeMask:0};
    };

    const leaves=[];
    for(let face=0;face<6;face++)leaves.push(makeTile(face,0,0,0));

    let budgetLimited=false;
    while(true){
      let bestIndex=-1;
      let bestPriority=-Infinity;

      for(let i=0;i<leaves.length;i++){
        const t=leaves[i];
        if(t.level>=this.maxLevel)continue;

        const key=t.face+":"+t.level+":"+t.x+":"+t.y;
        const wasSplit=this.splitState.has(key);
        const threshold=wasSplit?this.mergePixels:this.splitPixels;
        if(t.projected<=threshold){
          this.splitState.delete(key);
          continue;
        }

        const priority=t.projected/threshold;
        if(priority>bestPriority){
          bestPriority=priority;
          bestIndex=i;
        }
      }

      if(bestIndex<0)break;

      // Replacing one parent with four children costs exactly +3 leaves.
      // If the budget cannot afford that, keep the parent. Coverage is never dropped.
      if(leaves.length+3>this.maxTiles){
        budgetLimited=true;
        break;
      }

      const parent=leaves[bestIndex];
      const key=parent.face+":"+parent.level+":"+parent.x+":"+parent.y;
      this.splitState.add(key);

      const l=parent.level+1,xx=parent.x*2,yy=parent.y*2;
      const children=[
        makeTile(parent.face,l,xx,yy),
        makeTile(parent.face,l,xx+1,yy),
        makeTile(parent.face,l,xx,yy+1),
        makeTile(parent.face,l,xx+1,yy+1)
      ];

      leaves.splice(bestIndex,1,...children);
    }

    this.computeEdgeMasks(leaves);

    let maxSeen=0;
    for(const t of leaves)maxSeen=Math.max(maxSeen,t.level);
    this.stats={tiles:leaves.length,maxLevel:maxSeen,candidates,budgetLimited};
    return leaves;
  }

  computeEdgeMasks(tiles){
    const sameLevel=new Set(tiles.map(t=>t.face+":"+t.level+":"+t.x+":"+t.y));
    for(const t of tiles){
      const n=1<<t.level;
      let mask=0;

      // Only mixed-LOD interior borders receive skirts. Same-level neighbors meet
      // vertex-for-vertex; cube-face borders remain skirt-free to avoid coincident walls.
      if(t.y>0&&!sameLevel.has(t.face+":"+t.level+":"+t.x+":"+(t.y-1)))mask|=1;
      if(t.x<n-1&&!sameLevel.has(t.face+":"+t.level+":"+(t.x+1)+":"+t.y))mask|=2;
      if(t.y<n-1&&!sameLevel.has(t.face+":"+t.level+":"+t.x+":"+(t.y+1)))mask|=4;
      if(t.x>0&&!sameLevel.has(t.face+":"+t.level+":"+(t.x-1)+":"+t.y))mask|=8;
      t.edgeMask=mask;
    }
  }

  toInstanceArray(tiles){
    const data=new Float32Array(tiles.length*8);
    for(let i=0;i<tiles.length;i++){
      const t=tiles[i],o=i*8;
      data[o]=t.face;data[o+1]=t.u0;data[o+2]=t.v0;data[o+3]=t.size;
      data[o+4]=t.level;data[o+5]=t.x;data[o+6]=t.y;data[o+7]=t.edgeMask;
    }
    return data;
  }
}


import {faceDirection} from "./cube-sphere.js";

function rotateYInverse(v,a){
  const c=Math.cos(a),s=Math.sin(a);
  return [c*v[0]-s*v[2],v[1],s*v[0]+c*v[2]];
}
function distance3(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])}

export class PlanetQuadtree{
  constructor({maxLevel=12,splitPixels=190,mergePixels=125,maxTiles=4096}={}){
    this.maxLevel=maxLevel;this.splitPixels=splitPixels;this.mergePixels=mergePixels;this.maxTiles=maxTiles;
    this.splitState=new Set();this.stats={tiles:0,maxLevel:0,candidates:0};
  }
  select({planetRadius,cameraRelativeWorld,planetRotation,viewportHeight,fovY}){
    const cameraLocal=rotateYInverse(cameraRelativeWorld,-planetRotation);
    const cameraDistance=Math.hypot(...cameraLocal);
    const cameraDir=cameraDistance>0?cameraLocal.map(v=>v/cameraDistance):[0,0,1];
    const focal=viewportHeight/(2*Math.tan(fovY/2));
    const visible=[];let candidates=0,maxSeen=0;
    const visit=(face,level,x,y)=>{
      if(visible.length>=this.maxTiles)return;
      candidates++;
      const n=1<<level,size=2/n,u0=-1+x*size,v0=-1+y*size;
      const center=faceDirection(face,u0+size*.5,v0+size*.5);
      const tileWorld=[center[0]*planetRadius,center[1]*planetRadius,center[2]*planetRadius];
      const tileDistance=Math.max(1,distance3(cameraLocal,tileWorld));
      const horizonDot=center[0]*cameraDir[0]+center[1]*cameraDir[1]+center[2]*cameraDir[2];
      const horizonLimit=cameraDistance<=planetRadius?-.2:-Math.sqrt(Math.max(0,1-(planetRadius*planetRadius)/(cameraDistance*cameraDistance)))-.18;
      if(horizonDot<horizonLimit&&level>1)return;
      const angularSpan=1.7*size;
      const projected=planetRadius*angularSpan/tileDistance*focal;
      const key=face+":"+level+":"+x+":"+y;
      const wasSplit=this.splitState.has(key);
      const threshold=wasSplit?this.mergePixels:this.splitPixels;
      const shouldSplit=level<this.maxLevel&&projected>threshold&&visible.length+4<this.maxTiles;
      if(shouldSplit){
        this.splitState.add(key);
        const l=level+1,xx=x*2,yy=y*2;
        visit(face,l,xx,yy);visit(face,l,xx+1,yy);visit(face,l,xx,yy+1);visit(face,l,xx+1,yy+1);
      }else{
        this.splitState.delete(key);
        visible.push({face,level,x,y,u0,v0,size,projected});
        maxSeen=Math.max(maxSeen,level);
      }
    };
    for(let f=0;f<6;f++)visit(f,0,0,0);
    this.stats={tiles:visible.length,maxLevel:maxSeen,candidates};
    return visible;
  }
  toInstanceArray(tiles){
    const data=new Float32Array(tiles.length*8);
    for(let i=0;i<tiles.length;i++){
      const t=tiles[i],o=i*8;
      data[o]=t.face;data[o+1]=t.u0;data[o+2]=t.v0;data[o+3]=t.size;
      data[o+4]=t.level;data[o+5]=t.x;data[o+6]=t.y;data[o+7]=0;
    }
    return data;
  }
}

/** Faces: +X,-X,+Y,-Y,+Z,-Z. Edges: north,east,south,west. Dyadic planet-local addressing. */
import { facePoint } from './cube-sphere.js';
export const NORTH=0,EAST=1,SOUTH=2,WEST=3;
export const keyOf=t=>`${t.face}:${t.level}:${t.x}:${t.y}`;
export function tileAt(face,level,x,y){const size=2/2**level;const t={face,level,x,y,size,u0:-1+x*size,v0:-1+y*size,edgeMask:0};t.key=keyOf(t);return t;}
export function childrenOf(t){return [tileAt(t.face,t.level+1,t.x*2,t.y*2),tileAt(t.face,t.level+1,t.x*2+1,t.y*2),tileAt(t.face,t.level+1,t.x*2,t.y*2+1),tileAt(t.face,t.level+1,t.x*2+1,t.y*2+1)];}
export function edgeUV(t,e,s){if(e===NORTH)return [t.u0+t.size*s,t.v0];if(e===EAST)return [t.u0+t.size,t.v0+t.size*s];if(e===SOUTH)return [t.u0+t.size*s,t.v0+t.size];return [t.u0,t.v0+t.size*s];}
function dominantFace(p){const a=p.map(Math.abs),axis=a[0]>=a[1]&&a[0]>=a[2]?0:a[1]>=a[2]?1:2;return axis*2+(p[axis]<0?1:0);}
export function pointUV(face,p){const s=Math.abs(p[Math.floor(face/2)]);switch(face){case 0:return [-p[2]/s,p[1]/s];case 1:return [p[2]/s,p[1]/s];case 2:return [p[0]/s,-p[2]/s];case 3:return [p[0]/s,p[2]/s];case 4:return [p[0]/s,p[1]/s];default:return [-p[0]/s,p[1]/s];}}
// Derive all 24 directed connections, including reversed axes, from the face bases.
export const FACE_EDGES=Array.from({length:6},(_,face)=>Array.from({length:4},(_,edge)=>{
  const root=tileAt(face,0,0,0),outside=edgeUV(root,edge,.5);
  if(edge===NORTH)outside[1]-=.01;if(edge===EAST)outside[0]+=.01;if(edge===SOUTH)outside[1]+=.01;if(edge===WEST)outside[0]-=.01;
  const other=dominantFace(facePoint(face,...outside)),mid=pointUV(other,facePoint(face,...edgeUV(root,edge,.5)));
  const otherEdge=mid[1]===-1?NORTH:mid[0]===1?EAST:mid[1]===1?SOUTH:WEST,axis=otherEdge===NORTH||otherEdge===SOUTH?0:1;
  const a=pointUV(other,facePoint(face,...edgeUV(root,edge,0)))[axis],b=pointUV(other,facePoint(face,...edgeUV(root,edge,1)))[axis];
  return Object.freeze({face:other,edge:otherEdge,reversed:b<a});
}));
export function neighborAddress(t,edge){
  const n=2**t.level,x=t.x+[0,1,0,-1][edge],y=t.y+[-1,0,1,0][edge];
  if(x>=0&&x<n&&y>=0&&y<n)return {...tileAt(t.face,t.level,x,y),edge:(edge+2)%4,reversed:false};
  const c=FACE_EDGES[t.face][edge],uv=pointUV(c.face,facePoint(t.face,...edgeUV(t,edge,.5)));
  const cell=v=>Math.max(0,Math.min(n-1,Math.floor((v+1)*n/2)));
  return {...tileAt(c.face,t.level,cell(uv[0]),cell(uv[1])),edge:c.edge,reversed:c.reversed};
}
export function coveringLeaf(leaves,t){for(let level=t.level;level>=0;level--){const s=2**(t.level-level),hit=leaves.get(`${t.face}:${level}:${Math.floor(t.x/s)}:${Math.floor(t.y/s)}`);if(hit)return hit;}return null;}
export function neighborsOf(leaves,t,edge){
  const address=neighborAddress(t,edge),cover=coveringLeaf(leaves,address);if(cover)return [cover];const found=[];
  function visit(cell,depth=0){const leaf=leaves.get(cell.key);if(leaf){found.push(leaf);return;}if(depth>24)throw new Error('Incomplete quadtree coverage at '+cell.key);const kids=childrenOf(cell);for(const i of [[0,1],[1,3],[2,3],[0,2]][address.edge])visit(kids[i],depth+1);}
  visit(address);return found;
}
export function setStitchMasks(tiles){const leaves=new Map(tiles.map(t=>[t.key,t]));for(const t of tiles){let mask=0;for(let e=0;e<4;e++){const n=coveringLeaf(leaves,neighborAddress(t,e));if(n&&n.level<t.level)mask|=1<<e;}t.edgeMask=mask;}return tiles;}

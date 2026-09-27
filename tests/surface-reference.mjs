// Independent double-precision oracle for the WGSL geometric interpolation contract.
import {faceDirection} from '../engine/planet/cube-sphere.js';
export const RES=32;
const height=d=>9000*(Math.sin(d[0]*23)*Math.cos(d[1]*13)+.3*Math.sin(d[2]*57));
const mix=(a,b,t)=>a.map((v,i)=>v*(1-t)+b[i]*t);
function raw(face,uv){const d=faceDirection(face,...uv),h=height(d);return [...d.map(v=>v*(6371000+h)),h];}
function axis(mask,x,y){if(x%2===1&&((y===0&&(mask&1))||(y===RES&&(mask&4))))return [1,0];if(y%2===1&&((x===RES&&(mask&2))||(x===0&&(mask&8))))return [0,1];return [0,0];}
function vertex(t,x,y){const a=axis(t.edgeMask,x,y),step=t.size/RES,uv=[t.u0+x*step,t.v0+y*step];if(a[0]||a[1])return mix(raw(t.face,uv.map((v,i)=>v-a[i]*step)),raw(t.face,uv.map((v,i)=>v+a[i]*step)),.5);return raw(t.face,uv);}
export function surface(t,uv){
 const g=uv.map((v,i)=>Math.max(0,Math.min(RES,(v-[t.u0,t.v0][i])/t.size*RES)));
 if(g.every(Number.isInteger))return vertex(t,...g);
 const cell=g.map(v=>Math.min(Math.floor(v),RES-1)),f=g.map((v,i)=>v-cell[i]);let samples,weights;
 if(f[0]+f[1]<=1){samples=[[0,0],[1,0],[0,1]];weights=[1-f[0]-f[1],f[0],f[1]];}else{samples=[[1,1],[0,1],[1,0]];weights=[f[0]+f[1]-1,1-f[0],1-f[1]];}
 return samples.map(s=>vertex(t,s[0]+cell[0],s[1]+cell[1])).reduce((a,p,j)=>a.map((v,i)=>v+p[i]*weights[j]),[0,0,0,0]);
}
export function morphSurface(t,uv,alpha){return mix(surface(t.source||t,uv),surface(t.target||t,uv),alpha);}
export function renderVertex(t,x,y,alpha){const a=axis(t.edgeMask,x,y),step=t.size/RES,uv=[t.u0+x*step,t.v0+y*step];if(a[0]||a[1])return mix(morphSurface(t,uv.map((v,i)=>v-a[i]*step),alpha),morphSurface(t,uv.map((v,i)=>v+a[i]*step),alpha),.5);return morphSurface(t,uv,alpha);}

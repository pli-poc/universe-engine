struct Uniforms {
  viewProj: mat4x4<f32>,
  centerRadius: vec4<f32>,
  timeRotationHeight: vec4<f32>,
  sunDirExposure: vec4<f32>,
  misc: vec4<f32>, // altitude, distance, debug-mode, GLOBAL morph alpha
};
@group(0) @binding(0) var<uniform> u: Uniforms;
const GRID: f32 = 32.0;
struct VSIn {
  @location(0) grid: vec4<f32>,
  @location(1) tile: vec4<f32>,
  @location(2) tileMeta: vec4<f32>,
  @location(3) sourceTile: vec4<f32>,
  @location(4) targetTile: vec4<f32>,
};
struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) worldPos: vec3<f32>,
  @location(2) height: f32,
  @location(3) gridUV: vec2<f32>,
  @location(4) @interpolate(flat) level: f32,
};
fn cubePoint(face:f32,uv:vec2<f32>)->vec3<f32>{
  let f=i32(face+.5);let x=uv.x;let y=uv.y;
  if(f==0){return vec3<f32>(1.0,y,-x);}if(f==1){return vec3<f32>(-1.0,y,x);}
  if(f==2){return vec3<f32>(x,1.0,-y);}if(f==3){return vec3<f32>(x,-1.0,y);}
  if(f==4){return vec3<f32>(x,y,1.0);}return vec3<f32>(-x,y,-1.0);
}
fn hash31(p:vec3<f32>)->f32{var q=fract(p*vec3<f32>(0.1031,0.11369,0.13787));q+=vec3<f32>(dot(q,q.yzx+vec3<f32>(19.19)));return fract((q.x+q.y)*q.z);}
fn noise(p:vec3<f32>)->f32{
  let i=floor(p);let f=fract(p);let s=f*f*(3.0-2.0*f);
  let a=mix(hash31(i),hash31(i+vec3<f32>(1,0,0)),s.x);
  let b=mix(hash31(i+vec3<f32>(0,1,0)),hash31(i+vec3<f32>(1,1,0)),s.x);
  let c=mix(hash31(i+vec3<f32>(0,0,1)),hash31(i+vec3<f32>(1,0,1)),s.x);
  let d=mix(hash31(i+vec3<f32>(0,1,1)),hash31(i+vec3<f32>(1,1,1)),s.x);
  return mix(mix(a,b,s.y),mix(c,d,s.y),s.z);
}
fn fbm(p0:vec3<f32>)->f32{var p=p0;var a=.52;var n=0.0;for(var i=0;i<7;i++){n+=noise(p)*a;p=p*2.03+vec3<f32>(13.1,7.7,19.3);a*=.5;}return n;}
fn terrain(d:vec3<f32>)->f32{
  let seed=vec3<f32>(u.timeRotationHeight.w);let continents=fbm(d*2.7+seed)-0.49;
  let ridged=1.0-abs(fbm(d*8.0+vec3<f32>(31.0))*2.0-1.0);
  let detail=(fbm(d*34.0+seed*.17)-.5)*.12;
  return (continents*.78+max(continents,0.0)*ridged*.62+detail*max(continents,0.0))*u.timeRotationHeight.z;
}
fn rawVertex(face:f32,uv:vec2<f32>)->vec4<f32>{let d=normalize(cubePoint(face,uv));let h=terrain(d);return vec4<f32>(d*(u.centerRadius.w+h),h);}
// Odd fine-edge vertices lie on coarse Cartesian chords, including displaced height.
// Normalizing the midpoint back to a sphere would reopen a curvature crack.
fn stitchAxis(mask:u32,g:vec2<f32>)->vec2<f32>{
  let oddX=(u32(round(g.x))&1u)!=0u;let oddY=(u32(round(g.y))&1u)!=0u;
  if(oddX&&((g.y==0.0&&(mask&1u)!=0u)||(g.y==GRID&&(mask&4u)!=0u))){return vec2<f32>(1.0,0.0);}
  if(oddY&&((g.x==GRID&&(mask&2u)!=0u)||(g.x==0.0&&(mask&8u)!=0u))){return vec2<f32>(0.0,1.0);}
  return vec2<f32>(0.0);
}
fn patchVertex(face:f32,t:vec4<f32>,g:vec2<f32>)->vec4<f32>{
  let step=t.z/GRID;let uv=t.xy+g*step;let axis=stitchAxis(u32(t.w),g);
  if(any(axis!=vec2<f32>(0.0))){return (rawVertex(face,uv-axis*step)+rawVertex(face,uv+axis*step))*.5;}
  return rawVertex(face,uv);
}
// Reconstruct endpoint TRIANGLES, not just endpoint height fields.
fn surface(face:f32,t:vec4<f32>,uv:vec2<f32>)->vec4<f32>{
  let g=clamp((uv-t.xy)/t.z*GRID,vec2<f32>(0.0),vec2<f32>(GRID));
  if(all(g==floor(g))){return patchVertex(face,t,g);}
  let cell=min(floor(g),vec2<f32>(GRID-1.0));let f=g-cell;
  if(f.x+f.y<=1.0){return patchVertex(face,t,cell)*(1.0-f.x-f.y)+patchVertex(face,t,cell+vec2<f32>(1,0))*f.x+patchVertex(face,t,cell+vec2<f32>(0,1))*f.y;}
  return patchVertex(face,t,cell+vec2<f32>(1,1))*(f.x+f.y-1.0)+patchVertex(face,t,cell+vec2<f32>(0,1))*(1.0-f.x)+patchVertex(face,t,cell+vec2<f32>(1,0))*(1.0-f.y);
}
fn endpointMix(input:VSIn,uv:vec2<f32>)->vec4<f32>{
  let alpha=clamp(u.misc.w,0.0,1.0);
  if(alpha>=1.0||all(input.sourceTile==input.targetTile)){return surface(input.tile.x,input.targetTile,uv);}
  if(alpha<=0.0){return surface(input.tile.x,input.sourceTile,uv);}
  return mix(surface(input.tile.x,input.sourceTile,uv),surface(input.tile.x,input.targetTile,uv),alpha);
}
fn rotateY(p:vec3<f32>,a:f32)->vec3<f32>{let c=cos(a);let s=sin(a);return vec3<f32>(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);}
@vertex fn vsMain(input:VSIn)->VSOut{
  var o:VSOut;let uv=input.tile.yz+input.grid.xy*input.tile.w;
  let axis=stitchAxis(u32(input.tileMeta.w),input.grid.xy*GRID);var p:vec4<f32>;
  if(any(axis!=vec2<f32>(0.0))){let delta=axis*input.tile.w/GRID;p=(endpointMix(input,uv-delta)+endpointMix(input,uv+delta))*.5;}else{p=endpointMix(input,uv);}
  let rotated=rotateY(p.xyz,u.timeRotationHeight.y);let world=u.centerRadius.xyz+rotated;
  o.position=u.viewProj*vec4<f32>(world,1.0);o.normal=normalize(rotated);o.worldPos=world;o.height=p.w;o.gridUV=input.grid.xy;o.level=input.tileMeta.x;return o;
}
@fragment fn fsMain(i:VSOut)->@location(0) vec4<f32>{
  let n=normalize(i.normal);let l=normalize(u.sunDirExposure.xyz);let v=normalize(-i.worldPos);let ndl=max(dot(n,l),0.0);let hNorm=i.height/max(u.timeRotationHeight.z,1.0);var base:vec3<f32>;
  if(hNorm < -0.02){base=vec3<f32>(0.008,0.055,0.105);}else if(hNorm < 0.04){base=vec3<f32>(0.23,0.20,0.11);}
  else if(hNorm < 0.28){base=mix(vec3<f32>(0.055,0.135,0.068),vec3<f32>(0.25,0.22,0.17),clamp(hNorm*3.0,0.0,1.0));}
  else{base=mix(vec3<f32>(0.25,0.24,0.22),vec3<f32>(0.84,0.88,0.92),smoothstep(.35,.78,hNorm));}
  let fres=pow(1.0-max(dot(n,v),0.0),4.0);let atmosphere=vec3<f32>(0.08,0.40,0.82)*fres*(0.25+ndl);
  var color=(base*(.032+ndl*1.18)+atmosphere*.34)*u.sunDirExposure.w;
  // LOD no longer changes production brightness. Grid visualization is explicit.
  if(u.misc.z>0.5){let edge=min(min(i.gridUV.x,1.0-i.gridUV.x),min(i.gridUV.y,1.0-i.gridUV.y));let width=max(fwidth(i.gridUV.x),fwidth(i.gridUV.y))*1.3;let line=1.0-smoothstep(0.0,width,edge);color=mix(color,vec3<f32>(0.25,0.7,1.0),line*.8);}
  return vec4<f32>(color,1.0);
}

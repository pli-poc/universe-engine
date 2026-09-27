
struct Uniforms {
  viewProj : mat4x4<f32>,
  centerRadius : vec4<f32>,
  timeRotationHeight : vec4<f32>,
  sunDirExposure : vec4<f32>,
  misc : vec4<f32>,
};
@group(0) @binding(0) var<uniform> u : Uniforms;

struct VSIn {
  @location(0) grid : vec3<f32>,
  @location(1) tile : vec4<f32>,
  @location(2) tileMeta : vec4<f32>,
};
struct VSOut {
  @builtin(position) position : vec4<f32>,
  @location(0) normal : vec3<f32>,
  @location(1) worldPos : vec3<f32>,
  @location(2) height : f32,
  @location(3) level : f32,
};

fn cubePoint(face:f32,uv:vec2<f32>)->vec3<f32>{
  let f=i32(face+.5);let x=uv.x;let y=uv.y;
  if(f==0){return vec3<f32>(1.0,y,-x);}
  if(f==1){return vec3<f32>(-1.0,y,x);}
  if(f==2){return vec3<f32>(x,1.0,-y);}
  if(f==3){return vec3<f32>(x,-1.0,y);}
  if(f==4){return vec3<f32>(x,y,1.0);}
  return vec3<f32>(-x,y,-1.0);
}
fn hash31(p:vec3<f32>)->f32{
  var q=fract(p*vec3<f32>(0.1031,0.11369,0.13787));
  q+=vec3<f32>(dot(q,q.yzx+vec3<f32>(19.19)));
  return fract((q.x+q.y)*q.z);
}
fn noise(p:vec3<f32>)->f32{
  let i=floor(p);let f=fract(p);let s=f*f*(3.0-2.0*f);
  let n000=hash31(i+vec3<f32>(0,0,0));let n100=hash31(i+vec3<f32>(1,0,0));
  let n010=hash31(i+vec3<f32>(0,1,0));let n110=hash31(i+vec3<f32>(1,1,0));
  let n001=hash31(i+vec3<f32>(0,0,1));let n101=hash31(i+vec3<f32>(1,0,1));
  let n011=hash31(i+vec3<f32>(0,1,1));let n111=hash31(i+vec3<f32>(1,1,1));
  let x00=mix(n000,n100,s.x);let x10=mix(n010,n110,s.x);let x01=mix(n001,n101,s.x);let x11=mix(n011,n111,s.x);
  return mix(mix(x00,x10,s.y),mix(x01,x11,s.y),s.z);
}
fn fbm(p0:vec3<f32>)->f32{
  var p=p0;var a=.52;var n=0.0;
  for(var i=0;i<7;i++){n+=noise(p)*a;p=p*2.03+vec3<f32>(13.1,7.7,19.3);a*=.5;}
  return n;
}
fn terrain(d:vec3<f32>)->f32{
  let seed=vec3<f32>(u.timeRotationHeight.w);
  let continents=fbm(d*2.7+seed)-0.49;
  let ridgeBase=fbm(d*8.0+vec3<f32>(31.0));
  let ridged=1.0-abs(ridgeBase*2.0-1.0);
  let detail=(fbm(d*34.0+seed*.17)-.5)*.12;
  return (continents*.78+max(continents,0.0)*ridged*.62+detail*max(continents,0.0))*u.timeRotationHeight.z;
}
fn rotateY(p:vec3<f32>,a:f32)->vec3<f32>{
  let c=cos(a);let s=sin(a);return vec3<f32>(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);
}
@vertex fn vsMain(input:VSIn)->VSOut{
  var o:VSOut;
  let uv=vec2<f32>(input.tile.y,input.tile.z)+input.grid.xy*input.tile.w;
  let d=normalize(cubePoint(input.tile.x,uv));
  let h=terrain(d);
  let skirt=input.grid.z*(max(80.0,u.timeRotationHeight.z*.035)+input.tile.w*u.centerRadius.w*.002);
  let rd=rotateY(d,u.timeRotationHeight.y);
  let world=u.centerRadius.xyz+rd*(u.centerRadius.w+h-skirt);
  o.position=u.viewProj*vec4<f32>(world,1.0);
  o.normal=rd;o.worldPos=world;o.height=h;o.level=input.tileMeta.x;return o;
}
@fragment fn fsMain(i:VSOut)->@location(0) vec4<f32>{
  let n=normalize(i.normal);let l=normalize(u.sunDirExposure.xyz);let v=normalize(-i.worldPos);
  let ndl=max(dot(n,l),0.0);
  let hNorm=i.height/max(u.timeRotationHeight.z,1.0);
  var base:vec3<f32>;
  if(hNorm < -0.02){base=vec3<f32>(0.008,0.055,0.105);}
  else if(hNorm < 0.04){base=vec3<f32>(0.23,0.20,0.11);}
  else if(hNorm < 0.28){base=mix(vec3<f32>(0.055,0.135,0.068),vec3<f32>(0.25,0.22,0.17),clamp(hNorm*3.0,0.0,1.0));}
  else {base=mix(vec3<f32>(0.25,0.24,0.22),vec3<f32>(0.84,0.88,0.92),smoothstep(.35,.78,hNorm));}
  let fres=pow(1.0-max(dot(n,v),0.0),4.0);
  let atmosphere=vec3<f32>(0.08,0.40,0.82)*fres*(0.25+ndl);
  let lodTint=1.0+min(i.level,12.0)*.006;
  return vec4<f32>((base*(.032+ndl*1.18)+atmosphere*.34)*u.sunDirExposure.w*lodTint,1.0);
}


struct Uniforms {
  viewProj : mat4x4<f32>,
  centerRadius : vec4<f32>,
  timeRotationHeight : vec4<f32>,
  sunDirExposure : vec4<f32>,
  misc : vec4<f32>,
};
@group(0) @binding(0) var<uniform> u : Uniforms;

struct VSIn { @location(0) dir : vec3<f32> };
struct VSOut {
  @builtin(position) position : vec4<f32>,
  @location(0) normal : vec3<f32>,
  @location(1) worldPos : vec3<f32>,
  @location(2) height : f32,
};

fn hash31(p:vec3<f32>)->f32{
  var q=fract(p*vec3<f32>(0.1031,0.11369,0.13787));
  q+=dot(q,q.yzx+19.19);
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
  for(var i=0;i<6;i++){n+=noise(p)*a;p=p*2.03+vec3<f32>(13.1,7.7,19.3);a*=.5;}
  return n;
}
fn rotateY(p:vec3<f32>,a:f32)->vec3<f32>{
  let c=cos(a);let s=sin(a);return vec3<f32>(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);
}
@vertex fn vsMain(input:VSIn)->VSOut{
  var o:VSOut;
  let d=normalize(input.dir);
  let continents=fbm(d*2.7+u.timeRotationHeight.w)-0.49;
  let ridged=1.0-abs(fbm(d*8.0+31.0)*2.0-1.0);
  let h=(continents*0.78+max(continents,0.0)*ridged*0.62)*u.timeRotationHeight.z;
  let rd=rotateY(d,u.timeRotationHeight.y);
  let world=u.centerRadius.xyz+rd*(u.centerRadius.w+h);
  o.position=u.viewProj*vec4<f32>(world,1.0);
  o.normal=rd;o.worldPos=world;o.height=h;return o;
}
@fragment fn fsMain(i:VSOut)->@location(0) vec4<f32>{
  let n=normalize(i.normal);let l=normalize(u.sunDirExposure.xyz);let v=normalize(-i.worldPos);
  let ndl=max(dot(n,l),0.0);
  let hNorm=i.height/max(u.timeRotationHeight.z,1.0);
  var base:vec3<f32>;
  if(hNorm < -0.02){base=vec3<f32>(0.012,0.075,0.12);}
  else if(hNorm < 0.05){base=vec3<f32>(0.20,0.18,0.10);}
  else if(hNorm < 0.28){base=mix(vec3<f32>(0.07,0.14,0.08),vec3<f32>(0.24,0.22,0.17),hNorm*3.0);}
  else {base=mix(vec3<f32>(0.24,0.24,0.23),vec3<f32>(0.82,0.86,0.90),smoothstep(.35,.75,hNorm));}
  let ambient=0.035;
  let fres=pow(1.0-max(dot(n,v),0.0),4.0);
  let atmosphere=vec3<f32>(0.10,0.42,0.78)*fres*(0.3+ndl);
  let lit=base*(ambient+ndl*1.15)+atmosphere*0.32;
  return vec4<f32>(lit*u.sunDirExposure.w,1.0);
}

struct Uniforms {
  viewProj:mat4x4<f32>,
  centerRadius:vec4<f32>,
  timeRotationHeight:vec4<f32>,
  sunDirExposure:vec4<f32>,
  misc:vec4<f32>,
  renderParams:vec4<f32>
};
@group(0) @binding(0) var<uniform> u:Uniforms;
const GRID:f32=32.0;
const PI:f32=3.14159265359;

struct VSIn {
  @location(0) grid:vec4<f32>,
  @location(1) tile:vec4<f32>,
  @location(2) tileMeta:vec4<f32>,
  @location(3) sourceTile:vec4<f32>,
  @location(4) targetTile:vec4<f32>,
  @location(5) anchorCamera:vec4<f32>
};
struct VSOut {
  @builtin(position) @invariant position:vec4<f32>,
  @location(0) radial:vec3<f32>,
  @location(1) worldPos:vec3<f32>,
  @location(2) height:f32,
  @location(3) gridUV:vec2<f32>
};

fn cubePoint(face:f32,uv:vec2<f32>)->vec3<f32>{let f=i32(face+.5);let x=uv.x;let y=uv.y;if(f==0){return vec3<f32>(1,y,-x);}if(f==1){return vec3<f32>(-1,y,x);}if(f==2){return vec3<f32>(x,1,-y);}if(f==3){return vec3<f32>(x,-1,y);}if(f==4){return vec3<f32>(x,y,1);}return vec3<f32>(-x,y,-1);}
fn hash31(p:vec3<f32>)->f32{var q=fract(p*vec3<f32>(.1031,.11369,.13787));q+=vec3<f32>(dot(q,q.yzx+vec3<f32>(19.19)));return fract((q.x+q.y)*q.z);}
fn noise(p:vec3<f32>)->f32{let i=floor(p);let f=fract(p);let s=f*f*(3.0-2.0*f);let a=mix(hash31(i),hash31(i+vec3<f32>(1,0,0)),s.x);let b=mix(hash31(i+vec3<f32>(0,1,0)),hash31(i+vec3<f32>(1,1,0)),s.x);let c=mix(hash31(i+vec3<f32>(0,0,1)),hash31(i+vec3<f32>(1,0,1)),s.x);let d=mix(hash31(i+vec3<f32>(0,1,1)),hash31(i+vec3<f32>(1,1,1)),s.x);return mix(mix(a,b,s.y),mix(c,d,s.y),s.z);}
fn fbm(p0:vec3<f32>)->f32{var p=p0;var a=.52;var n=0.0;for(var i=0;i<7;i++){n+=noise(p)*a;p=p*2.03+vec3<f32>(13.1,7.7,19.3);a*=.5;}return n;}
fn terrain(d:vec3<f32>)->f32{let seed=vec3<f32>(u.timeRotationHeight.w);let c=fbm(d*2.7+seed)-.49;let r=1.0-abs(fbm(d*8.0+vec3<f32>(31))*2.0-1.0);let detail=(fbm(d*34.0+seed*.17)-.5)*.12;return (c*.78+max(c,0.0)*r*.62+detail*max(c,0.0))*u.timeRotationHeight.z;}
fn rawVertex(face:f32,uv:vec2<f32>)->vec4<f32>{let d=normalize(cubePoint(face,uv));let h=terrain(d);return vec4<f32>(d*(u.centerRadius.w+h),h);}
fn rotateY(p:vec3<f32>,a:f32)->vec3<f32>{let c=cos(a);let s=sin(a);return vec3<f32>(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);}
fn tileAnchorPlanet(tile:vec4<f32>)->vec3<f32>{let d=normalize(cubePoint(tile.x,tile.yz+vec2<f32>(tile.w*.5)));return d*u.centerRadius.w;}
fn toCameraRelative(planetPosition:vec3<f32>,input:VSIn)->vec3<f32>{let local=planetPosition-tileAnchorPlanet(input.tile);return input.anchorCamera.xyz+rotateY(local,u.timeRotationHeight.y);}
fn stitchAxis(mask:u32,g:vec2<f32>)->vec2<f32>{let ox=(u32(round(g.x))&1u)!=0u;let oy=(u32(round(g.y))&1u)!=0u;if(ox&&((g.y==0.0&&(mask&1u)!=0u)||(g.y==GRID&&(mask&4u)!=0u))){return vec2<f32>(1,0);}if(oy&&((g.x==GRID&&(mask&2u)!=0u)||(g.x==0.0&&(mask&8u)!=0u))){return vec2<f32>(0,1);}return vec2<f32>(0);}

fn stablePosition(input:VSIn)->vec4<f32>{
  let uv=input.tile.yz+input.grid.xy*input.tile.w;
  let axis=stitchAxis(u32(input.tileMeta.w),input.grid.xy*GRID);
  let count=select(1u,2u,any(axis!=vec2<f32>(0)));
  var planet=vec4<f32>(0);
  for(var i=0u;i<count;i++){var sampleUV=uv;if(count==2u){sampleUV+=axis*(input.tile.w/GRID)*select(-1.0,1.0,i==1u);}planet+=rawVertex(input.tile.x,sampleUV)/f32(count);}
  return vec4<f32>(toCameraRelative(planet.xyz,input),planet.w);
}
fn stitchedPosition(input:VSIn)->vec4<f32>{
  var samples:array<vec3<f32>,24>;var count=0u;
  let baseUV=input.tile.yz+input.grid.xy*input.tile.w;
  let unionAxis=stitchAxis(u32(input.tileMeta.w),input.grid.xy*GRID);
  let unionCount=select(1u,2u,any(unionAxis!=vec2<f32>(0)));
  let alpha=clamp(u.misc.w,0.0,1.0);let same=all(input.sourceTile==input.targetTile);
  for(var edge=0u;edge<unionCount;edge++){
    var uv=baseUV;if(unionCount==2u){uv+=unionAxis*input.tile.w/GRID*select(-1.0,1.0,edge==1u);}
    for(var endpoint=0u;endpoint<2u;endpoint++){
      var weight=select(1.0-alpha,alpha,endpoint==1u);if(same){weight=select(0.0,1.0,endpoint==1u);}if(weight==0.0){continue;}weight/=f32(unionCount);
      let t=select(input.sourceTile,input.targetTile,endpoint==1u);
      let g=clamp((uv-t.xy)/t.z*GRID,vec2<f32>(0),vec2<f32>(GRID));
      var coords:array<vec2<f32>,3>;var weights:array<f32,3>;var corners=1u;
      if(all(g==floor(g))){coords[0]=g;weights[0]=1.0;}else{corners=3u;let cell=min(floor(g),vec2<f32>(GRID-1.0));let f=g-cell;if(f.x+f.y<=1.0){coords[0]=cell;coords[1]=cell+vec2<f32>(1,0);coords[2]=cell+vec2<f32>(0,1);weights[0]=1.0-f.x-f.y;weights[1]=f.x;weights[2]=f.y;}else{coords[0]=cell+vec2<f32>(1,1);coords[1]=cell+vec2<f32>(0,1);coords[2]=cell+vec2<f32>(1,0);weights[0]=f.x+f.y-1.0;weights[1]=1.0-f.x;weights[2]=1.0-f.y;}}
      for(var corner=0u;corner<corners;corner++){if(weights[corner]==0.0){continue;}let axis=stitchAxis(u32(t.w),coords[corner]);let boundaryCount=select(1u,2u,any(axis!=vec2<f32>(0)));for(var boundary=0u;boundary<boundaryCount;boundary++){var coord=coords[corner];if(boundaryCount==2u){coord+=axis*select(-1.0,1.0,boundary==1u);}samples[count]=vec3<f32>(t.xy+coord*(t.z/GRID),weight*weights[corner]/f32(boundaryCount));count++;}}
    }
  }
  var planet=vec4<f32>(0);for(var i=0u;i<count;i++){planet+=rawVertex(input.tile.x,samples[i].xy)*samples[i].z;}
  return vec4<f32>(toCameraRelative(planet.xyz,input),planet.w);
}
@vertex fn vsMain(input:VSIn)->VSOut{
  var o:VSOut;var p:vec4<f32>;
  if(all(input.sourceTile==input.targetTile)&&all(input.targetTile.xyz==input.tile.yzw)&&input.targetTile.w==input.tileMeta.w){p=stablePosition(input);}else{p=stitchedPosition(input);}
  o.position=u.viewProj*vec4<f32>(p.xyz,1);o.radial=normalize(p.xyz-u.centerRadius.xyz);o.worldPos=p.xyz;o.height=p.w;o.gridUV=input.grid.xy;return o;
}

fn displacedNormal(i:VSOut)->vec3<f32>{let radial=normalize(i.radial);let dx=dpdx(i.worldPos);let dy=dpdy(i.worldPos);let c=cross(dx,dy);let l2=dot(c,c);if(l2<1e-10){return radial;}var n=c*inverseSqrt(l2);if(dot(n,radial)<0.0){n=-n;}return n;}
fn materialWeights(radial:vec3<f32>,n:vec3<f32>,h:f32)->vec4<f32>{
  let hn=h/max(u.timeRotationHeight.z,1.0);let slope=1.0-clamp(dot(n,radial),0.0,1.0);let lat=abs(radial.y);let seed=vec3<f32>(u.timeRotationHeight.w);
  let body=rotateY(radial,-u.timeRotationHeight.y);
  let macroField=noise(body*8.0+seed*.013);let regional=noise(body*37.0+seed*.071);
  let basin=(1.0-smoothstep(-.03,.07,hn))*(.8+ .2*macroField);
  let snow=smoothstep(.38,.7,hn+lat*.23+regional*.05)*(1.0-smoothstep(.18,.62,slope));
  let rock=clamp(smoothstep(.12,.58,slope)+smoothstep(.27,.62,hn)*.45,0.0,1.0)*(1.0-snow*.7);
  let soil=max(0.03,1.0-basin-snow-rock)*(.75+.25*macroField);
  let w=max(vec4<f32>(basin,soil,rock,snow),vec4<f32>(0));return w/max(dot(w,vec4<f32>(1)),1e-5);
}
fn materialBase(w:vec4<f32>,radial:vec3<f32>)->vec3<f32>{let variation=noise(radial*52.0+vec3<f32>(u.timeRotationHeight.w*.19));let basin=mix(vec3<f32>(.015,.055,.075),vec3<f32>(.035,.095,.115),variation);let soil=mix(vec3<f32>(.105,.095,.055),vec3<f32>(.20,.17,.085),variation);let rock=mix(vec3<f32>(.16,.15,.135),vec3<f32>(.32,.29,.25),variation);let snow=mix(vec3<f32>(.72,.76,.79),vec3<f32>(.94,.96,.98),variation);return basin*w.x+soil*w.y+rock*w.z+snow*w.w;}
fn materialRoughness(w:vec4<f32>)->f32{return dot(w,vec4<f32>(.34,.86,.62,.52));}
// Procedural detail is a height-field gradient, NOT a difference between pixels.
// Each octave is removed before the pixel footprint reaches half a lattice cell.
// Values are cell widths in metres and dimensionless surface-slope amplitudes.
fn surfaceBandWeight(cellsPerPixel:f32)->f32 {
  return 1.0-smoothstep(0.125,0.5,cellsPerPixel);
}
fn surfaceHash(cell:vec3<i32>)->f32 {
  var h=bitcast<u32>(cell.x)*0x8da6b343u;
  h^=bitcast<u32>(cell.y)*0xd8163841u;
  h^=bitcast<u32>(cell.z)*0xcb1ab31fu;
  h^=u32(u.timeRotationHeight.w)*0x27d4eb2du;
  h=(h^(h>>16u))*0x7feb352du;
  h=(h^(h>>15u))*0x846ca68bu;
  h^=h>>16u;
  return f32(h>>8u)*(1.0/16777216.0);
}
// Exact analytic gradient of quintic-interpolated lattice value noise.
fn surfaceNoiseGradient(p:vec3<f32>)->vec3<f32> {
  let cell=vec3<i32>(floor(p));
  let f=fract(p);
  let s=f*f*f*(f*(f*6.0-vec3<f32>(15.0))+vec3<f32>(10.0));
  let ds=30.0*f*f*(f-vec3<f32>(1.0))*(f-vec3<f32>(1.0));
  let h000=surfaceHash(cell);
  let h100=surfaceHash(cell+vec3<i32>(1,0,0));
  let h010=surfaceHash(cell+vec3<i32>(0,1,0));
  let h110=surfaceHash(cell+vec3<i32>(1,1,0));
  let h001=surfaceHash(cell+vec3<i32>(0,0,1));
  let h101=surfaceHash(cell+vec3<i32>(1,0,1));
  let h011=surfaceHash(cell+vec3<i32>(0,1,1));
  let h111=surfaceHash(cell+vec3<i32>(1,1,1));
  let a=mix(h000,h100,s.x);let b=mix(h010,h110,s.x);
  let c=mix(h001,h101,s.x);let d=mix(h011,h111,s.x);
  return ds*vec3<f32>(
    mix(mix(h100-h000,h110-h010,s.y),mix(h101-h001,h111-h011,s.y),s.z),
    mix(b-a,d-c,s.z),
    mix(c,d,s.y)-mix(a,b,s.y)
  );
}
fn surfaceDetailLayer(body:vec3<f32>,footprint:f32,cellMeters:f32,slope:f32)->vec3<f32> {
  let weight=surfaceBandWeight(footprint/cellMeters);
  if(weight<=0.0){return vec3<f32>(0.0);}
  return surfaceNoiseGradient(body*(u.centerRadius.w/cellMeters))*slope*weight;
}
fn detailNormal(n0:vec3<f32>,radial:vec3<f32>,rough:f32,i:VSOut)->vec3<f32> {
  // Derivatives estimate the footprint only; never differentiate undersampled noise.
  let dx=dpdx(radial);let dy=dpdy(radial);
  let footprint=u.centerRadius.w*sqrt(dot(dx,dx)+dot(dy,dy));
  let rotation=u.timeRotationHeight.y;
  let body=rotateY(radial,-rotation);
  let bodyNormal=rotateY(n0,-rotation);
  var gradient=surfaceDetailLayer(body,footprint,2048.0,0.08)
    +surfaceDetailLayer(body,footprint,256.0,0.06)
    +surfaceDetailLayer(body,footprint,32.0,0.035)
    +surfaceDetailLayer(body,footprint,4.0,0.02);
  // Smooth basin placeholders need less relief than exposed rock.
  let response=mix(0.05,1.0,smoothstep(0.4,0.65,rough));
  gradient=(gradient-bodyNormal*dot(gradient,bodyNormal))*response*clamp(u.renderParams.z,0.0,1.0);
  // Finite bounded slope: detail cannot turn a surface into glittering microfacets.
  gradient*=min(1.0,0.18/max(length(gradient),1e-8));
  return normalize(n0-rotateY(gradient,rotation));
}
fn pow5(x:f32)->f32{let x2=x*x;return x2*x2*x;}
fn fresnelSchlick(f0:vec3<f32>,VoH:f32)->vec3<f32>{return f0+(vec3<f32>(1)-f0)*pow5(1.0-VoH);}
fn distributionGGX(NoH:f32,a:f32)->f32{let a2=a*a;let d=NoH*NoH*(a2-1.0)+1.0;return a2/max(PI*d*d,1e-5);}
fn visibilitySmith(NoV:f32,NoL:f32,a:f32)->f32{let a2=a*a;let gv=NoL*sqrt(max(NoV*NoV*(1.0-a2)+a2,1e-5));let gl=NoV*sqrt(max(NoL*NoL*(1.0-a2)+a2,1e-5));return .5/max(gv+gl,1e-5);}
fn aces(x:vec3<f32>)->vec3<f32>{return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),vec3<f32>(0),vec3<f32>(1));}
fn linearToSrgb(x:vec3<f32>)->vec3<f32>{let lo=x*12.92;let hi=1.055*pow(max(x,vec3<f32>(0)),vec3<f32>(1.0/2.4))-.055;return select(hi,lo,x<=vec3<f32>(.0031308));}
@fragment fn fsMain(i:VSOut)->@location(0) vec4<f32>{
  let radial=normalize(i.radial);let geometric=displacedNormal(i);let weights=materialWeights(radial,geometric,i.height);let base=materialBase(weights,rotateY(radial,-u.timeRotationHeight.y));let rough=clamp(materialRoughness(weights),.18,.96);let n=detailNormal(geometric,radial,rough,i);
  let l=normalize(u.sunDirExposure.xyz);let v=normalize(-i.worldPos);let h=normalize(l+v);let NoL=max(dot(n,l),0.0);let NoV=max(dot(n,v),1e-4);let NoH=max(dot(n,h),0.0);let VoH=max(dot(v,h),0.0);
  let alpha=rough*rough;let f=fresnelSchlick(vec3<f32>(.04),VoH);let spec=distributionGGX(NoH,alpha)*visibilitySmith(NoV,NoL,alpha)*f;let diff=(vec3<f32>(1)-f)*base/PI;
  var hdr=(diff+spec)*NoL*u.sunDirExposure.w+base*.025;
  let rim=pow(1.0-max(dot(radial,v),0.0),4.0);hdr+=vec3<f32>(.055,.22,.48)*rim*(.08+.18*NoL);
  let debug=i32(round(u.renderParams.y));
  if(debug==1){return vec4<f32>(n*.5+.5,1);}
  if(debug==2){return vec4<f32>(vec3<f32>(rough),1);}
  if(debug==3){return vec4<f32>(weights.y,weights.z,weights.w,1);}
  if(debug==4){let hn=clamp(i.height/max(u.timeRotationHeight.z,1.0)*.5+.5,0.0,1.0);return vec4<f32>(hn,1.0-abs(hn-.5)*2.0,1.0-hn,1);}
  var color=linearToSrgb(aces(hdr*u.renderParams.x));
  if(u.misc.z>.5){let edge=min(min(i.gridUV.x,1.0-i.gridUV.x),min(i.gridUV.y,1.0-i.gridUV.y));let width=max(fwidth(i.gridUV.x),fwidth(i.gridUV.y))*1.3;let line=1.0-smoothstep(0.0,width,edge);color=mix(color,vec3<f32>(.25,.7,1),line*.8);}
  return vec4<f32>(color,1);
}

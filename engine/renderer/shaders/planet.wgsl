struct Uniforms { viewProj:mat4x4<f32>, centerRadius:vec4<f32>, timeRotationHeight:vec4<f32>, sunDirExposure:vec4<f32>, misc:vec4<f32> };
@group(0) @binding(0) var<uniform> u:Uniforms;
const GRID: f32 = 32.0;
struct VSIn { @location(0) grid:vec4<f32>, @location(1) tile:vec4<f32>, @location(2) tileMeta:vec4<f32>, @location(3) sourceTile:vec4<f32>, @location(4) targetTile:vec4<f32> };
struct VSOut { @builtin(position) @invariant position:vec4<f32>, @location(0) normal:vec3<f32>, @location(1) worldPos:vec3<f32>, @location(2) height:f32, @location(3) gridUV:vec2<f32> };
fn cubePoint(face:f32,uv:vec2<f32>)->vec3<f32>{let f=i32(face+.5);let x=uv.x;let y=uv.y;if(f==0){return vec3<f32>(1.0,y,-x);}if(f==1){return vec3<f32>(-1.0,y,x);}if(f==2){return vec3<f32>(x,1.0,-y);}if(f==3){return vec3<f32>(x,-1.0,y);}if(f==4){return vec3<f32>(x,y,1.0);}return vec3<f32>(-x,y,-1.0);}
fn hash31(p:vec3<f32>)->f32{var q=fract(p*vec3<f32>(0.1031,0.11369,0.13787));q+=vec3<f32>(dot(q,q.yzx+vec3<f32>(19.19)));return fract((q.x+q.y)*q.z);}
fn noise(p:vec3<f32>)->f32{let i=floor(p);let f=fract(p);let s=f*f*(3.0-2.0*f);let a=mix(hash31(i),hash31(i+vec3<f32>(1,0,0)),s.x);let b=mix(hash31(i+vec3<f32>(0,1,0)),hash31(i+vec3<f32>(1,1,0)),s.x);let c=mix(hash31(i+vec3<f32>(0,0,1)),hash31(i+vec3<f32>(1,0,1)),s.x);let d=mix(hash31(i+vec3<f32>(0,1,1)),hash31(i+vec3<f32>(1,1,1)),s.x);return mix(mix(a,b,s.y),mix(c,d,s.y),s.z);}
fn fbm(p0:vec3<f32>)->f32{var p=p0;var a=.52;var n=0.0;for(var i=0;i<7;i++){n+=noise(p)*a;p=p*2.03+vec3<f32>(13.1,7.7,19.3);a*=.5;}return n;}
fn terrain(d:vec3<f32>)->f32{let seed=vec3<f32>(u.timeRotationHeight.w);let c=fbm(d*2.7+seed)-.49;let r=1.0-abs(fbm(d*8.0+vec3<f32>(31.0))*2.0-1.0);let detail=(fbm(d*34.0+seed*.17)-.5)*.12;return (c*.78+max(c,0.0)*r*.62+detail*max(c,0.0))*u.timeRotationHeight.z;}
fn rawVertex(face:f32,uv:vec2<f32>)->vec4<f32>{let d=normalize(cubePoint(face,uv));let h=terrain(d);return vec4<f32>(d*(u.centerRadius.w+h),h);}
fn rotateY(p:vec3<f32>,a:f32)->vec3<f32>{let c=cos(a);let s=sin(a);return vec3<f32>(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);}
// Midpoints remain on displaced Cartesian chords, never re-normalized.
fn stitchAxis(mask:u32,g:vec2<f32>)->vec2<f32>{let ox=(u32(round(g.x))&1u)!=0u;let oy=(u32(round(g.y))&1u)!=0u;if(ox&&((g.y==0.0&&(mask&1u)!=0u)||(g.y==GRID&&(mask&4u)!=0u))){return vec2<f32>(1,0);}if(oy&&((g.x==GRID&&(mask&2u)!=0u)||(g.x==0.0&&(mask&8u)!=0u))){return vec2<f32>(0,1);}return vec2<f32>(0);}
// Unchanged grids bypass the general barycentric stencil completely.
fn stablePosition(input:VSIn)->vec4<f32>{
  let uv=input.tile.yz+input.grid.xy*input.tile.w;
  let axis=stitchAxis(u32(input.tileMeta.w),input.grid.xy*GRID);
  let count=select(1u,2u,any(axis!=vec2<f32>(0)));
  var result=vec4<f32>(0);
  for(var i=0u;i<count;i++){
    var sampleUV=uv;if(count==2u){sampleUV+=axis*(input.tile.w/GRID)*select(-1.0,1.0,i==1u);}
    let p=rawVertex(input.tile.x,sampleUV);
    result+=vec4<f32>(rotateY(p.xyz,u.timeRotationHeight.y)+u.centerRadius.xyz,p.w)/f32(count);
  }
  return result;
}
// Bound: union edge(2) * endpoint(2) * triangle(3) * source edge(2) = 24 samples.
// Terrain has one dynamic evaluation site in this general morph path.
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
      if(all(g==floor(g))){coords[0]=g;weights[0]=1.0;}
      else{
        corners=3u;let cell=min(floor(g),vec2<f32>(GRID-1.0));let f=g-cell;
        if(f.x+f.y<=1.0){coords[0]=cell;coords[1]=cell+vec2<f32>(1,0);coords[2]=cell+vec2<f32>(0,1);weights[0]=1.0-f.x-f.y;weights[1]=f.x;weights[2]=f.y;}
        else{coords[0]=cell+vec2<f32>(1,1);coords[1]=cell+vec2<f32>(0,1);coords[2]=cell+vec2<f32>(1,0);weights[0]=f.x+f.y-1.0;weights[1]=1.0-f.x;weights[2]=1.0-f.y;}
      }
      for(var corner=0u;corner<corners;corner++){
        if(weights[corner]==0.0){continue;}
        let axis=stitchAxis(u32(t.w),coords[corner]);let boundaryCount=select(1u,2u,any(axis!=vec2<f32>(0)));
        for(var boundary=0u;boundary<boundaryCount;boundary++){
          var coord=coords[corner];if(boundaryCount==2u){coord+=axis*select(-1.0,1.0,boundary==1u);}
          samples[count]=vec3<f32>(t.xy+coord*(t.z/GRID),weight*weights[corner]/f32(boundaryCount));count++;
        }
      }
    }
  }
  var result=vec4<f32>(0);
  for(var i=0u;i<count;i++){let p=rawVertex(input.tile.x,samples[i].xy);let relative=rotateY(p.xyz,u.timeRotationHeight.y)+u.centerRadius.xyz;result+=vec4<f32>(relative,p.w)*samples[i].z;}
  return result;
}
@vertex fn vsMain(input:VSIn)->VSOut{
  var o:VSOut;var p:vec4<f32>;
  if(all(input.sourceTile==input.targetTile)&&all(input.targetTile.xyz==input.tile.yzw)&&input.targetTile.w==input.tileMeta.w){p=stablePosition(input);}else{p=stitchedPosition(input);}
  o.position=u.viewProj*vec4<f32>(p.xyz,1);o.normal=normalize(p.xyz-u.centerRadius.xyz);o.worldPos=p.xyz;o.height=p.w;o.gridUV=input.grid.xy;return o;
}
@fragment fn fsMain(i:VSOut)->@location(0) vec4<f32>{
  let n=normalize(i.normal);let l=normalize(u.sunDirExposure.xyz);let v=normalize(-i.worldPos);let ndl=max(dot(n,l),0.0);let h=i.height/max(u.timeRotationHeight.z,1.0);var base:vec3<f32>;
  if(h < -.02){base=vec3<f32>(.008,.055,.105);}else if(h < .04){base=vec3<f32>(.23,.20,.11);}else if(h < .28){base=mix(vec3<f32>(.055,.135,.068),vec3<f32>(.25,.22,.17),clamp(h*3.0,0.0,1.0));}else{base=mix(vec3<f32>(.25,.24,.22),vec3<f32>(.84,.88,.92),smoothstep(.35,.78,h));}
  let fres=pow(1.0-max(dot(n,v),0.0),4.0);let atmosphere=vec3<f32>(.08,.40,.82)*fres*(.25+ndl);var color=(base*(.032+ndl*1.18)+atmosphere*.34)*u.sunDirExposure.w;
  if(u.misc.z > .5){let edge=min(min(i.gridUV.x,1.0-i.gridUV.x),min(i.gridUV.y,1.0-i.gridUV.y));let width=max(fwidth(i.gridUV.x),fwidth(i.gridUV.y))*1.3;let line=1.0-smoothstep(0.0,width,edge);color=mix(color,vec3<f32>(.25,.7,1),line*.8);}
  return vec4<f32>(color,1);
}

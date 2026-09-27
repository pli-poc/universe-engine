
const FACES=[
  (u,v)=>[1,v,-u],(u,v)=>[-1,v,u],
  (u,v)=>[u,1,-v],(u,v)=>[u,-1,v],
  (u,v)=>[u,v,1],(u,v)=>[-u,v,-1]
];
export function createCubeSphere(resolution=48){
  const verts=[],indices=[];
  for(let f=0;f<6;f++){
    const base=verts.length/3;
    for(let y=0;y<=resolution;y++)for(let x=0;x<=resolution;x++){
      const u=x/resolution*2-1,v=y/resolution*2-1;
      const p=FACES[f](u,v),l=Math.hypot(...p);
      verts.push(p[0]/l,p[1]/l,p[2]/l);
    }
    for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){
      const a=base+y*(resolution+1)+x,b=a+1,c=a+resolution+1,d=c+1;
      indices.push(a,c,b,b,c,d);
    }
  }
  return {vertices:new Float32Array(verts),indices:new Uint32Array(indices)};
}

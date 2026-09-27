export function createPatchGrid(resolution=32){
  const vertices=[],indices=[];
  const push=(u,v,skirt,edge)=>{vertices.push(u,v,skirt,edge);return vertices.length/4-1};

  for(let y=0;y<=resolution;y++)for(let x=0;x<=resolution;x++)push(x/resolution,y/resolution,0,-1);

  for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){
    const a=y*(resolution+1)+x,b=a+1,c=a+resolution+1,d=c+1;
    indices.push(a,c,b,b,c,d);
  }

  const addSkirt=(edgeId,sampler)=>{
    const top=[],bottom=[];
    for(let i=0;i<=resolution;i++){
      const [u,v]=sampler(i/resolution);
      top.push(push(u,v,0,edgeId));
      bottom.push(push(u,v,1,edgeId));
    }
    for(let i=0;i<resolution;i++){
      const a=top[i],b=top[i+1],c=bottom[i],d=bottom[i+1];
      indices.push(a,c,b,b,c,d);
    }
  };

  addSkirt(0,t=>[t,0]);
  addSkirt(1,t=>[1,t]);
  addSkirt(2,t=>[1-t,1]);
  addSkirt(3,t=>[0,1-t]);

  return {vertices:new Float32Array(vertices),indices:new Uint32Array(indices),resolution};
}

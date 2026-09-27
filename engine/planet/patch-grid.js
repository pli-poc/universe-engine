
export function createPatchGrid(resolution=32, skirtDepth=1){
  const vertices=[],indices=[];
  for(let y=0;y<=resolution;y++)for(let x=0;x<=resolution;x++){
    vertices.push(x/resolution,y/resolution,0);
  }
  for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){
    const a=y*(resolution+1)+x,b=a+1,c=a+resolution+1,d=c+1;
    indices.push(a,c,b,b,c,d);
  }
  const perimeter=[];
  for(let x=0;x<=resolution;x++)perimeter.push(x);
  for(let y=1;y<=resolution;y++)perimeter.push(y*(resolution+1)+resolution);
  for(let x=resolution-1;x>=0;x--)perimeter.push(resolution*(resolution+1)+x);
  for(let y=resolution-1;y>0;y--)perimeter.push(y*(resolution+1));
  const skirtBase=vertices.length/3;
  for(const i of perimeter){
    vertices.push(vertices[i*3],vertices[i*3+1],skirtDepth);
  }
  for(let i=0;i<perimeter.length;i++){
    const j=(i+1)%perimeter.length,a=perimeter[i],b=perimeter[j],sa=skirtBase+i,sb=skirtBase+j;
    indices.push(a,sa,b,b,sa,sb);
  }
  return {vertices:new Float32Array(vertices),indices:new Uint32Array(indices),resolution};
}

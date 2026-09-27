/** Surface-only reusable grid. Stitching replaces skirts and duplicate walls. */
export function createPatchGrid(resolution=32){
  if(!Number.isInteger(resolution)||resolution<2||resolution>256||(resolution&(resolution-1)))throw new RangeError('Patch resolution must be a power of two from 2 to 256');
  const vertices=[],indices=[];
  for(let y=0;y<=resolution;y++)for(let x=0;x<=resolution;x++)vertices.push(x/resolution,y/resolution,0,0);
  for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){
    const a=y*(resolution+1)+x,b=a+1,c=a+resolution+1,d=c+1;
    // All face bases have outward u cross v, hence consistent CCW winding.
    indices.push(a,b,c,b,d,c);
  }
  return {vertices:new Float32Array(vertices),indices:new Uint32Array(indices),resolution};
}

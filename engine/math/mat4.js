
export function perspective(fovY,aspect,near,far){
  const f=1/Math.tan(fovY/2),nf=1/(near-far);
  return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
}
export function viewRotation(yaw,pitch){
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  const right=[cy,0,-sy], up=[sy*sp,cp,cy*sp], forward=[sy*cp,-sp,cy*cp];
  return new Float32Array([right[0],up[0],forward[0],0, right[1],up[1],forward[1],0, right[2],up[2],forward[2],0, 0,0,0,1]);
}
export function mul(a,b){
  const o=new Float32Array(16);
  for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
  return o;
}

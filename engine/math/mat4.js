/** Right-handed WebGPU reverse-Z projection: near=1, far=0. */
export function perspective(fovY, aspect, near, far = Infinity) {
  if (!(fovY > 0 && fovY < Math.PI && aspect > 0 && near > 0 && far > near)) throw new RangeError('Invalid perspective parameters');
  const f = 1 / Math.tan(fovY / 2);
  const a = Number.isFinite(far) ? near / (far - near) : 0;
  const b = Number.isFinite(far) ? near * far / (far - near) : near;
  return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,a,-1, 0,0,b,0]);
}
export function viewRotation(yaw,pitch) {
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  return new Float32Array([cy,sy*sp,sy*cp,0, 0,cp,-sp,0, -sy,cy*sp,cy*cp,0, 0,0,0,1]);
}
export function mul(a,b) {
  const out=new Float32Array(16);
  for(let c=0;c<4;c++) for(let r=0;r<4;r++) out[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
  return out;
}

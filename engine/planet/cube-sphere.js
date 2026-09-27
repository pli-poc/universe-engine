
export function facePoint(face,u,v){
  switch(face){
    case 0:return [1,v,-u];
    case 1:return [-1,v,u];
    case 2:return [u,1,-v];
    case 3:return [u,-1,v];
    case 4:return [u,v,1];
    default:return [-u,v,-1];
  }
}
export function faceDirection(face,u,v){
  const p=facePoint(face,u,v),l=Math.hypot(p[0],p[1],p[2]);
  return [p[0]/l,p[1]/l,p[2]/l];
}

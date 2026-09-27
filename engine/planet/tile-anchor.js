import {faceDirection} from './cube-sphere.js';

export function tileAnchorPlanet(tile, planetRadius){
  const d=faceDirection(tile.face,tile.u0+tile.size*.5,tile.v0+tile.size*.5);
  return [d[0]*planetRadius,d[1]*planetRadius,d[2]*planetRadius];
}
export function tileAnchorCameraRelative(tile,planetRadius,rotation,planetCenterRelative){
  if(!tile||!(planetRadius>0)||!Number.isFinite(rotation)||planetCenterRelative.length!==3)throw new RangeError('Invalid tile anchor inputs');
  const p=tileAnchorPlanet(tile,planetRadius),c=Math.cos(rotation),s=Math.sin(rotation);
  const rotated=[c*p[0]+s*p[2],p[1],-s*p[0]+c*p[2]];
  return [
    planetCenterRelative[0]+rotated[0],
    planetCenterRelative[1]+rotated[1],
    planetCenterRelative[2]+rotated[2],
    0
  ];
}

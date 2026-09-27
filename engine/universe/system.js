
import {v3} from "../math/vec3.js";
import {ReferenceFrame} from "./reference-frame.js";
export const METERS_PER_AU=149_597_870_700;
export function createDemoSystem(){
  const universe=new ReferenceFrame({name:"Universe"});
  const system=new ReferenceFrame({name:"Astrava System",parent:universe});
  const planetOrbit=new ReferenceFrame({name:"Astra-1 Orbit",parent:system,origin:v3(METERS_PER_AU,0,0)});
  const siderealDay=86164;
  const planetFrame=new ReferenceFrame({name:"Astra-1 Rotating",parent:planetOrbit,rotationRate:(Math.PI*2)/siderealDay});
  return {
    star:{name:"Astrava",position:v3(0,0,0),radius:696_340_000},
    planet:{
      name:"Astra-1",radius:6_371_000,maxTerrainHeight:12_000,seed:1847,
      orbitFrame:planetOrbit,frame:planetFrame,
      universePosition(time){return planetOrbit.toUniverse(v3(),time)}
    }
  };
}

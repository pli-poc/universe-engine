
import {v3,add} from "../math/vec3.js";
export class ReferenceFrame{
  constructor({name,parent=null,origin=v3(),rotationRate=0,epoch=0}={}){
    this.name=name??"frame";this.parent=parent;this.origin=origin;this.rotationRate=rotationRate;this.epoch=epoch;
  }
  angleAt(time){return this.rotationRate*(time-this.epoch)}
  localToParent(local,time,out=v3()){
    const a=this.angleAt(time),c=Math.cos(a),s=Math.sin(a),x=local[0],z=local[2];
    out[0]=c*x+s*z+this.origin[0];out[1]=local[1]+this.origin[1];out[2]=-s*x+c*z+this.origin[2];return out;
  }
  toUniverse(local,time,out=v3()){
    const p=this.localToParent(local,time,v3());
    return this.parent?this.parent.toUniverse(p,time,out):(out.set(p),out);
  }
}

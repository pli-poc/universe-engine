
import {v3,add,scale} from "../math/vec3.js";
export class FreeCamera{
  constructor(position){this.position=position;this.yaw=0;this.pitch=0;this.keys=new Set();this.speed=1;this.pointerLocked=false}
  attach(canvas){
    canvas.tabIndex=0;
    canvas.addEventListener("click",()=>canvas.requestPointerLock?.());
    document.addEventListener("pointerlockchange",()=>this.pointerLocked=document.pointerLockElement===canvas);
    document.addEventListener("keydown",e=>this.keys.add(e.code));
    document.addEventListener("keyup",e=>this.keys.delete(e.code));
    document.addEventListener("mousemove",e=>{if(!this.pointerLocked)return;this.yaw-=e.movementX*.0018;this.pitch=Math.max(-1.54,Math.min(1.54,this.pitch-e.movementY*.0018));});
  }
  update(dt,altitude){
    const boost=this.keys.has("ShiftLeft")||this.keys.has("ShiftRight");
    const base=Math.max(20,Math.min(2_000_000,Math.max(altitude*.18,200)));
    this.speed=base*(boost?8:1);
    const cp=Math.cos(this.pitch),sp=Math.sin(this.pitch),cy=Math.cos(this.yaw),sy=Math.sin(this.yaw);
    const forward=v3(-sy*cp,sp,-cy*cp),right=v3(cy,0,-sy),up=v3(0,1,0);
    let move=v3();
    if(this.keys.has("KeyW"))add(move,forward,move);if(this.keys.has("KeyS"))add(move,scale(forward,-1),move);
    if(this.keys.has("KeyD"))add(move,right,move);if(this.keys.has("KeyA"))add(move,scale(right,-1),move);
    if(this.keys.has("KeyE"))add(move,up,move);if(this.keys.has("KeyQ"))add(move,scale(up,-1),move);
    const mag=Math.hypot(...move);if(mag>0)scale(move,this.speed*dt/mag,move),add(this.position,move,this.position);
  }
}

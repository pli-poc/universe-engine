
export const v3=(x=0,y=0,z=0)=>new Float64Array([x,y,z]);
export const add=(a,b,out=v3())=>{out[0]=a[0]+b[0];out[1]=a[1]+b[1];out[2]=a[2]+b[2];return out};
export const sub=(a,b,out=v3())=>{out[0]=a[0]-b[0];out[1]=a[1]-b[1];out[2]=a[2]-b[2];return out};
export const scale=(a,s,out=v3())=>{out[0]=a[0]*s;out[1]=a[1]*s;out[2]=a[2]*s;return out};
export const length=a=>Math.hypot(a[0],a[1],a[2]);
export const normalize=(a,out=v3())=>{const l=length(a)||1;return scale(a,1/l,out)};
export const cross=(a,b,out=v3())=>{const ax=a[0],ay=a[1],az=a[2],bx=b[0],by=b[1],bz=b[2];out[0]=ay*bz-az*by;out[1]=az*bx-ax*bz;out[2]=ax*by-ay*bx;return out};
export const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];

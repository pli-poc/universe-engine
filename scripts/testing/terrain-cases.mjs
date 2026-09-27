export const GROUPS = ['edges','corners-morphs','flight-budgets'];
/** Each group starts from its own initial orbit / 96-tile cut; no cross-job state. */
export function terrainCases(group) {
  if (!GROUPS.includes(group)) throw new Error(`Unknown terrain group: ${group}`);
  const cases=[];
  if(group==='corners-morphs') {
    cases.push({label:'morph',direction:[-1,.14,1],alphas:Array.from({length:11},(_,i)=>i/10)});
    for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])cases.push({label:`corner-${x}-${y}-${z}`,direction:[x,y,z]});
  }
  if(group==='edges') {
    let edge=0;
    for(const free of [0,1,2])for(const a of [-1,1])for(const b of [-1,1]) {
      const fixed=[0,1,2].filter(i=>i!==free);
      for(const side of [-1,1]) {const d=[0,0,0];d[free]=.13;d[fixed[0]]=a*(1+side*.025);d[fixed[1]]=b;cases.push({label:`edge-${edge}-${side}`,direction:d});}
      edge++;
    }
  }
  if(group==='flight-budgets') {
    [333000,100000,10000,100000,333000].forEach((altitude,i)=>cases.push({label:`flight-${i}`,direction:[-1,.14,1],altitude,alphas:[0,.5,1]}));
    for(const budget of [6,24,96])cases.push({label:`budget-${budget}`,direction:[-1,1,1],budget,alphas:[0,.5,1]});
  }
  return cases;
}

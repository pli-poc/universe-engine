import {cp,rm,mkdir} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});
for(const p of ['index.html','technology.html','worlds.html','media.html','about.html','docs','src','assets']) await cp(p,'dist/'+p,{recursive:true});
console.log('Astrava site built to dist/');

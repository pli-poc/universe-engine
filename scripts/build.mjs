import {cp,rm,mkdir} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});
for(const p of ['index.html','technology.html','worlds.html','media.html','about.html','demo.html','docs','src','assets','engine']) await cp(p,'dist/'+p,{recursive:true});
console.log('Astrava site + engine demo built to dist/');

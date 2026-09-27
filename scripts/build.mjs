import { cp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
let revision=process.env.GITHUB_SHA;
if(!revision){try{revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{revision='local-development';}}
if(!/^[a-zA-Z0-9-]+$/.test(revision))throw new Error('Invalid build revision');
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});
for(const path of ['index.html','technology.html','worlds.html','media.html','about.html','demo.html','docs','src','assets','engine'])await cp(path,'dist/'+path,{recursive:true});
const runtime=`runtime/${revision}/engine`;
await cp('engine',`dist/${runtime}`,{recursive:true});
await writeFile(`dist/${runtime}/build-info.js`,`export const BUILD_ID = ${JSON.stringify(revision)};\n`);
let html=await readFile('dist/demo.html','utf8');
html=html.replace('src="engine/boot.js"',`src="${runtime}/boot.js"`).replace('href="engine/demo.css"',`href="${runtime}/demo.css"`).replace('<b id="build-id">source</b>',`<b id="build-id">${revision.slice(0,12)}</b>`);
await writeFile('dist/demo.html',html);
await writeFile('dist/build-info.json',JSON.stringify({commit:revision,runtime,builtAt:new Date().toISOString()},null,2));
await writeFile('dist/.nojekyll','');
console.log(`Astrava build ${revision}: runtime imports and WGSL isolated under ${runtime}`);

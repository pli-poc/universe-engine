import {readdir,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
for(const path of ['index.html','technology.html','worlds.html','media.html','about.html','demo.html','docs/index.html','docs/planets.html','engine/main.js','engine/boot.js','engine/build-info.js','engine/renderer/shaders/planet.wgsl'])await stat(path);
async function validateDirectory(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const path=`${directory}/${entry.name}`;if(entry.isDirectory())await validateDirectory(path);else if(/\.m?js$/.test(entry.name)){const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr||`Syntax error: ${path}`);}}}
await validateDirectory('engine');await validateDirectory('scripts');
const tests=spawnSync(process.execPath,['--test','tests/engine.test.mjs'],{stdio:'inherit'});
if(tests.status!==0)throw new Error('Engine regression tests failed');
console.log('JS syntax and behavioral tests passed. WGSL/render validation runs in the browser CI step.');

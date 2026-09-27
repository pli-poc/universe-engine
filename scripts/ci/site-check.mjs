import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
const root=resolve('dist');let checked=0;
async function scan(dir) {
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    const path=resolve(dir,entry.name);
    if(entry.isDirectory())await scan(path);
    else if(/\.(html|js)$/.test(entry.name)) {
      const source=await readFile(path,'utf8');
      const regex=entry.name.endsWith('.html')?/\b(?:href|src)=["']([^"']+)["']/g:/(?:from\s+|import\s*)["'](\.[^"']+)["']/g;
      for(const [,link] of source.matchAll(regex)) {
        if(/^(?:[a-z]+:|\/\/|#)/i.test(link))continue;
        const bare=link.split(/[?#]/)[0];if(!bare)continue;
        const target=resolve(dirname(path),decodeURIComponent(bare));
        if(!target.startsWith(root+'/'))throw new Error(`Link escapes release: ${path} -> ${link}`);
        try {await stat(target);}catch{throw new Error(`Broken release link: ${path} -> ${link}`);}checked++;
      }
    }
  }
}
await scan(root);console.log('Static release links/imports verified:',checked);

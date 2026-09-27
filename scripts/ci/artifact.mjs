import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir, appendFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const manifestName='artifact-manifest.json';
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function inventory(root,prefix='') {
  const files={};
  for(const entry of (await readdir(resolve(root,prefix),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    const path=prefix+entry.name;
    if(entry.isSymbolicLink())throw new Error(`Symlinks not permitted in release: ${path}`);
    if(entry.isDirectory())Object.assign(files,await inventory(root,path+'/'));
    else if(entry.isFile()&&path!==manifestName)files[path]=digest(await readFile(resolve(root,path)));
  }
  return files;
}
export async function verifyTree(root,expectedManifest,expectedCommit) {
  const bytes=await readFile(resolve(root,manifestName));
  if(digest(bytes)!==expectedManifest)throw new Error('Manifest SHA256 mismatch');
  const manifest=JSON.parse(bytes);
  if(manifest.commit!==expectedCommit)throw new Error('Artifact commit mismatch');
  const actual=await inventory(root);
  if(JSON.stringify(Object.entries(actual).sort())!==JSON.stringify(Object.entries(manifest.files).sort()))throw new Error('Release file set or content hash mismatch');
  return manifest;
}
async function main() {
  if(process.argv[2]==='pack') {
    const info=JSON.parse(await readFile('dist/build-info.json','utf8'));
    const manifest=JSON.stringify({version:1,commit:info.commit,files:await inventory('dist')},null,2)+'\n';
    await writeFile('dist/'+manifestName,manifest);await mkdir('.ci',{recursive:true});
    execFileSync('tar',['-czf','.ci/site.tgz','-C','dist','.']);
    const values={archive_sha:digest(await readFile('.ci/site.tgz')),manifest_sha:digest(manifest),commit:info.commit};
    await writeFile('.ci/release.json',JSON.stringify(values,null,2));
    if(process.env.GITHUB_OUTPUT)for(const [key,value]of Object.entries(values))await appendFile(process.env.GITHUB_OUTPUT,`${key}=${value}\n`);
    console.log(JSON.stringify(values));
  } else if(process.argv[2]==='unpack') {
    const archive=process.argv[3]||'.ci/site.tgz';
    if(digest(await readFile(archive))!==process.env.ASTRAVA_ARCHIVE_SHA)throw new Error('Archive SHA256 mismatch');
    await rm('dist',{recursive:true,force:true});await mkdir('dist');
    execFileSync('tar',['-xzf',archive,'-C','dist']);
    await verifyTree('dist',process.env.ASTRAVA_MANIFEST_SHA,process.env.ASTRAVA_EXPECT_COMMIT);
    console.log('Verified exact tested artifact',process.env.ASTRAVA_EXPECT_COMMIT);
  } else throw new Error('Use artifact.mjs pack or unpack');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();

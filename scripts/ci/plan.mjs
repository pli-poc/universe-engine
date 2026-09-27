import { execFileSync } from 'node:child_process';
import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

/** Allow-list only. Unknown paths/baselines require the full suite. */
export function classify(files, { known=true, forceFull=false }={}) {
  const docs=p=>p==='README.md'||p==='LICENSE'||p==='.gitignore'||/^docs\/.+\.(html|md|png|svg|jpg|webp)$/.test(p);
  const presentation=p=>/^(index|technology|worlds|media|about|demo)\.html$/.test(p)||/^src\/(styles\.css|site\.js)$/.test(p)||/^assets\/.+\.(png|svg|jpg|webp)$/.test(p)||p==='engine/demo.css';
  const full=forceFull||!known||files.some(p=>!docs(p)&&!presentation(p));
  const smoke=full||files.some(p=>!docs(p));
  return {tier:full?'full':smoke?'smoke':'docs',smoke,full,reason:forceFull?'Full regression explicitly requested':!known?'Unknown baseline: fail closed':full?'Engine, tooling or unclassified changes':smoke?'Presentation/integration changes':'Documentation-only change',files};
}
export function assertGate(plan, results) {
  if(!['docs','smoke','full'].includes(plan.tier))throw new Error('Invalid validation plan');
  if(results.prepare!=='success')throw new Error('Build/fast tests did not succeed');
  for(const [job,required] of [['smoke',plan.tier!=='docs'],['terrain',plan.tier==='full']]) {
    if(required?results[job]!=='success':!['success','skipped'].includes(results[job]))throw new Error(`${job} gate not satisfied: ${results[job]}`);
  }
}
export async function makePlan() {
  const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
  const event=process.env.GITHUB_EVENT_PATH?JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8')):{};
  const head=git('rev-parse','HEAD');let base=null,known=false,files=[],note='';
  try {
    if(process.env.GITHUB_EVENT_NAME==='pull_request')base=git('merge-base',event.pull_request.base.sha,head);
    else if(process.env.GITHUB_REF==='refs/heads/main') {
      // Compare with what actually shipped, NOT push.before: skipped/failed pushes may contain engine changes.
      const url=new URL('build-info.json',process.env.ASTRAVA_PUBLISHED_URL||'https://pli-poc.github.io/universe-engine/');
      url.searchParams.set('ci',process.env.GITHUB_RUN_ID||Date.now());
      const response=await fetch(url,{signal:AbortSignal.timeout(10000),cache:'no-store'});
      if(!response.ok)throw new Error(`Published baseline HTTP ${response.status}`);
      base=(await response.json()).commit;
    } else if(process.env.ASTRAVA_BASE_COMMIT)base=process.env.ASTRAVA_BASE_COMMIT;
    if(!/^[0-9a-f]{40}$/.test(base||''))throw new Error('No trusted 40-character baseline');
    git('cat-file','-e',`${base}^{commit}`);git('merge-base','--is-ancestor',base,head);
    files=execFileSync('git',['diff','--no-renames','--name-only','-z',base,head],{encoding:'utf8'}).split('\0').filter(Boolean);
    known=true;
  }catch(error){note=error.message;base=null;}
  const plan={...classify(files,{known,forceFull:process.env.ASTRAVA_FORCE_FULL==='true'}),head,base,baselineNote:note};
  await mkdir('.ci',{recursive:true});await writeFile('.ci/plan.json',JSON.stringify(plan,null,2));
  if(process.env.GITHUB_OUTPUT)for(const key of ['tier','smoke','full'])await appendFile(process.env.GITHUB_OUTPUT,`${key}=${plan[key]}\n`);
  if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`## Validation plan\n\nTier: **${plan.tier}**. ${plan.reason}.\n\nHead: \`${head}\` · baseline: \`${base||'unknown'}\`.\n\nSee plan.json for the complete changed-file list.\n`);
  console.log(JSON.stringify(plan,null,2));return plan;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv[2]==='gate')assertGate({tier:process.env.ASTRAVA_TIER},JSON.parse(process.env.ASTRAVA_RESULTS));
  else await makePlan();
}

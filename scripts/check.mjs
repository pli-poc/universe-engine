import {readFile,stat} from 'node:fs/promises';
for(const p of ['index.html','technology.html','worlds.html','media.html','about.html','docs/index.html','docs/architecture.html','docs/rendering.html','docs/planets.html','docs/atmosphere.html','docs/streaming.html','docs/physics.html','docs/roadmap.html']) await stat(p);
const home=await readFile('index.html','utf8');if(!home.includes('site-header'))throw new Error('sticky header missing');console.log('Astrava structural checks passed.');

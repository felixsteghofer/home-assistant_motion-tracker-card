import {readFile,writeFile} from 'node:fs/promises';
const parts=await Promise.all(['core.js','card.js'].map(f=>readFile(new URL('../src/'+f,import.meta.url),'utf8')));
const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const body=parts.map(s=>s.replace(/^import .*?;\s*$/gm,'').replace(/^export /gm,'')).join('\n');
await writeFile(new URL('../motion-tracker-card.js',import.meta.url),`// Motion Tracker Card v${pkg.version}\n// Source: https://github.com/felixsteghofer/home-assistant_motion-tracker-card\n// MIT License. No runtime dependencies.\n(()=>{\n${body}\n})();\n`);
console.log('Built motion-tracker-card.js');

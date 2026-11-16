// usage: node tools/stills.mjs outDir f1 f2 f3 ... (renders stills of Loci at given frames, one bundle)
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs';
const [out, ...frames] = process.argv.slice(2);
fs.mkdirSync(out, {recursive: true});
const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts'), publicDir: path.resolve('public')});
const comp = await selectComposition({serveUrl, id: 'Loci'});
for (const f of frames) {
  await renderStill({composition: comp, serveUrl, frame: Number(f), output: path.join(out, `f${String(f).padStart(5, '0')}.png`), scale: 0.5, imageFormat: 'png'});
}
console.log('done');

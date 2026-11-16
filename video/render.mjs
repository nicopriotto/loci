// Renders every scene to ../docs/video/shots/<id>.mp4 (pass ids to render a subset).
import {execSync} from 'node:child_process';
const all = ['r-logo', 'r-1-problem', 'r-2-palace', 'r-3-spaced', 'r-4-turn', 'r-5d-later', 'r-6-end'];
const ids = process.argv.length > 2 ? process.argv.slice(2) : all;
for (const id of ids) {
  execSync(`npx remotion render src/index.ts ${id} ../docs/video/shots/${id}.mp4 --codec=h264 --crf=14`, {stdio: 'inherit'});
}

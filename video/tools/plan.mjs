// usage: node tools/plan.mjs [prefix]   (prefix = clip name prefix, default "v3"; use "v4" when the new footage exists)
// Prints, from vo.json + clip lengths, the narration window of every footage beat and the playback rate it implies.
import fs from 'node:fs';
import {execSync} from 'node:child_process';
const prefix = process.argv[2] || 'v3';
const vo = JSON.parse(fs.readFileSync('public/vo/vo.json', 'utf8'));
const clean = (s) => s.toLowerCase().replace(/[^a-z0-9']/g, '');
const secs = Object.fromEntries(vo.sections.map((s) => [s.id, s]));
const dur = (id) => { const i = vo.sections.findIndex((s) => s.id === id); const n = vo.sections[i + 1]; return (n ? n.start : vo.sections[i].end + 2.5) - vo.sections[i].start; };
const word = (id, w, n = 0) => secs[id].words.filter((x) => clean(x.w) === clean(w))[n]?.s - secs[id].start;
const clipLen = (name) => {
  for (const dir of ['public/clips', '../docs/video/shots']) {
    const f = `${dir}/${name}.mp4`;
    if (fs.existsSync(f)) return parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 ${f}`).toString());
  }
  return null;
};
const row = (label, win, src, note = '') => {
  const len = src == null ? null : src;
  const rate = len ? (len / win).toFixed(2) + 'x' : 'n/a (clip missing)';
  console.log(`${label.padEnd(26)} window ${win.toFixed(2).padStart(6)} s   clip ${len ? len.toFixed(2).padStart(6) : '   -  '} s   rate ${rate} ${note}`);
};
console.log(`vo total ${vo.duration}s; clip prefix "${prefix}"`);
for (const s of vo.sections) console.log(`  ${s.id.padEnd(8)} ${dur(s.id).toFixed(2)} s`);
console.log('\n-- VR (rate = clip seconds used / window) --');
row('cold  pan-open', dur('cold'), clipLen(`${prefix}-pan-open`));
row('enter fan (0-2.3 s)', dur('enter'), 2.3);
row('place card 1 (real time)', Math.min(dur('place') * 0.45, 3.2), 3.2);
row('place rest (ramp)', dur('place') - Math.min(dur('place') * 0.45, 3.2), 45.5 - 8.4, ' <- keep peak <= 6x; avg shown');
row('review', dur('review') - 1, null);
row('done', dur('done'), clipLen(`${prefix}-done`) && Math.min(clipLen(`${prefix}-done`), dur('done')));
row('close (to Stop)', word('close', 'Stop') / 1, clipLen(`${prefix}-pan-close`));
console.log('\n-- Studio (windows from word times) --');
const a = { notes: word('studio', 'notes'), prefer: word('studio', 'Prefer'), picture: word('studio', 'picture'), draws: word('studio', 'draws'), orUp: word('studio', 'or', 1), pick: word('studio', 'Pick') };
row('pdf (+loading kept)', a.prefer, clipLen(`${prefix}-s-pdf`));
row('type', a.picture - a.prefer, clipLen(`${prefix}-s-type`));
row('ai (5 images highlight)', a.orUp - a.picture, clipLen(`${prefix}-s-ai`), ' <- voice window for the AI beat; if rate > 2x ask for longer narration');
row('upload', a.pick - a.orUp, clipLen(`${prefix}-s-upload`));
row('room (3-4 rooms + Build)', dur('studio') - a.pick, clipLen(`${prefix}-s-room`));
const total = Object.values(a).length && dur('studio');
const sumClips = ['s-pdf', 's-type', 's-ai', 's-upload', 's-room'].map((n) => clipLen(`${prefix}-${n}`)).reduce((x, y) => x + (y || 0), 0);
console.log(`\nstudio section ${total.toFixed(1)} s vs sum of studio clips ${sumClips.toFixed(1)} s => overall speed-up ${(sumClips / total).toFixed(2)}x (aim <= 1.5x)`);

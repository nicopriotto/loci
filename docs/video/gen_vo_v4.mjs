// Voiceover v4: ElevenLabs eleven_v4, voice Chris, one request per sentence chained with request stitching
// (previous_request_ids = last 3), /with-timestamps for word timings. Same approach as the Vitrina take.
// Writes video/public/vo/vo.mp3 + vo.json (same format as gen_vo.py). Usage: node docs/video/gen_vo_v4.mjs
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const key = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').match(/^ELEVENLABS_API_KEY=(.*)$/m)[1].trim();
const VOICE = 'iP95p4xoKVk53GoZ742B'; // Chris
const FF = '/opt/homebrew/bin/ffmpeg';
const OUT = path.join(ROOT, 'video/public/vo'), TMP = path.join(OUT, 'parts4'); fs.mkdirSync(TMP, { recursive: true });
const SENT_GAP = 0.3, SEC_GAP = 0.4, PAD = 0.04;
const src = fs.readFileSync(path.join(ROOT, 'docs/video/SCRIPT.md'), 'utf8');
const secs = [...src.matchAll(/^## \d+\. (\w+) [^\n]*\n([\s\S]+?)(?=\n\n|(?![\s\S]))/gm)].map(m => ({ id: m[1], text: m[2].split(/\s+/).join(' ') }));
// lines: sentences; fragments under 3 words merge into the previous sentence
const lines = [];
for (const s of secs) {
  const parts = s.text.split(/(?<=[.?!])\s+/); const ls = [];
  for (const p of parts) (ls.length && p.split(' ').length < 3) ? (ls[ls.length - 1] += ' ' + p) : ls.push(p);
  ls.forEach((t, i) => lines.push({ sec: s.id, n: i, text: t }));
}
// spoken form: LOCI is said "LOH-kee", captions keep LOCI
const SAY = (x) => x.replace(/LOCI/g, 'Lokee');
const ids = []; let stale = false;
for (const [i, l] of lines.entries()) {
  const f = path.join(TMP, `${i}`);
  const cached = fs.existsSync(f + '.json') ? JSON.parse(fs.readFileSync(f + '.json', 'utf8')) : null;
  if (!cached || cached.text !== SAY(l.text)) stale = true; // once a line changes, regenerate all following lines (stitching continuity)
  if (stale) {
    const body = { text: SAY(l.text), model_id: 'eleven_v4', seed: 4417, previous_request_ids: ids.slice(-3), voice_settings: { stability: 0.5, similarity_boost: 0.75 } };
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/with-timestamps`, { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) { console.error('ElevenLabs error', i, res.status, (await res.text()).slice(0, 400)); process.exit(1); }
    const d = await res.json();
    fs.writeFileSync(f + '.mp3', Buffer.from(d.audio_base64, 'base64'));
    fs.writeFileSync(f + '.json', JSON.stringify({ text: SAY(l.text), rid: res.headers.get('request-id'), al: d.alignment || d.normalized_alignment }));
    console.log('tts', i, l.sec, l.text.slice(0, 40));
  }
  ids.push(JSON.parse(fs.readFileSync(f + '.json', 'utf8')).rid);
}
// trim, concat with gaps, word timings
const run = (...a) => { const r = spawnSync(FF, ['-nostdin', '-y', '-loglevel', 'error', ...a]); if (r.status) throw new Error(r.stderr + ''); };
const gap = (d) => { const p = path.join(TMP, `gap${d}.wav`); run('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', String(d), p); return p; };
const gS = gap(SENT_GAP), gC = gap(SEC_GAP);
let t = 0; const list = []; const sections = secs.map(s => ({ id: s.id, text: s.text, start: 0, end: 0, words: [] }));
for (const [i, l] of lines.entries()) {
  const { al } = JSON.parse(fs.readFileSync(path.join(TMP, `${i}.json`), 'utf8'));
  const ch = al.characters, st = al.character_start_times_seconds, en = al.character_end_times_seconds, full = ch.join('');
  const a0 = Math.max(0, st[0] - PAD), a1 = en[en.length - 1] + PAD + 0.03;
  run('-i', path.join(TMP, `${i}.mp3`), '-ss', a0.toFixed(3), '-to', a1.toFixed(3), '-ar', '44100', '-ac', '1', path.join(TMP, `${i}.wav`));
  const sec = sections.find(s => s.id === l.sec); let pos = 0;
  for (const w of l.text.split(' ')) {
    const sw = SAY(w); const k = full.indexOf(sw, pos); if (k < 0) { console.log('miss', l.sec, w); continue; }
    sec.words.push({ w, s: +(t + st[k] - a0).toFixed(3), e: +(t + en[k + sw.length - 1] - a0).toFixed(3) }); pos = k + sw.length;
  }
  list.push(`file '${path.join(TMP, i + '.wav')}'`);
  t += +spawnSync('/opt/homebrew/bin/ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(TMP, i + '.wav')]).stdout.toString().trim(); // real clip length (alignment end can exceed audio)
  const last = i + 1 === lines.length;
  if (!last) { const sameSec = lines[i + 1].sec === l.sec; list.push(`file '${sameSec ? gS : gC}'`); t += sameSec ? SENT_GAP : SEC_GAP; }
}
for (const s of sections) { s.start = s.words[0].s; s.end = s.words.at(-1).e; }
fs.writeFileSync(path.join(TMP, 'list.txt'), list.join('\n'));
run('-f', 'concat', '-safe', '0', '-i', path.join(TMP, 'list.txt'), '-ar', '44100', '-ac', '1', path.join(TMP, 'all.wav'));
// gentle compressor + loudness normalisation (length unchanged)
run('-i', path.join(TMP, 'all.wav'), '-af', 'acompressor=threshold=-20dB:ratio=2.5:attack=15:release=150:makeup=2,loudnorm=I=-16:TP=-1.5:LRA=9', '-ar', '44100', '-b:a', '192k', path.join(OUT, 'vo.mp3'));
const probe = spawnSync('/opt/homebrew/bin/ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(OUT, 'vo.mp3')]).stdout.toString().trim();
const duration = +t.toFixed(3);
fs.writeFileSync(path.join(OUT, 'vo.json'), JSON.stringify({ duration, sections }, null, 1));
const nw = sections.reduce((n, s) => n + s.words.length, 0);
const long = sections.flatMap(s => s.words.slice(1).map((b, j) => [s.id, s.words[j].w, +(b.s - s.words[j].e).toFixed(2)])).filter(x => x[2] > 0.25);
console.log('lines', lines.length, 'duration', duration, 'ffprobe', probe, 'words', nw, 'wpm', Math.round(nw / duration * 60));
for (const s of sections) console.log(s.id.padEnd(8), s.start.toFixed(2), s.end.toFixed(2), s.words.length + 'w');
console.log('gaps >0.25s inside sections:', JSON.stringify(long));

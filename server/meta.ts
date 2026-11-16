/**
 * Server-side Meta Model API calls (OpenAI-compatible). Shared by the Vercel functions in /api
 * and the dev middleware in vite.config.ts. META_API_KEY is read here, on the server, only.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const BASE = 'https://api.meta.ai/v1';
const IMAGE_MODEL = 'muse-image-1.0';
const TEXT_MODEL = 'muse-spark-1.3';
const DECK_STYLE = 'flat pastel illustration, thin ink outlines, warm paper background, single subject, no text';
/** Hard cap on live calls recorded in ai-usage.log (images and concepts together). */
const MAX_LIVE_CALLS = Number(process.env.AI_MAX_CALLS || 150);

const root = process.cwd();
const LOG = join(root, 'ai-usage.log');
const CACHE = join(root, '.cache', 'ai');

export interface Result { status: number; json: unknown }

function key(): string | undefined {
  return process.env.META_API_KEY;
}

function liveCalls(): number {
  try {
    return readFileSync(LOG, 'utf8').split('\n').filter((l) => / muse-/.test(l)).length;
  } catch {
    return 0;
  }
}

function logCall(model: string, note: string) {
  try {
    appendFileSync(LOG, `${new Date().toISOString().replace(/\.\d+Z$/, 'Z')} ${model} ${note.replace(/\s+/g, ' ').slice(0, 60)}\n`);
  } catch { /* read-only filesystem on serverless: skip */ }
}

function cacheGet(h: string): unknown | undefined {
  try {
    const f = join(CACHE, h + '.json');
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : undefined;
  } catch { return undefined; }
}

function cachePut(h: string, v: unknown) {
  try {
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(join(CACHE, h + '.json'), JSON.stringify(v));
  } catch { /* ignore */ }
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 24);

export async function handleImage(body: any): Promise<Result> {
  const prompt = String(body?.prompt ?? '').trim().slice(0, 400);
  const style = String(body?.style ?? '').trim().slice(0, 300);
  if (!prompt) return { status: 400, json: { error: 'prompt required' } };
  const full = `${prompt}. Style: ${style ? style + ', ' : ''}${DECK_STYLE}`;
  const h = hash(IMAGE_MODEL + full);
  const hit = cacheGet(h);
  if (hit) return { status: 200, json: hit };
  if (!key()) return { status: 503, json: { error: 'no key configured' } };
  if (liveCalls() >= MAX_LIVE_CALLS) return { status: 429, json: { error: 'call cap reached' } };
  logCall(IMAGE_MODEL, prompt);
  const r = await fetch(`${BASE}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key()}` },
    body: JSON.stringify({ model: IMAGE_MODEL, prompt: full, n: 1, size: '1024x1024' }),
  });
  if (!r.ok) return { status: 502, json: { error: `upstream ${r.status}` } };
  const data: any = await r.json();
  const b64: string | undefined = data?.data?.[0]?.b64_json;
  if (!b64) return { status: 502, json: { error: 'no image' } };
  const jpg = await sharp(Buffer.from(b64, 'base64')).resize(512, 512, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer();
  const out = { image: 'data:image/jpeg;base64,' + jpg.toString('base64') };
  cachePut(h, out);
  return { status: 200, json: out };
}

const CONCEPT_SYS =
  'You turn study notes into memory-palace cards. Reply with JSON only: {"title": string, "concepts": [{"title": string (max 5 words), "explanation": string (one sentence), "imagePrompt": string (an absurd, memorable single-subject scene that stands for the concept)}]}. 3 to 10 concepts, in the order of the text.';

export async function handleConcepts(body: any): Promise<Result> {
  const text = String(body?.text ?? '').trim().slice(0, 12000);
  if (!text) return { status: 400, json: { error: 'text required' } };
  const h = hash(TEXT_MODEL + text);
  const hit = cacheGet(h);
  if (hit) return { status: 200, json: hit };
  if (!key()) return { status: 503, json: { error: 'no key configured' } };
  if (liveCalls() >= MAX_LIVE_CALLS) return { status: 429, json: { error: 'call cap reached' } };
  logCall(TEXT_MODEL, 'concepts ' + text);
  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key()}` },
    body: JSON.stringify({
      model: TEXT_MODEL,
      messages: [{ role: 'system', content: CONCEPT_SYS }, { role: 'user', content: text }],
      temperature: 0.4,
    }),
  });
  if (!r.ok) return { status: 502, json: { error: `upstream ${r.status}` } };
  const data: any = await r.json();
  const raw: string = data?.choices?.[0]?.message?.content ?? '';
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return { status: 502, json: { error: 'bad reply' } };
  let parsed: any;
  try { parsed = JSON.parse(m[0]); } catch { return { status: 502, json: { error: 'bad json' } }; }
  const concepts = (Array.isArray(parsed.concepts) ? parsed.concepts : [])
    .slice(0, 10)
    .map((c: any) => ({ title: String(c.title ?? '').slice(0, 56), explanation: String(c.explanation ?? '').slice(0, 180), prompt: String(c.imagePrompt ?? '').slice(0, 300) }))
    .filter((c: any) => c.title);
  if (concepts.length < 2) return { status: 502, json: { error: 'too few concepts' } };
  const out = { title: String(parsed.title ?? '').slice(0, 56), concepts };
  cachePut(h, out);
  return { status: 200, json: out };
}

/** Minimal Node (req, res) adapter used by the Vercel functions and the dev middleware. */
export function nodeHandler(fn: (b: any) => Promise<Result>) {
  return async (req: any, res: any) => {
    const send = (s: number, j: unknown) => { res.statusCode = s; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(j)); };
    if (req.method !== 'POST') return send(405, { error: 'POST only' });
    try {
      let body = req.body;
      if (body === undefined) {
        const chunks: Buffer[] = [];
        let n = 0;
        for await (const c of req) { n += c.length; if (n > 64_000) return send(413, { error: 'too large' }); chunks.push(c); }
        body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      } else if (typeof body === 'string') body = JSON.parse(body);
      const r = await fn(body);
      send(r.status, r.json);
    } catch {
      send(500, { error: 'server error' });
    }
  };
}

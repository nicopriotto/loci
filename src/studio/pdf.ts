import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfLine {
  text: string;
  /** Position on page 1 as fractions of the page box (top-left origin). */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PdfRead {
  /** Line-oriented text; headings are prefixed with "# ", paragraph gaps are blank lines. */
  text: string;
  thumb: HTMLCanvasElement;
  /** Lines of page 1 for the reading animation. */
  lines: PdfLine[];
  pages: number;
  /** The document title when one can be told apart (metadata or a lone, larger first line); otherwise ''. */
  title: string;
}

interface Raw { str: string; x: number; y: number; w: number; h: number }
interface Row { text: string; size: number; gap: boolean }

const MAX_PAGES = 12;
/** Enough heading-like lines are already in hand: stop reading, the concept list is capped anyway. */
const ENOUGH = 12;

const medianSize = (pages: Row[][]): number => {
  const sizes = pages.flat().map((l) => l.size).sort((a, b) => a - b);
  return sizes[Math.floor(sizes.length / 2)] || 12;
};
const isHeading = (l: Row, body: number) => l.size >= body * 1.22 && l.text.length <= 70 && !/[.!?]$/.test(l.text);
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();

export async function readPdf(file: File, thumbWidth = 360, onProgress?: (page: number, total: number) => void): Promise<PdfRead> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: Row[][] = [];
  let thumb = document.createElement('canvas');
  let lines1: PdfLine[] = [];
  const total = Math.min(doc.numPages, MAX_PAGES);

  for (let p = 1; p <= total; p++) {
    onProgress?.(p, total);
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const raws: Raw[] = [];
    for (const it of tc.items as any[]) {
      if (!it.str || !it.str.trim()) continue;
      raws.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.height || it.transform[3]) });
    }
    raws.sort((a, b) => b.y - a.y || a.x - b.x);
    const rows: Raw[][] = [];
    for (const r of raws) {
      const row = rows[rows.length - 1];
      if (row && Math.abs(row[0].y - r.y) < Math.max(2, r.h * 0.4)) row.push(r);
      else rows.push([r]);
    }
    const out: Row[] = [];
    const geo: PdfLine[] = [];
    let prevY: number | null = null;
    let prevSize = 0;
    for (const row of rows) {
      row.sort((a, b) => a.x - b.x);
      const text = row.map((r) => r.str).join(' ').replace(/\s+/g, ' ').trim();
      const size = Math.max(...row.map((r) => r.h));
      const y = row[0].y;
      const gap = prevY !== null && prevY - y > Math.max(size, prevSize) * 1.9;
      prevY = y;
      prevSize = size;
      const x0 = row[0].x;
      const last = row[row.length - 1];
      out.push({ text, size, gap });
      geo.push({ text, x: x0 / vp.width, y: 1 - (y + size) / vp.height, w: (last.x + last.w - x0) / vp.width, h: size / vp.height });
    }
    pages.push(out);
    if (p === 1) {
      lines1 = geo;
      const scale = (thumbWidth * Math.min(2, window.devicePixelRatio || 1)) / vp.width;
      const v = page.getViewport({ scale });
      thumb = document.createElement('canvas');
      thumb.width = Math.floor(v.width);
      thumb.height = Math.floor(v.height);
      await page.render({ canvasContext: thumb.getContext('2d')!, viewport: v, canvas: thumb } as any).promise;
    }
    if (p >= 2) {
      const body = medianSize(pages);
      if (pages.flat().filter((l) => isHeading(l, body) || /^\s*(?:[-*•·▪–]|\d+[.)])\s/.test(l.text)).length >= ENOUGH) break;
    }
  }

  const body = medianSize(pages);
  const text: string[] = [];
  for (const page of pages) {
    for (const l of page) {
      if (l.gap) text.push('');
      text.push(isHeading(l, body) ? `# ${l.text}` : l.text);
    }
    text.push('');
  }

  // Document title: the metadata title if it shows up on page 1, else a lone first-page line clearly larger than the rest.
  let title = '';
  const first = pages[0] ?? [];
  let meta = '';
  try {
    meta = String(((await doc.getMetadata()).info as any)?.Title ?? '').trim();
  } catch {
    /* no metadata */
  }
  if (meta && first.slice(0, 4).some((l) => norm(l.text) === norm(meta) || norm(meta).startsWith(norm(l.text)))) title = meta;
  else if (first.length > 2) {
    const max = Math.max(...first.map((l) => l.size));
    const top = first.filter((l) => l.size >= max * 0.95);
    const idx = first.indexOf(top[0]);
    if (top.length === 1 && idx < 3 && max >= body * 1.3 && first[idx].text.length <= 80) title = first[idx].text;
  }
  return { text: text.join('\n'), thumb, lines: lines1, pages: doc.numPages, title };
}

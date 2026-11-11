import './studio.css';
import { STYLE_SUFFIX, buildPrompt, extractConcepts, generateImage, parseList } from '../ai.js';
import { type Concept, deckInfo, deleteDeck, loadDeck, resolveImage, saveDeck, setPendingDeck } from '../deck.js';
import { type Setting, createPalace, deletePalace, dueCount, listPalaces, setActivePalace } from '../palaces.js';
import { ROOM_IDS } from '../envs/rooms.js';
import { SETTING_INFO, settingArt } from './doodles.js';
import { fileToSquareJpeg } from './image.js';
import type { PdfRead } from './pdf.js';
import castleRaw from '../../public/doodles/castle.svg?raw';
import flagRaw from '../../public/doodles/flag.svg?raw';

function doodle(raw: string, cls = ''): HTMLElement {
  const d = document.createElement('div');
  d.className = 'st-doodle ' + cls;
  d.innerHTML = raw;
  return d;
}

/** Make a doodle draw itself, stroke by stroke. */
function drawIn(el: HTMLElement, duration = 2400, delay = 0) {
  const paths = Array.from(el.querySelectorAll<SVGPathElement>('path'));
  el.classList.add('st-draw');
  paths.forEach((p, i) => {
    p.setAttribute('pathLength', '1');
    p.style.strokeDasharray = '1';
    p.style.strokeDashoffset = '1';
    p.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
      duration: (duration * 2) / paths.length + 200,
      delay: delay + (i / paths.length) * duration * 0.8,
      easing: 'ease-in-out',
      fill: 'forwards',
    });
  });
}

/* ------------------------------------------------------------------ state */

interface Item {
  id: string;
  title: string;
  explanation: string;
  prompt: string;
  /** Optional picture description typed on the Images step; wins over the generated prompt. */
  desc?: string;
  image: string;
  cutout?: string;
  busy: boolean;
}

type Mode = 'live' | 'review' | 'images';
type Screen = 'palaces' | 'start' | 'list' | 'reading' | 'concepts' | 'images' | 'setting';

const MIN = 3;
const MAX = 12;
const PRESETS = ['crazy animals', 'famous landmarks', 'retro toys', 'space'];
const EXAMPLE = [
  'Nucleus: control center that stores DNA',
  'Mitochondria: powerhouse that makes ATP energy',
  'Ribosome - tiny factory that builds proteins',
  'Golgi apparatus: sorts and ships proteins',
  'Lysosome - the cell recycling crew',
].join('\n');

const S = {
  items: [] as Item[],
  deckTitle: 'My palace',
  source: 'My notes',
  styleText: '',
  demo: false,
  dirty: false,
  listText: '',
  setting: 'home' as Setting,
  palaceName: '',
};

let uid = 0;
const newId = () => `i${++uid}`;

/* ---------------------------------------------------------------- helpers */

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  html = '',
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const fullStyle = () => (S.styleText.trim() ? `${S.styleText.trim()}, ${STYLE_SUFFIX}` : STYLE_SUFFIX);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function fromDraft(d: { title: string; explanation: string; prompt: string }): Item {
  return { id: newId(), ...d, image: '', busy: false };
}

function touch() {
  S.dirty = true;
  saveDraft();
}

/* A refresh mid-flow should not lose work: the draft lives in sessionStorage (so it never competes with palaces for quota). */
const DRAFT = 'loci.studio.draft';
let draftScreen: Screen | '' = '';
let draftTimer = 0;
function saveDraft() {
  window.clearTimeout(draftTimer);
  draftTimer = window.setTimeout(() => {
    try {
      if (!draftScreen || !S.items.length) return sessionStorage.removeItem(DRAFT);
      const { items, deckTitle, source, styleText, setting, palaceName } = S;
      sessionStorage.setItem(DRAFT, JSON.stringify({ screen: draftScreen, items: items.map(({ busy, ...i }) => i), deckTitle, source, styleText, setting, palaceName }));
    } catch {
      /* storage unavailable or full: the flow still works, it just will not survive a refresh */
    }
  }, 250);
}
function clearDraft() {
  window.clearTimeout(draftTimer);
  draftScreen = '';
  try { sessionStorage.removeItem(DRAFT); } catch { /* ignore */ }
}
function loadDraft(): Screen | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT) || 'null');
    if (!d || !Array.isArray(d.items) || !d.items.length) return null;
    S.items = d.items.map((i: Item) => ({ ...i, id: newId(), busy: false }));
    Object.assign(S, { deckTitle: d.deckTitle, source: d.source, styleText: d.styleText ?? '', setting: d.setting ?? 'home', palaceName: d.palaceName ?? '' });
    return d.screen === 'images' || d.screen === 'setting' ? d.screen : 'concepts';
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------- the mount */

export function mountStudio() {
  const q = new URLSearchParams(location.search);
  if (q.get('skipStudio') === '1' || q.get('demo') === '1') return;
  if (document.getElementById('loci-studio')) return;

  const root = h('div');
  root.id = 'loci-studio';
  root.innerHTML = `<div class="st-bg"></div><div class="st-grain"></div>
    <div class="st-shell">
      <header class="st-head"><div class="st-mark"><span class="st-logo"></span>Loci</div>
        <nav class="st-steps" aria-label="Steps">
          <button class="st-step" data-s="0" aria-label="Source"><i></i><span>Source</span></button>
          <button class="st-step" data-s="1" aria-label="Concepts"><i></i><span>Concepts</span></button>
          <button class="st-step" data-s="2" aria-label="Images"><i></i><span>Images</span></button>
          <button class="st-step" data-s="3" aria-label="Setting"><i></i><span>Setting</span></button>
        </nav></header>
      <main class="st-stage"></main>
    </div><div class="st-toast" role="status" aria-live="polite"></div>`;
  document.body.appendChild(root);
  root.querySelector('.st-logo')!.replaceWith(doodle(castleRaw));
  root.querySelectorAll('.st-step i').forEach((i) => i.replaceWith(doodle(flagRaw)));
  const stage = root.querySelector('.st-stage') as HTMLElement;
  const toastEl = root.querySelector('.st-toast') as HTMLElement;
  let screen: Screen = 'palaces';
  let busyAll = false;

  // Never let a stray drop navigate the page away from the Studio.
  window.addEventListener('dragover', (e) => root.isConnected && e.preventDefault());
  window.addEventListener('drop', (e) => root.isConnected && e.preventDefault());

  /* ------------------------------------------------------------- chrome */

  let toastTimer = 0;
  function toast(msg: string) {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('on'), 3600);
  }

  function setStep(n: number) {
    root.querySelectorAll<HTMLButtonElement>('.st-step').forEach((s) => {
      const i = Number(s.dataset.s);
      s.classList.toggle('on', i === n);
      s.classList.toggle('done', i < n);
      if (i === n) s.setAttribute('aria-current', 'step'); else s.removeAttribute('aria-current');
      // Only steps you already passed are clickable, so nothing can be skipped.
      s.disabled = !(i < n) || busyAll || screen === 'reading';
    });
  }
  root.querySelectorAll<HTMLElement>('.st-step').forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.s);
    if (i === 0) void (S.source === 'My notes' || !S.items.length ? showList() : showStart());
    else if (i === 1) void showConcepts();
    else if (i === 2) void showImages();
  }));

  async function go(name: Screen, build: () => HTMLElement): Promise<HTMLElement> {
    const old = stage.firstElementChild as HTMLElement | null;
    if (old) {
      await old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-14px) scale(0.99)' }], { duration: 160, easing: 'ease-in' }).finished.catch(() => {});
      old.remove();
    }
    screen = name;
    draftScreen = name === 'concepts' || name === 'images' || name === 'setting' ? name : '';
    saveDraft();
    setStep(name === 'concepts' ? 1 : name === 'images' ? 2 : name === 'setting' ? 3 : 0);
    root.classList.toggle('st-home', name === 'palaces');
    root.scrollTo({ top: 0 });
    const el = build();
    stage.appendChild(el);
    el.animate([{ opacity: 0, transform: 'translateY(26px)' }, { opacity: 1, transform: 'none' }], { duration: 560, easing: 'cubic-bezier(0.2,1,0.3,1)' });
    return el;
  }

  /* --------------------------------------------------------- card + grid */

  /** Move one concept next to another (used by pointer drag). */
  function reorderTo(dragId: string, overId: string, after: boolean) {
    const from = S.items.findIndex((i) => i.id === dragId);
    if (from < 0) return;
    const [moved] = S.items.splice(from, 1);
    let to = S.items.findIndex((i) => i.id === overId);
    if (to < 0) { S.items.splice(from, 0, moved); return; }
    if (after) to++;
    S.items.splice(to, 0, moved);
    if (to !== from) { touch(); refresh(); }
  }

  function makeCard(mode: Mode, enter: boolean): HTMLElement {
    const c = h('article', 'st-card' + (enter ? ' enter' : ''));
    const editable = mode !== 'live';
    c.innerHTML = `
      <div class="st-tools">
        <div class="grp">${editable && mode === 'review' ? '<button class="st-tool grip" title="Drag to reorder" aria-label="Drag to reorder">&#8942;&#8942;</button><button class="st-tool prev" title="Earlier" aria-label="Move earlier">&#8249;</button><button class="st-tool next" title="Later" aria-label="Move later">&#8250;</button>' : ''}</div>
        <div class="grp">${editable && mode === 'review' ? '<button class="st-tool del" title="Remove" aria-label="Remove">&times;</button>' : ''}</div>
      </div>
      <div class="st-mat">
        <div class="st-frame"><div class="st-art">
          <img alt="" /><div class="st-empty"></div><div class="st-shimmer"></div>
          <div class="st-art-actions"><button class="st-mini gold gen" title="Generated with Meta AI">Generate</button><button class="st-mini up">Upload</button></div>
        </div></div>
        <div class="st-placard">
          <div class="st-no"></div>
          <textarea class="st-title" rows="1" maxlength="60" spellcheck="false" aria-label="Title"></textarea>
          <textarea class="st-expl" rows="2" maxlength="220" aria-label="Explanation" placeholder="${editable ? 'Add a short explanation' : ''}"></textarea>
          ${mode === 'images' ? '<input class="st-desc" maxlength="120" spellcheck="false" aria-label="Describe the picture" placeholder="Describe the picture (optional)" />' : ''}
        </div>
      </div>`;
    const id = () => c.dataset.id!;
    const item = () => S.items.find((i) => i.id === id());
    const title = c.querySelector('.st-title') as HTMLTextAreaElement;
    const expl = c.querySelector('.st-expl') as HTMLTextAreaElement;
    const fit = () => {
      for (const t of [title, expl]) {
        t.style.height = 'auto';
        t.style.height = t.scrollHeight + 'px';
      }
    };
    // Enter finishes the title (no line breaks) and moves on to the explanation.
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (editable) expl.focus(); } });
    title.addEventListener('input', () => { if (/\n/.test(title.value)) title.value = title.value.replace(/\n+/g, ' '); fit(); });
    title.addEventListener('input', () => { const it = item(); if (it) { it.title = title.value; it.prompt = buildPrompt(it.title, it.explanation); touch(); updateInitial(c, it); } });
    expl.addEventListener('input', () => { const it = item(); if (it) { it.explanation = expl.value; it.prompt = buildPrompt(it.title, it.explanation); touch(); } fit(); });
    (c as any)._fit = fit;
    const desc = c.querySelector('.st-desc') as HTMLInputElement | null;
    if (desc) desc.addEventListener('input', () => { const it = item(); if (it) { it.desc = desc.value; touch(); } });

    if (mode === 'review') {
      c.querySelector('.del')!.addEventListener('click', async () => {
        await c.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.85) rotate(3deg)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
        S.items = S.items.filter((i) => i.id !== id());
        touch();
        refresh();
      });
      const move = (d: number) => {
        const i = S.items.findIndex((x) => x.id === id());
        const j = i + d;
        if (i < 0 || j < 0 || j >= S.items.length) return;
        [S.items[i], S.items[j]] = [S.items[j], S.items[i]];
        touch();
        refresh();
      };
      c.querySelector('.prev')!.addEventListener('click', () => move(-1));
      c.querySelector('.next')!.addEventListener('click', () => move(1));
      // Pointer-based drag so it works with mouse, touch and pen alike.
      const grip = c.querySelector('.grip') as HTMLElement;
      grip.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        c.classList.add('dragging');
        let x = e.clientX, y = e.clientY, v = 0, raf = 0;
        const under = () => {
          const over = document.elementFromPoint(x, y)?.closest<HTMLElement>('.st-card');
          if (!over || over === c) return;
          const r = over.getBoundingClientRect();
          reorderTo(id(), over.dataset.id!, x > r.left + r.width / 2);
        };
        const tick = () => {
          if (v) { root.scrollBy(0, v); under(); }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        const move = (ev: PointerEvent) => {
          x = ev.clientX; y = ev.clientY;
          v = y < 90 ? -14 : y > innerHeight - 90 ? 14 : 0; // scroll while dragging near an edge
          under();
        };
        const end = () => {
          cancelAnimationFrame(raf);
          c.classList.remove('dragging');
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', end);
          window.removeEventListener('pointercancel', end);
        };
        // Window listeners: the card is re-parented while it moves, which would drop an element-level capture.
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', end);
        window.addEventListener('pointercancel', end);
      });
    }

    if (editable) {
      c.querySelector('.gen')!.addEventListener('click', () => { const it = item(); if (it) void generateOne(it); });
      c.querySelector('.up')!.addEventListener('click', () => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*';
        inp.onchange = () => { const f = inp.files?.[0]; const it = item(); if (f && it) void uploadTo(it, f); };
        inp.click();
      });
      // Drop an image straight onto a card.
      c.addEventListener('dragover', (e) => {
        if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); c.classList.add('dropimg'); }
      });
      c.addEventListener('dragleave', () => c.classList.remove('dropimg'));
      c.addEventListener('drop', (e) => {
        c.classList.remove('dropimg');
        const f = e.dataTransfer?.files?.[0];
        const it = item();
        if (f && it && f.type.startsWith('image/')) { e.preventDefault(); e.stopPropagation(); void uploadTo(it, f); }
      });
    }
    return c;
  }

  function updateInitial(c: HTMLElement, it: Item) {
    (c.querySelector('.st-empty') as HTMLElement).textContent = (it.title.trim().match(/\p{L}/u)?.[0] ?? '').toUpperCase();
  }

  function updateCard(c: HTMLElement, it: Item, idx: number) {
    c.dataset.id = it.id;
    c.dataset.c = String(idx % 5);
    (c.querySelector('.st-no') as HTMLElement).textContent = String(idx + 1);
    const title = c.querySelector('.st-title') as HTMLTextAreaElement;
    const expl = c.querySelector('.st-expl') as HTMLTextAreaElement;
    if (document.activeElement !== title) title.value = it.title;
    if (document.activeElement !== expl) expl.value = it.explanation;
    const desc = c.querySelector('.st-desc') as HTMLInputElement | null;
    if (desc && document.activeElement !== desc) desc.value = it.desc ?? '';
    updateInitial(c, it);
    const art = c.querySelector('.st-art') as HTMLElement;
    const img = c.querySelector('img') as HTMLImageElement;
    img.alt = it.image ? it.title : '';
    if (img.dataset.src !== it.image) {
      img.dataset.src = it.image;
      if (it.image) img.src = it.image;
      else img.removeAttribute('src');
    }
    art.classList.toggle('has', !!it.image);
    c.classList.toggle('busy', it.busy);
    (c.querySelector('.gen') as HTMLElement).textContent = it.image ? 'Regenerate' : 'Generate';
    (c.querySelector('.up') as HTMLElement).textContent = it.image ? 'Replace' : 'Upload';
    (c as any)._fit?.();
  }

  /** Keyed reconcile with a FLIP move animation. */
  function syncGrid(grid: HTMLElement, items: Item[], mode: Mode, tail?: HTMLElement) {
    const existing = new Map<string, HTMLElement>();
    grid.querySelectorAll<HTMLElement>(':scope > .st-card').forEach((c) => existing.set(c.dataset.id!, c));
    const before = new Map<string, DOMRect>();
    existing.forEach((c, k) => before.set(k, c.getBoundingClientRect()));
    const keep = new Set(items.map((i) => i.id));
    existing.forEach((c, k) => { if (!keep.has(k)) { c.remove(); existing.delete(k); } });
    const fresh: HTMLElement[] = [];
    let ref: Element | null = grid.firstElementChild;
    items.forEach((it, i) => {
      let c = existing.get(it.id);
      if (!c) {
        c = makeCard(mode, true);
        c.dataset.id = it.id;
        fresh.push(c);
        c.style.animationDelay = `${Math.min(i, 8) * 40}ms`;
      }
      updateCard(c, it, i);
      if (c === ref) ref = c.nextElementSibling;
      else grid.insertBefore(c, ref);
    });
    if (tail) grid.appendChild(tail);
    existing.forEach((c, k) => {
      const b = before.get(k);
      if (!b) return;
      const a = c.getBoundingClientRect();
      const dx = b.left - a.left, dy = b.top - a.top;
      if (Math.abs(dx) + Math.abs(dy) > 2) c.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(0.2,1,0.3,1)' });
    });
    requestAnimationFrame(() => grid.querySelectorAll<HTMLElement>(':scope > .st-card').forEach((c) => (c as any)._fit?.()));
    fresh.forEach((c) => c.addEventListener('animationend', () => { c.classList.remove('enter'); c.style.animationDelay = ''; }, { once: true }));
  }

  let refresh: () => void = () => {};

  /* ------------------------------------------------------- image actions */

  async function generateOne(it: Item) {
    if (it.busy) return;
    it.busy = true;
    refresh();
    try {
      it.image = await generateImage(it.desc?.trim() || it.prompt || buildPrompt(it.title, it.explanation), fullStyle(), it.title);
      it.cutout = undefined;
      touch();
    } catch {
      toast('Could not generate that one. Try again.');
    }
    it.busy = false;
    refresh();
  }

  async function uploadTo(it: Item, file: File | Blob) {
    it.busy = true;
    refresh();
    try {
      it.image = await fileToSquareJpeg(file);
      it.cutout = undefined;
      touch();
    } catch {
      toast('That image could not be read.');
    }
    it.busy = false;
    refresh();
  }

  /* ------------------------------------------------------------- screens */

  function startScreen(): HTMLElement {
    const s = h('section', 'st-screen st-center');
    s.innerHTML = `
      <div class="st-hero-castle st-doodle"></div>
      <h1 class="st-h1">What do you want<br />to remember?</h1>
      <p class="st-sub">Turn anything into a palace of strange, unforgettable images you can walk through.</p>
      <div class="st-tiles">
        <button class="st-tile" data-t="pdf">
          <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16 6h22l12 12v36a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4z"/><path d="M38 6v12h12"/><path d="M32 46V30M25 37l7-7 7 7"/></svg>
          <div><h3>Drop a PDF</h3><p>A chapter, slides, your notes. We read it and pull out the big ideas.</p></div>
        </button>
        <button class="st-tile" data-t="list">
          <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 48l4-14 24-24a5 5 0 0 1 7 7L23 41z"/><path d="M36 14l7 7"/><path d="M12 56h40"/></svg>
          <div><h3>Write your list</h3><p>One idea per line. Add an explanation after a colon if you like.</p></div>
        </button>
      </div>
      <button class="st-link" data-t="demo">or try the demo: <u>Inside the Cell</u></button>
      <button class="st-link st-backlink" data-t="palaces">Back to your palaces</button>`;
    s.querySelector('.st-hero-castle')!.innerHTML = castleRaw;
    const file = h('input');
    file.type = 'file';
    file.accept = 'application/pdf,.pdf';
    file.hidden = true;
    s.appendChild(file);
    file.onchange = () => { if (file.files?.[0]) void runPdf(file.files[0]); };
    // Warm up pdf.js while the user decides, so choosing a file starts reading at once.
    window.setTimeout(() => void import('./pdf.js').catch(() => {}), 400);
    const pdfTile = s.querySelector('[data-t=pdf]') as HTMLElement;
    pdfTile.onclick = () => file.click();
    (s.querySelector('[data-t=list]') as HTMLElement).onclick = () => void showList();
    (s.querySelector('[data-t=demo]') as HTMLElement).onclick = () => void runDemo();
    const back = s.querySelector('[data-t=palaces]') as HTMLElement;
    back.hidden = !listPalaces().length;
    back.onclick = () => void showPalaces();
    s.querySelectorAll<HTMLElement>('.st-tile').forEach((t) => {
      t.addEventListener('pointermove', (e) => {
        const r = t.getBoundingClientRect();
        t.style.setProperty('--mx', `${e.clientX - r.left}px`);
        t.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    });
    // Drop a PDF anywhere on the page.
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); pdfTile.classList.add('drag'); } };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) pdfTile.classList.remove('drag'); };
    const drop = (e: DragEvent) => {
      pdfTile.classList.remove('drag');
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      e.preventDefault();
      if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) void runPdf(f);
      else toast('That is not a PDF. Try another file.');
    };
    root.addEventListener('dragover', over);
    root.addEventListener('dragleave', leave);
    root.addEventListener('drop', drop);
    new MutationObserver((_, ob) => {
      if (!s.isConnected) {
        root.removeEventListener('dragover', over);
        root.removeEventListener('dragleave', leave);
        root.removeEventListener('drop', drop);
        ob.disconnect();
      }
    }).observe(stage, { childList: true });
    return s;
  }

  async function showList(prefill?: string) {
    if (S.source !== 'My notes' && !prefill) S.items = [];
    S.source = 'My notes';
    if (!S.items.length) S.deckTitle = 'My palace';
    S.demo = false;
    const live: Item[] = [];
    const el = await go('list', () => {
      const s = h('section', 'st-screen');
      s.innerHTML = `
        <div><h2 class="st-h2">Write your list</h2>
        <p class="st-sub">One idea per line. Use “Term: explanation” or “Term - explanation”. Three to twelve ideas.</p></div>
        <div class="st-split">
          <div class="st-panel st-editor">
            <textarea spellcheck="false" aria-label="Your list, one idea per line" placeholder="${esc(EXAMPLE)}"></textarea>
            <div class="st-foot"><span class="cnt">0 ideas</span><button class="st-link ex" type="button">Paste an example</button></div>
          </div>
          <div class="st-grid live"></div>
        </div>
        <div class="st-bar"><span class="st-count"></span><div class="st-acts"><button class="st-btn back">Back</button><button class="st-btn gold cont" disabled>Review concepts</button></div></div>`;
      return s;
    });
    const ta = el.querySelector('textarea') as HTMLTextAreaElement;
    const grid = el.querySelector('.st-grid') as HTMLElement;
    const cnt = el.querySelector('.cnt') as HTMLElement;
    const barCount = el.querySelector('.st-count') as HTMLElement;
    const cont = el.querySelector('.cont') as HTMLButtonElement;
    const ghost = h('div', 'st-ghost');
    ghost.appendChild(doodle(castleRaw));
    ghost.appendChild(document.createTextNode('Your first idea lands here'));
    const render = () => {
      S.listText = ta.value;
      const drafts = parseList(ta.value);
      const n = drafts.length;
      live.length = 0;
      drafts.slice(0, MAX).forEach((d, i) => live.push({ id: `L${i}`, ...d, image: '', busy: false }));
      syncGrid(grid, live, 'live');
      if (!live.length) { if (!ghost.isConnected) grid.appendChild(ghost); } else ghost.remove();
      cnt.textContent = n > MAX ? `${n} ideas, first ${MAX} used` : `${n} idea${n === 1 ? '' : 's'}`;
      barCount.innerHTML = n < MIN ? `<b>${n}</b> of at least ${MIN}` : n > MAX ? `<b>${MAX}</b> ideas ready, ${n - MAX} left out` : `<b>${n}</b> ideas ready`;
      cont.disabled = n < MIN;
    };
    ta.addEventListener('input', render);
    (el.querySelector('.ex') as HTMLElement).onclick = () => { ta.value = EXAMPLE; render(); };
    (el.querySelector('.back') as HTMLElement).onclick = () => void showStart();
    cont.onclick = () => {
      // Keep images and edits of ideas that were already here when you come back to change the list.
      const prev = new Map(S.items.map((i) => [i.title.trim().toLowerCase(), i]));
      S.items = live.map((l) => {
        const old = prev.get(l.title.trim().toLowerCase());
        return old ? { ...old, explanation: l.explanation || old.explanation, id: newId() } : { ...l, id: newId() };
      });
      touch();
      void showConcepts();
    };
    if (prefill) ta.value = prefill;
    else if (S.listText) ta.value = S.listText;
    else if (S.items.length) ta.value = S.items.map((i) => (i.explanation ? `${i.title}: ${i.explanation}` : i.title)).join('\n');
    render();
    ta.focus({ preventScroll: true });
  }

  async function showStart() {
    await go('start', startScreen);
  }

  /* ----------------------------------------------------- palace gallery */

  function doodleOf(setting: Setting, tint: string): HTMLElement {
    const d = h('div', `st-scene tint-${tint}`);
    d.innerHTML = settingArt(setting);
    return d;
  }

  function openPalace(id: string, deckId: string) {
    setActivePalace(id);
    setPendingDeck(deckId);
    leave();
  }

  function leave() {
    clearDraft();
    root.classList.add('st-leave');
    window.dispatchEvent(new CustomEvent('loci:studio-done'));
    setTimeout(() => root.remove(), 750);
  }

  function palaceCard(p: ReturnType<typeof listPalaces>[number]): HTMLElement {
    const info = SETTING_INFO[p.setting] ?? SETTING_INFO.home;
    const deck = deckInfo(p.deckId);
    const placed = Object.keys(p.poses).length;
    const due = dueCount(p);
    const c = h('article', `st-pcard t-${info.tint}`);
    c.tabIndex = 0;
    c.setAttribute('role', 'button');
    c.setAttribute('aria-label', `Open ${p.name}`);
    const note = !placed ? 'Not placed yet' : due ? `${due} to review today` : 'All caught up';
    c.innerHTML = `
      <button class="st-tool st-dots" aria-label="Palace menu" aria-haspopup="true">&#8943;</button>
      <div class="st-menu" hidden><button class="st-menu-item del">Delete palace</button></div>
      <div class="st-pframe"></div>
      <div class="st-pbody">
        <h3 class="st-pname"></h3>
        <p class="st-pdeck"></p>
        <div class="st-pmeta"><span class="st-pill ${placed && due ? 'due' : ''}"></span><span class="st-pset"></span></div>
      </div>`;
    c.querySelector('.st-pframe')!.appendChild(doodleOf(p.setting, info.tint));
    (c.querySelector('.st-pname') as HTMLElement).textContent = p.name;
    (c.querySelector('.st-pdeck') as HTMLElement).textContent = deck ? `${deck.title}, ${deck.count} concept${deck.count === 1 ? '' : 's'}` : 'Deck missing';
    (c.querySelector('.st-pill') as HTMLElement).textContent = note;
    (c.querySelector('.st-pset') as HTMLElement).textContent = info.name;

    const menu = c.querySelector('.st-menu') as HTMLElement;
    const dots = c.querySelector('.st-dots') as HTMLElement;
    const del = c.querySelector('.del') as HTMLButtonElement;
    const closeMenu = () => {
      if (!c.isConnected) { document.removeEventListener('st-close-menus', closeMenu); document.removeEventListener('click', closeMenu); return; }
      menu.hidden = true; dots.setAttribute('aria-expanded', 'false'); del.textContent = 'Delete palace'; del.classList.remove('sure');
    };
    dots.setAttribute('aria-expanded', 'false');
    dots.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = menu.hidden;
      document.dispatchEvent(new Event('st-close-menus'));
      menu.hidden = !open;
      dots.setAttribute('aria-expanded', String(open));
      if (open) del.focus();
    });
    document.addEventListener('st-close-menus', closeMenu);
    document.addEventListener('click', closeMenu);
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!del.classList.contains('sure')) { del.classList.add('sure'); del.textContent = 'Click again to delete'; return; }
      deletePalace(p.id);
      if (!listPalaces().some((x) => x.deckId === p.deckId)) deleteDeck(p.deckId);
      document.removeEventListener('st-close-menus', closeMenu);
      document.removeEventListener('click', closeMenu);
      await c.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.85) rotate(3deg)' }], { duration: 240, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
      void (listPalaces().length ? showPalaces() : showStart());
    });
    const open = () => {
      if (!deck) { toast('This palace lost its deck. Delete it and make a new one.'); return; }
      openPalace(p.id, p.deckId);
    };
    c.addEventListener('click', open);
    c.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === c) { e.preventDefault(); open(); } });
    return c;
  }

  async function showPalaces() {
    await go('palaces', () => {
      const s = h('section', 'st-screen');
      s.innerHTML = `
        <div class="st-titlerow"><div><h2 class="st-h2">Your palaces</h2>
        <p class="st-sub">A palace is one deck placed in one setting. Open one to walk through it.</p></div></div>
        <div class="st-pgrid"></div>
        <button class="st-link st-demolink" data-t="demo">or try the demo: <u>Inside the Cell</u></button>`;
      const grid = s.querySelector('.st-pgrid') as HTMLElement;
      const list = listPalaces().sort((a, b) => b.createdAt - a.createdAt);
      list.forEach((p, i) => {
        const c = palaceCard(p);
        c.style.animation = `st-pop 0.6s var(--spring) ${Math.min(i, 8) * 50}ms both`;
        grid.appendChild(c);
      });
      const add = h('button', 'st-pnew');
      add.innerHTML = '<span class="st-pnew-art"></span><b>New palace</b><small>Turn a PDF or a list into a new place to remember</small>';
      add.querySelector('.st-pnew-art')!.appendChild(doodle(castleRaw));
      add.onclick = () => {
        clearDraft();
        S.items = [];
        S.deckTitle = 'My palace';
        S.listText = '';
        S.styleText = '';
        S.palaceName = '';
        S.setting = 'home';
        void showStart();
      };
      grid.appendChild(add);
      (s.querySelector('[data-t=demo]') as HTMLElement).onclick = () => void runDemo();
      return s;
    });
  }

  /* ---------------------------------------------------- choose a setting */

  async function showSetting() {
    const el = await go('setting', () => {
      const s = h('section', 'st-screen');
      const order: Setting[] = ['home', ...ROOM_IDS];
      s.innerHTML = `
        <div class="st-titlerow">
          <div><h2 class="st-h2">Choose a setting</h2>
          <p class="st-sub">Where should your ideas live? You can make another palace with the same ideas later.</p></div>
          <label class="st-namewrap"><span>Palace name</span><input class="st-name" maxlength="40" placeholder="Name your palace" /></label>
        </div>
        <div class="st-settings" role="radiogroup" aria-label="Setting">
          ${order.map((k) => `<button class="st-setting t-${SETTING_INFO[k].tint}" role="radio" data-k="${k}" aria-checked="false"><div class="st-sframe"></div><h3>${SETTING_INFO[k].name}</h3><p>${SETTING_INFO[k].blurb}</p><i class="st-check" aria-hidden="true"></i></button>`).join('')}
        </div>
        <div class="st-bar"><span class="st-count"></span><div class="st-acts"><button class="st-btn back">Back</button><button class="st-btn gold build">Build my palace</button></div></div>`;
      s.querySelectorAll<HTMLElement>('.st-setting').forEach((t) => {
        const k = t.dataset.k as Setting;
        t.querySelector('.st-sframe')!.appendChild(doodleOf(k, SETTING_INFO[k].tint));
      });
      return s;
    });
    const name = el.querySelector('.st-name') as HTMLInputElement;
    const tiles = Array.from(el.querySelectorAll<HTMLElement>('.st-setting'));
    const count = el.querySelector('.st-count') as HTMLElement;
    const buildBtn = el.querySelector('.build') as HTMLButtonElement;
    if (!S.palaceName.trim()) S.palaceName = S.deckTitle;
    name.value = S.palaceName;
    name.oninput = () => { S.palaceName = name.value; };
    const pick = (k: Setting) => {
      S.setting = k;
      tiles.forEach((t) => { const on = t.dataset.k === k; t.classList.toggle('on', on); t.setAttribute('aria-checked', String(on)); t.tabIndex = on ? 0 : -1; });
      touch();
      count.innerHTML = `<b>${SETTING_INFO[k].name}</b>, ${S.items.length} concept${S.items.length === 1 ? '' : 's'}`;
    };
    tiles.forEach((t, i) => {
      t.onclick = () => pick(t.dataset.k as Setting);
      t.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        const n = tiles[(i + d + tiles.length) % tiles.length];
        n.focus();
        pick(n.dataset.k as Setting);
      });
    });
    pick(S.setting);
    (el.querySelector('.back') as HTMLElement).onclick = () => void showImages();
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); buildBtn.click(); } });
    buildBtn.onclick = async () => {
      if (buildBtn.disabled) return;
      buildBtn.disabled = true;
      await build();
      buildBtn.disabled = false;
    };
  }

  async function showConcepts() {
    const el = await go('concepts', () => {
      const s = h('section', 'st-screen mode-review');
      s.innerHTML = `
        <div class="st-titlerow">
          <div><h2 class="st-h2">Your concepts</h2>
          <p class="st-sub">Edit anything. Drag the handle to reorder: this is the path you will walk through your palace.</p></div>
          <label class="st-namewrap"><span>Deck name</span><input class="st-name" maxlength="40" placeholder="Name this deck" /></label>
        </div>
        <div class="st-grid"></div>
        <div class="st-bar"><span class="st-count"></span><div class="st-acts"><button class="st-btn back">Back</button><button class="st-btn gold next">Next: images</button></div></div>`;
      return s;
    });
    const grid = el.querySelector('.st-grid') as HTMLElement;
    const name = el.querySelector('.st-name') as HTMLInputElement;
    name.value = S.deckTitle;
    name.oninput = () => { S.deckTitle = name.value; touch(); };
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
    const add = h('button', 'st-add', '<span>+</span>Add a piece');
    add.onclick = () => {
      if (S.items.length >= MAX) { toast(`${MAX} concepts is the most one palace holds.`); return; }
      const it = fromDraft({ title: 'New idea', explanation: '', prompt: buildPrompt('New idea', '') });
      S.items.push(it);
      touch();
      refresh();
      const t = grid.querySelector<HTMLTextAreaElement>(`[data-id="${it.id}"] .st-title`);
      t?.focus();
      t?.select();
    };
    const count = el.querySelector('.st-count') as HTMLElement;
    const next = el.querySelector('.next') as HTMLButtonElement;
    refresh = () => {
      syncGrid(grid, S.items, 'review', add);
      add.style.display = S.items.length >= MAX ? 'none' : '';
      count.innerHTML = `<b>${S.items.length}</b> concept${S.items.length === 1 ? '' : 's'}${S.items.length < MIN ? `, add at least ${MIN}` : S.items.length >= MAX ? ' (the most one palace holds)' : ''}`;
      next.disabled = S.items.length < MIN;
    };
    refresh();

    (el.querySelector('.back') as HTMLElement).onclick = () => void (S.source === 'My notes' ? showList() : showStart());
    next.onclick = () => {
      const blank = Array.from(grid.querySelectorAll<HTMLTextAreaElement>('.st-title')).find((t) => !t.value.trim());
      if (blank) { blank.focus(); blank.closest('.st-card')?.classList.add('invalid'); toast('Give every concept a name first.'); return; }
      void showImages();
    };
    grid.addEventListener('input', (e) => (e.target as HTMLElement).closest('.st-card')?.classList.remove('invalid'));
  }

  async function showImages() {
    const el = await go('images', () => {
      const s = h('section', 'st-screen mode-images');
      s.innerHTML = `
        <div><h2 class="st-h2">Give each one a face</h2>
        <p class="st-sub">Pick a style, describe a picture and Meta AI draws it, or upload your own. You can also drop a picture onto any card.</p></div>
        <div class="st-style"><input maxlength="80" placeholder="Describe a style, like “crazy animals”" aria-label="Style" />
          ${PRESETS.map((p) => `<button class="st-chip" data-p="${esc(p)}">${esc(p)}</button>`).join('')}</div>
        <div class="st-grid"></div>
        <div class="st-bar"><span class="st-count"></span><div class="st-acts"><button class="st-btn back">Back</button><button class="st-btn all">Generate missing</button><button class="st-btn gold build">Next: setting</button></div></div>`;
      return s;
    });
    const grid = el.querySelector('.st-grid') as HTMLElement;
    const input = el.querySelector('.st-style input') as HTMLInputElement;
    const chips = Array.from(el.querySelectorAll<HTMLElement>('.st-chip'));
    const count = el.querySelector('.st-count') as HTMLElement;
    const all = el.querySelector('.all') as HTMLButtonElement;
    const buildBtn = el.querySelector('.build') as HTMLButtonElement;
    input.value = S.styleText;
    const syncChips = () => chips.forEach((c) => c.classList.toggle('on', c.dataset.p === input.value.trim().toLowerCase()));
    syncChips();
    input.oninput = () => { S.styleText = input.value; syncChips(); };
    chips.forEach((c) => (c.onclick = () => { input.value = c.dataset.p!; S.styleText = input.value; syncChips(); }));
    refresh = () => {
      syncGrid(grid, S.items, 'images');
      const have = S.items.filter((i) => i.image).length;
      all.disabled = busyAll || have === S.items.length;
      buildBtn.disabled = busyAll;
      count.innerHTML = `<b>${have}</b> of ${S.items.length} images${have < S.items.length ? ', the rest are made for you on Next' : ''}<span class="st-aibadge">Generated with Meta AI</span>`;
    };
    refresh();

    const fillMissing = async () => {
      busyAll = true;
      setStep(2);
      const todo = S.items.filter((i) => !i.image && !i.busy); // cards already generating keep their own request
      todo.forEach((i) => (i.busy = true));
      refresh();
      await Promise.all(
        todo.map(async (it, k) => {
          await sleep(k * 160);
          it.busy = false;
          await generateOne(it);
        }),
      );
      busyAll = false;
      setStep(2);
      refresh();
    };
    all.onclick = () => void fillMissing();
    (el.querySelector('.back') as HTMLElement).onclick = () => void showConcepts();
    buildBtn.onclick = async () => {
      buildBtn.disabled = true;
      if (S.items.some((i) => !i.image)) await fillMissing();
      buildBtn.disabled = false;
      if (S.items.some((i) => !i.image)) { toast('Some images failed. Try Generate missing again.'); return; }
      await showSetting();
    };
  }

  /* ----------------------------------------------------------------- demo */

  async function runDemo() {
    try {
      const deck = await loadDeck('cells');
      const items: Item[] = deck.concepts.map((c) => ({
        id: newId(),
        title: c.title,
        explanation: c.explanation,
        prompt: c.prompt,
        image: resolveImage(deck, c),
        cutout: c.cutout,
        busy: false,
      }));
      // Reuse the demo palace so its placements and reviews survive; otherwise make it (sunlit living room by default).
      const existing = listPalaces().find((p) => p.deckId === 'cells' && p.name === deck.title);
      const palace = existing ?? createPalace(deck.title, 'cells', 'sunlit_living_room');
      await playBuild(items, () => openPalace(palace.id, 'cells'));
    } catch {
      toast('The demo deck could not be loaded.');
    }
  }

  /* ------------------------------------------------------------------ PDF */

  let pdfRun = 0;
  async function runPdf(file: File) {
    if (screen === 'reading') return;
    if (file.size > 40 * 1024 * 1024) { toast('That PDF is over 40 MB. Try a shorter one.'); return; }
    const run = ++pdfRun;
    const pretty = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
    const el = await go('reading', () => {
      const s = h('section', 'st-screen');
      s.innerHTML = `<div class="st-read">
        <div class="st-paper" style="aspect-ratio:0.77;background:rgba(243,238,228,.07)"><div class="st-scan"></div></div>
        <div class="st-reading-copy"><div class="st-read-castle st-doodle"></div><h2 class="st-h2">Reading ${esc(pretty.slice(0, 26) || 'your PDF')}</h2>
        <div class="st-status"><span class="st-dot"></span><span class="txt">Opening your document</span></div>
        <div class="st-prog" aria-hidden="true"><i></i></div>
        <div class="st-chips"></div><button class="st-btn st-cancel" type="button">Cancel</button></div></div>`;
      return s;
    });
    const rc = el.querySelector('.st-read-castle') as HTMLElement;
    rc.innerHTML = castleRaw;
    drawIn(rc, 5200);
    const paper = el.querySelector('.st-paper') as HTMLElement;
    const scan = el.querySelector('.st-scan') as HTMLElement;
    const txt = el.querySelector('.txt') as HTMLElement;
    const dot = el.querySelector('.st-dot') as HTMLElement;
    const chipsBox = el.querySelector('.st-chips') as HTMLElement;

    (el.querySelector('.st-cancel') as HTMLElement).onclick = () => { pdfRun++; void showStart(); };
    const prog = el.querySelector('.st-prog i') as HTMLElement;
    const progAnim = prog.animate([{ width: '0%' }, { width: '34%' }], { duration: 1100, easing: 'ease-out', fill: 'forwards' });
    setStep(0);
    let read: PdfRead;
    try {
      read = await (await import('./pdf.js')).readPdf(file, 360, (page, total) => { txt.textContent = total > 1 ? `Reading page ${page} of ${total}` : 'Reading your document'; });
    } catch (err) {
      if (run !== pdfRun) return;
      console.warn('[studio] pdf read failed', err);
      toast('That PDF could not be read. It may be protected or damaged. Try writing your list.');
      await showStart();
      return;
    }
    if (run !== pdfRun) return; // cancelled while reading
    let drafts = await extractConcepts(read.text, '');
    // The document's own title names the deck; it is not a concept to memorize.
    const nt = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (read.title) drafts = drafts.filter((d) => nt(d.title) !== nt(read.title));
    if (!drafts.length) {
      const raw = read.text.split('\n').map((l) => l.replace(/^#\s+/, '').trim()).filter(Boolean).slice(0, 10).join('\n');
      toast(raw ? 'No clear concepts found. Here is the text, tidy it up.' : 'No text found. Scanned PDFs are not supported yet, try writing your list.');
      S.items = [];
      S.listText = '';
      await showList(raw);
      return;
    }

    S.items = drafts.map(fromDraft);
    S.deckTitle = (read.title ? read.title.slice(0, 40) : pretty.replace(/\b\p{L}/gu, (m) => m.toUpperCase()).slice(0, 40)) || 'My palace';
    S.palaceName = '';
    S.source = file.name;
    S.demo = false;
    S.dirty = true;

    paper.style.cssText = '';
    paper.insertBefore(read.thumb, scan);
    read.thumb.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500 });
    txt.textContent = 'Scanning for the big ideas';

    const chips = S.items.map((it) => {
      const c = h('span', 'st-concept-chip');
      c.textContent = it.title;
      chipsBox.appendChild(c);
      return c;
    });

    const D = Math.max(1200, Math.min(1500, 600 + S.items.length * 100));
    progAnim.cancel();
    prog.animate([{ width: '34%' }, { width: '100%' }], { duration: D + 900, easing: 'linear', fill: 'forwards' });
    const ph = paper.getBoundingClientRect().height || 440;
    scan.animate([{ height: '0px' }, { height: `${ph}px` }], { duration: D, easing: 'cubic-bezier(0.45,0,0.35,1)', fill: 'forwards' });

    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    const flights = S.items.map(async (it, i) => {
      const t = norm(it.title);
      const line = read.lines.find((l) => norm(l.text) === t) ?? read.lines.find((l) => norm(l.text).includes(t));
      const fy = line ? line.y + line.h / 2 : (i + 0.5) / S.items.length;
      await sleep(120 + Math.min(1, fy) * D * 0.82);
      const pr = paper.getBoundingClientRect();
      const lx = line ? pr.left + line.x * pr.width : pr.left + pr.width * 0.2;
      const ly = line ? pr.top + line.y * pr.height : pr.top + pr.height * fy;
      if (line) {
        const hl = h('div', 'st-hl');
        hl.style.cssText = `left:${line.x * 100 - 0.6}%;top:${line.y * 100 - 0.2}%;width:${line.w * 100 + 1.2}%;height:${line.h * 100 + 0.8}%`;
        paper.appendChild(hl);
        requestAnimationFrame(() => hl.classList.add('on'));
        await sleep(160);
      }
      const fly = h('div', 'st-fly');
      fly.textContent = it.title;
      fly.style.left = `${lx}px`;
      fly.style.top = `${ly}px`;
      root.appendChild(fly);
      const cr = chips[i].getBoundingClientRect();
      const dx = cr.left + 10 - lx, dy = cr.top + 6 - ly;
      await fly.animate(
        [
          { transform: 'translate(0,0) scale(1)', opacity: 0 },
          { transform: `translate(${dx * 0.25}px,${dy * 0.25 - 50}px) scale(1.25)`, opacity: 1, offset: 0.3 },
          { transform: `translate(${dx}px,${dy}px) scale(1.1)`, opacity: 0.2 },
        ],
        { duration: 600, easing: 'cubic-bezier(0.5,0,0.2,1)', fill: 'forwards' },
      ).finished.catch(() => {});
      fly.remove();
      chips[i].classList.add('in');
    });
    await Promise.all(flights);
    if (run !== pdfRun) return;
    await sleep(150);
    dot.style.animation = 'none';
    rc.animate([{ transform: 'none' }, { transform: 'translateY(-10px) rotate(-3deg)' }, { transform: 'none' }], { duration: 600, easing: 'ease-out' });
    txt.textContent = `Found ${S.items.length} idea${S.items.length === 1 ? '' : 's'}`;
    await sleep(350);
    await showConcepts();
  }

  /* ---------------------------------------------------------------- build */

  async function build() {
    const concepts: Concept[] = [];
    const used = new Set<string>();
    S.items.forEach((it, i) => {
      let id = slug(it.title) || `c${i + 1}`;
      while (used.has(id)) id += `-${i + 1}`;
      used.add(id);
      concepts.push({ id, title: it.title.trim() || `Idea ${i + 1}`, explanation: it.explanation.trim(), image: it.image, prompt: it.prompt, ...(it.cutout ? { cutout: it.cutout } : {}) });
    });
    const title = S.deckTitle.trim() || 'My palace';
    const deckId = saveDeck({ title, source: S.source, style: fullStyle(), concepts });
    if (!deckId) {
      toast('Storage is full. Delete a palace and try again.');
      return;
    }
    const palace = createPalace(S.palaceName.trim() || title, deckId, S.setting);
    clearDraft();
    S.palaceName = '';
    await playBuild(S.items, () => openPalace(palace.id, deckId));
  }

  /** The "Building your palace" moment, then hands over to `done`. */
  async function playBuild(items: Item[], done: () => void) {
    const b = h('div', 'st-build');
    b.innerHTML = `<div class="bcastle st-doodle"></div><div class="fan"></div><div class="copy"><h1 class="st-h1">Building your palace</h1></div>`;
    root.appendChild(b);
    b.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, fill: 'forwards' });
    const bc = b.querySelector('.bcastle') as HTMLElement;
    bc.innerHTML = castleRaw;
    drawIn(bc, 1800);
    const fan = b.querySelector('.fan') as HTMLElement;
    const shown = items.slice(0, 9);
    const n = shown.length;
    shown.forEach((it, i) => {
      const c = h('div', 'st-fancard');
      c.style.setProperty('--pastel', ['#F4C7C3', '#F7E3A1', '#C8E6D0', '#C7DDF2', '#DCCFF0'][i % 5]);
      const inner = h('div');
      inner.style.backgroundImage = `url("${it.image}")`;
      c.appendChild(inner);
      fan.appendChild(c);
      const t = n === 1 ? 0 : i / (n - 1) - 0.5;
      const ang = t * 70;
      const x = Math.sin((ang * Math.PI) / 180) * Math.min(innerWidth * 0.34, 380);
      const y = -Math.cos((ang * Math.PI) / 180) * 70 + 90;
      c.animate(
        [
          { transform: 'translate(0,260px) scale(0.3) rotate(0deg)', opacity: 0 },
          { transform: `translate(${x}px,${y}px) scale(1) rotate(${ang * 0.6}deg)`, opacity: 1 },
        ],
        { duration: 900, delay: 250 + i * 90, easing: 'cubic-bezier(0.2,1.1,0.3,1.1)', fill: 'forwards' },
      );
    });
    await sleep(2100);
    const hh = b.querySelector('.st-h1') as HTMLElement;
    await hh.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).finished.catch(() => {});
    hh.innerHTML = 'Your palace is ready';
    hh.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 600, easing: 'cubic-bezier(0.2,1,0.3,1)', fill: 'forwards' });
    await sleep(1400);
    done();
  }

  // Escape closes any open palace menu and hands focus back to its button.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !root.isConnected) return;
    const open = root.querySelector<HTMLElement>('.st-menu:not([hidden])');
    if (open) { document.dispatchEvent(new Event('st-close-menus')); (open.previousElementSibling as HTMLElement | null)?.focus(); }
  });

  const resumed = loadDraft();
  if (resumed) {
    toast('Picked up where you left off.');
    void (resumed === 'setting' ? showSetting() : resumed === 'images' ? showImages() : showConcepts());
  } else if (listPalaces().length) void showPalaces();
  else void showStart(); // first visit: no empty gallery, go straight to creating
}

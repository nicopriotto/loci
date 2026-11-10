import type { LociSystem } from './app.js';
import { Card } from './components.js';

/** Director keys, active only with ?demo=1. */
export function initDemo(app: LociSystem) {
  // Dev-only handle for scripted capture (the digit keys also drive the IWER devui).
  if (import.meta.env.DEV) Object.assign(window, { __loci: app, __Card: Card });
  // The dev server always enables it: the managed browser has no URL control.
  if (!import.meta.env.DEV && new URLSearchParams(location.search).get('demo') !== '1') return;
  const hidden: HTMLElement[] = [];
  window.addEventListener('keydown', (ev) => {
    if (ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const t = ev.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    switch (ev.key.toLowerCase()) {
      case '1':
        app.go('onboarding');
        break;
      case '2':
        app.go('generating');
        break;
      case '3':
        void app.demoAutoPlace();
        break;
      case '4':
        void app.demoReview();
        break;
      case '5':
        void app.demoRevealNext();
        break;
      case 'r':
        app.newPalace();
        break;
      case 'h':
        // Hide (and restore) visible DOM overlays such as the IWER devui, never the canvas.
        if (hidden.length) {
          for (const el of hidden.splice(0)) el.style.display = '';
        } else {
          for (const el of Array.from(document.body.children)) {
            if (!(el instanceof HTMLElement) || el.tagName === 'SCRIPT') continue;
            if (el.tagName === 'CANVAS' || el.querySelector('canvas')) continue;
            if (getComputedStyle(el).display === 'none') continue;
            el.style.display = 'none';
            hidden.push(el);
          }
        }
        break;
    }
  });
}

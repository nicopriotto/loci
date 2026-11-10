let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let wet: GainNode | null = null;
let noise: AudioBuffer | null = null;

/** Create or resume the context. Call from any user interaction. */
export function unlock(): void {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      // Small glassy room: a damped feedback delay, mixed in quietly.
      const delay = ctx.createDelay(0.5);
      delay.delayTime.value = 0.13;
      const fb = ctx.createGain();
      fb.gain.value = 0.38;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      wet = ctx.createGain();
      wet.gain.value = 0.3;
      wet.connect(delay);
      delay.connect(lp);
      lp.connect(fb);
      fb.connect(delay);
      lp.connect(master);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* audio unavailable */
  }
}

for (const type of ['pointerdown', 'keydown', 'touchstart']) {
  window.addEventListener(type, unlock, { passive: true });
}

const ready = () => !!ctx && ctx.state === 'running' && !!master;

/** One soft sine/triangle note with a quick attack and exponential decay. */
function tone(
  freq: number,
  dur: number,
  gain: number,
  wave: OscillatorType = 'sine',
  delay = 0,
  endFreq = freq,
  send = 0.5,
) {
  if (!ready()) return;
  const c = ctx!;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(master!);
  if (send > 0) {
    const s = c.createGain();
    s.gain.value = send;
    g.connect(s);
    s.connect(wet!);
  }
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

/** Band-passed noise sweep, the base of every whoosh. */
function swish(f0: number, f1: number, dur: number, gain: number, delay = 0, q = 1.2) {
  if (!ready()) return;
  const c = ctx!;
  const t = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp);
  bp.connect(g);
  g.connect(master!);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.03);
}

/** Glassy tick: a high sine with a bright overtone. */
export const tick = () => {
  tone(2300, 0.07, 0.07, 'sine', 0, 1700);
  tone(4600, 0.04, 0.02, 'sine', 0, 3800, 0.2);
};
/** Very quiet hover tick. */
export const hover = () => tone(3300, 0.035, 0.022, 'sine', 0, 3000, 0.2);
/** Poke or pinch press. */
export const press = () => {
  tone(1500, 0.06, 0.06, 'sine', 0, 900);
  tone(620, 0.09, 0.05, 'triangle', 0, 420, 0.2);
};
/** Soft felt thud when a card lands. */
export const thud = () => {
  tone(170, 0.2, 0.2, 'sine', 0, 62, 0.15);
  tone(1900, 0.05, 0.03, 'sine', 0.01, 1400, 0.3);
};
/** Lift sound on grab. */
export const lift = () => {
  swish(500, 1800, 0.14, 0.04);
  tick();
};
export const whoosh = (delay = 0) => swish(380, 2600, 0.3, 0.075, delay, 0.9);
/** Croupier deal: whoosh then a flick. */
export const deal = (delay = 0) => {
  swish(700, 3200, 0.22, 0.06, delay, 1);
  tone(2600, 0.05, 0.05, 'sine', delay + 0.2, 1800);
  tone(300, 0.08, 0.06, 'sine', delay + 0.21, 150, 0.1);
};
export const flip = () => {
  swish(900, 4200, 0.2, 0.05, 0, 1.4);
  tone(1800, 0.06, 0.04, 'sine', 0.12, 1200);
};
/** A few bright grains where a card lands. */
export function sparkle() {
  for (let i = 0; i < 4; i++) {
    tone(2600 + Math.random() * 2600, 0.12 + Math.random() * 0.1, 0.022, 'sine', i * 0.045 + Math.random() * 0.02, undefined, 0.6);
  }
}
/** Warm bell chime on reveal: C5, G5 and a shimmering E6. */
export function chime() {
  const note = (f: number, d: number, g: number, at: number) => {
    tone(f, 1.5, g, 'sine', at);
    tone(f * 2, 0.9, g * 0.22, 'triangle', at);
    tone(f * 2.76, 0.5, g * 0.07, 'sine', at, undefined, 0.8);
  };
  note(523.25, 1.5, 0.13, 0);
  note(783.99, 1.6, 0.12, 0.12);
  note(1318.5, 1.8, 0.06, 0.26);
}
/** Gentle two-note descent for a miss. */
export function soft() {
  tone(392, 0.7, 0.09, 'sine', 0);
  tone(329.6, 0.9, 0.08, 'sine', 0.14);
}

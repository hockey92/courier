// "Broadway Boogie": an original 8-bit rock 'n' roll tune and the sound effects, all synthesised.

// ---------- Music: "Broadway Boogie", an original 8-bit rock 'n' roll tune ----------
// Two times round a 12-bar blues in A: the riff, then a solo. Starts on the first key press (browsers block autoplay).
export const music = (() => {
  const BPM = 165, STEP = 60 / BPM / 4, BARS = 24, SWING = 0.1;
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midi = s => SEMI[s[0]] + (s[1] === '#' ? 1 : s[1] === 'b' ? -1 : 0) + 12 * (+s.slice(-1) + 1);
  const hz = m => 440 * 2 ** ((m - 69) / 12);

  const ROOT = { A: 45, D: 50, E: 52 };
  const BLUES = ['A', 'A', 'A', 'A', 'D', 'D', 'A', 'A', 'E', 'D', 'A', 'E'];
  const rootAt = bar => ROOT[BLUES[bar % 12]];
  const BOOGIE = [0, 4, 7, 9, 10, 9, 7, 4];  // walking bass: root, third, fifth, sixth, flat seventh and back
  const CHUG = [7, 7, 9, 9, 7, 7, 9, 9];     // rhythm guitar rocks between the fifth and the sixth

  // one string per bar, 8 (eighths) or 16 (sixteenths) slots: a note, notes joined with '+' for a
  // double-stop, '~' to bend up into it, '-' to hold, '.' for a rest
  const LEAD = [
    'C5+E5~ - C5+E5 C5+E5 . A4 C5 D5', 'Eb5 E5 . G5 E5 D5 C5 A4',
    'C5+E5~ - C5+E5 C5+E5 . A4 C5 D5', 'E5 - - - G5 - A5 -',
    'D5+F#5~ - D5+F#5 D5+F#5 . A4 C5 D5', 'F5 F#5 . A5 F#5 D5 C5 A4',
    'C5+E5~ - C5+E5 C5+E5 . A4 C5 D5', 'E5 - C5 - A4 - . .',
    'B4+E5~ - B4+E5 B4+E5 G#4 B4 D5 E5', 'F#5 - D5 - A4 - C5 D5',
    'E5 C5 A4 C5 E5 - A5 -', 'G5 F#5 F5 E5 D5 C5 B4 G#4',
    'A5 G5 E5 G5 A5 G5 E5 G5 A5 G5 E5 G5 A5 - C6 -', 'A5~ - - - G5 E5 D5 C5',
    'E5+A5 . E5+A5 . E5+A5 . E5+A5 . E5+A5 . E5+A5 . G5 - E5 -', 'C5 D5 Eb5 E5 G5 - A5 -',
    'D5+A5 . D5+A5 . D5+A5 . D5+A5 . F#5 - A5 - C6 - A5 -', 'A5~ - - - F#5 D5 C5 A4',
    'A5 G5 E5 G5 A5 G5 E5 G5 A5 G5 E5 G5 A5 - - -', 'E5 - C5 - A4 - - -',
    'B5~ - - - G#5 - E5 -', 'A5~ - - - F#5 - D5 -',
    'E5 Eb5 D5 C5 A4 C5 Eb5 E5', 'G5 F#5 F5 E5 D5 C5 B4 G#4',
  ];
  const lead = new Map();
  let last = null;
  LEAD.forEach((bar, b) => {
    const toks = bar.split(' '), len = 16 / toks.length;
    toks.forEach((tok, k) => {
      if (tok === '-') { if (last) last.len += len; return; }
      last = null;
      if (tok === '.') return;
      const bend = tok.endsWith('~');
      lead.set(b * 16 + k * len, last = { notes: tok.replace('~', '').split('+').map(midi), len, bend });
    });
  });

  let ctx, out, guitar, noise, pulse, step = 0, nextTime = 0, on = true;

  function voice(wave, freq, t, dur, vol, { pluck = false, vibrato = false, bend = false, dest = out } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    if (typeof wave === 'string') o.type = wave; else o.setPeriodicWave(wave);
    o.frequency.setValueAtTime(bend ? freq * 2 ** (-2 / 12) : freq, t);
    if (bend) o.frequency.exponentialRampToValueAtTime(freq, t + 0.09);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    if (pluck) g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    else { g.gain.setValueAtTime(vol, t + dur - 0.03); g.gain.linearRampToValueAtTime(0, t + dur); }
    if (vibrato) {
      const lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = 5.5;
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(freq * 0.012, t + 0.25);
      lfo.connect(depth).connect(o.frequency);
      lfo.start(t); lfo.stop(t + dur);
    }
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function hiss(t, dur, vol, cutoff) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise;
    f.type = 'highpass'; f.frequency.value = cutoff;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 0.5); s.stop(t + dur);
  }

  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + 0.25);
  }

  function snare(t, vol = 0.4) {
    hiss(t, 0.14, vol, 1200);
    voice('triangle', 200, t, 0.05, vol * 0.7, { pluck: true });
  }

  function playStep(s, t) {
    const bar = Math.floor(s / 16), i = s % 16, eighth = i / 2;
    const root = rootAt(bar), turnaround = bar % 12 === 11, solo = bar >= 12;

    // driving backbeat: kick on 1 and 3, snare on 2 and 4, crash at the top, a fill into the next chorus
    if (i % 16 === 0 && bar % 12 === 0) hiss(t, 0.9, 0.22, 3500);
    if (i === 0 || i === 8 || (i === 10 && bar % 2)) kick(t);
    if (turnaround && i >= 8) { if (i % 2 === 0 || i > 12) snare(t, 0.22 + (i - 8) * 0.03); }
    else if (i === 4 || i === 12) snare(t);
    if (i % 2 === 0) hiss(t, i === 14 && bar % 2 ? 0.18 : 0.035, solo ? 0.1 : 0.08, 7500);

    if (i % 2 === 0) {
      // boogie-woogie bass walking up and down the chord
      voice('triangle', hz(root + BOOGIE[eighth]), t, STEP * 1.8, 0.34);
      // palm-muted rhythm guitar through the fuzz; the turnaround just stabs the chord
      if (!turnaround || i === 0 || i === 4) {
        for (const n of [root + 12, root + 12 + CHUG[eighth]]) {
          voice('sawtooth', hz(n), t, STEP * (turnaround ? 3 : 1.6), 0.05, { pluck: true, dest: guitar });
        }
      }
    }

    const note = lead.get(s);
    if (note) {
      const vol = note.notes.length > 1 ? 0.06 : 0.085;
      for (const n of note.notes) {
        voice(pulse, hz(n), t, note.len * STEP * 0.92, vol, { vibrato: note.len >= 8, bend: note.bend });
      }
    }
  }

  function schedule() {
    if (ctx.currentTime > nextTime + 0.2) nextTime = ctx.currentTime + 0.05; // tab was asleep: don't pile up notes
    while (nextTime < ctx.currentTime + 0.15) {
      playStep(step, nextTime + (step % 2 ? STEP * SWING : 0));
      nextTime += STEP;
      step = (step + 1) % (BARS * 16);
    }
  }

  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    out = ctx.createGain();
    out.gain.value = on ? 0.55 : 0;
    out.connect(comp).connect(ctx.destination);
    // fuzz box for the rhythm guitar: soft-clip it, then take the fizz off the top
    guitar = ctx.createGain();
    const fuzz = ctx.createWaveShaper(), tone = ctx.createBiquadFilter(), level = ctx.createGain();
    const curve = new Float32Array(1024);
    for (let k = 0; k < curve.length; k++) { const x = k / 511.5 - 1; curve[k] = (1 + 12) * x / (1 + 12 * Math.abs(x)); }
    fuzz.curve = curve;
    tone.type = 'lowpass'; tone.frequency.value = 2800;
    level.gain.value = 0.15; // the fuzz adds a lot of gain
    guitar.connect(fuzz).connect(tone).connect(level).connect(out);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
    // 25% pulse wave, the classic NES lead sound
    const real = new Float32Array(32), imag = new Float32Array(32);
    for (let n = 1; n < 32; n++) {
      real[n] = Math.sin(2 * Math.PI * n * 0.25) / (n * Math.PI);
      imag[n] = (1 - Math.cos(2 * Math.PI * n * 0.25)) / (n * Math.PI);
    }
    pulse = ctx.createPeriodicWave(real, imag);
    nextTime = ctx.currentTime + 0.1;
    setInterval(schedule, 25);
  }

  function toggle() {
    on = !on;
    if (out) out.gain.setTargetAtTime(on ? 0.55 : 0, ctx.currentTime, 0.05);
  }

  function squeak() {
    if (!ctx || !on) return;
    const t = ctx.currentTime, base = 2400 + Math.random() * 800;
    for (let k = 0; k < 2; k++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), t0 = t + k * 0.07;
      o.type = 'square';
      o.frequency.setValueAtTime(base, t0);
      o.frequency.exponentialRampToValueAtTime(base * 1.3, t0 + 0.04);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.03, t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
      o.connect(g).connect(out);
      o.start(t0); o.stop(t0 + 0.06);
    }
  }

  function blip(type, f0, f1, t0, dur, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(out);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  // a cartoon slide whistle down the manhole
  function fall() { if (ctx && on) blip('square', 1400, 160, ctx.currentTime, 0.6, 0.025); }
  // landing with a splat
  function plop() { if (ctx && on) blip('sine', 420, 90, ctx.currentTime, 0.18, 0.12); }
  // a quick major arpeggio for the turtles' cheer
  function cheer() {
    if (!ctx || !on) return;
    [0, 4, 7, 12, 16].forEach((n, k) => blip('square', hz(84 + n), hz(84 + n) * 1.01, ctx.currentTime + k * 0.07, 0.14, 0.03));
  }

  // a bottle smashing: a few bright, random little tinks
  function clink() {
    if (!ctx || !on) return;
    for (let k = 0; k < 3; k++) {
      const f = 2600 + Math.random() * 2200;
      blip('triangle', f, f * 0.8, ctx.currentTime + k * 0.03 + Math.random() * 0.02, 0.09, 0.03);
    }
  }
  // Big Tony turns up: a low two-tone warning
  function alarm() {
    if (!ctx || !on) return;
    for (let k = 0; k < 4; k++) blip('square', k % 2 ? 196 : 247, k % 2 ? 190 : 240, ctx.currentTime + k * 0.18, 0.16, 0.035);
  }

  return { start, toggle, squeak, fall, plop, cheer, clink, alarm, get playing() { return !!ctx && ctx.state === 'running' && on; }, get step() { return step; } };
})();
addEventListener('pointerdown', () => music.start());

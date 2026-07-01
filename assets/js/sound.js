/* =========================================================================
   sound.js — tiny Web Audio scan feedback (no mp3 assets, works offline).
   AudioContext must be created/resumed from a real user gesture (iOS Safari) —
   call unlock() from the same click handler that starts the camera.
   ========================================================================= */
(function () {
  const MUTE_KEY = "qr_scan_muted";
  let ctx = null;

  function unlock() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume().catch(() => {}); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (_) { ctx = null; }
  }

  // One short tone: sine wave with a quick attack/decay envelope (click-free).
  function tone(freq, start, dur, type = "sine", peak = 0.18) {
    if (!ctx) return;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    osc.connect(gain); gain.connect(ctx.destination);
    const t0 = ctx.currentTime + start;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  function play(fn) {
    if (muted()) return;
    if (!ctx) unlock();
    if (!ctx) return; // no gesture yet / unsupported — fail silently
    try { fn(); } catch (_) {}
  }

  const success = () => play(() => { tone(880, 0, 0.09); tone(1318.5, 0.08, 0.14); });
  const fail = () => play(() => tone(180, 0, 0.22, "square", 0.12));

  const muted = () => localStorage.getItem(MUTE_KEY) === "1";
  const setMuted = (on) => localStorage.setItem(MUTE_KEY, on ? "1" : "0");

  App.sound = { unlock, success, fail, isMuted: muted, setMuted };
})();

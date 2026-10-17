// --- Luister mee (17-10): vrienden op de link horen wat Sierk op zijn pc afspeelt, en de club danst op precies dat geluid ---
// Bron: deel/pc-stream.py (pc-geluid als mp3) -> relay op de VPS -> 'stream' (naast index.html, achter het geheime pad);
// 'streamstatus' zegt of Sierk nu uitzendt. De knop verschijnt alleen als de stream live is en niet op Sierks eigen scherm (daar levert
// pc-geluid de banden: native). Na de klik: <audio> speelt de stream, dezelfde klank gaat via WebAudio naar de analyser van de club
// (zoals de microfoon in attach()), dus bij iedere luisteraar lopen beeld en geluid gelijk (een paar seconden achter Sierk).
// Valt de stream weg: na 2 s opnieuw verbinden. Stil analyser-signaal terwijl hij speelt (bv. Safari): alleen geluid, beeld op demo.
(() => {
  'use strict';
  if (typeof THREE === 'undefined' || typeof analyse !== 'function') return;
  const knop = document.createElement('button');
  knop.id = 'meeluisteren'; knop.hidden = true; knop.textContent = '🔊 Luister mee';
  knop.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:50;padding:14px 26px;border-radius:999px;' +
    'border:2px solid #ff2bd6;background:rgba(10,0,20,0.78);color:#fff;font:600 18px system-ui,sans-serif;letter-spacing:0.02em;cursor:pointer;' +
    'box-shadow:0 0 18px #ff2bd6,0 0 42px rgba(32,240,255,0.5);backdrop-filter:blur(4px)';
  document.body.appendChild(knop);
  let el = null, aan = false, stilT = 0;
  const eigenScherm = () => !!native || (typeof inApp !== 'undefined' && inApp);
  async function isLive() {
    try { const r = await fetch('streamstatus', { cache: 'no-store' }); return r.ok && !!(await r.json()).live; } catch (e) { return false; }
  }
  async function tik() {
    if (eigenScherm()) { knop.hidden = true; return; }
    if (aan) return;
    knop.hidden = !(await isLive());
  }
  setTimeout(() => { tik(); setInterval(tik, 8000); }, 5000);  // even wachten: pc-geluid meldt zich op Sierks eigen scherm binnen een paar seconden
  function verbind() { el.src = 'stream?t=' + Date.now(); el.play().catch(() => {}); }
  function start() {
    el = new Audio();
    el.preload = 'none';
    ctx = ctx || new AudioContext();
    ctx.resume();
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    if (source) source.disconnect();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.5;
    bins = new Uint8Array(analyser.frequencyBinCount);
    source = ctx.createMediaElementSource(el);
    source.connect(analyser);
    source.connect(ctx.destination);  // hier wél naar de speakers: het is de muziek zelf
    el.onerror = el.onended = () => { if (aan) setTimeout(verbind, 2000); };
    el.onstalled = () => { if (aan) setTimeout(() => { if (el.paused || el.readyState < 3) verbind(); }, 4000); };
    verbind();
    aan = true; knop.textContent = '🔇 Stop'; knop.hidden = false;
    status.textContent = 'meeluisteren met Sierk';
  }
  function stop() {
    aan = false;
    if (el) { el.pause(); el.removeAttribute('src'); el.load(); }
    if (source) source.disconnect();
    analyser = null; bins = null; source = null;
    knop.textContent = '🔊 Luister mee';
    status.textContent = 'demo-beat (nog geen audio)';
  }
  knop.onclick = () => (aan ? stop() : start());
  // geluid speelt maar de analyser blijft stil (sommige browsers geven een stream niet aan WebAudio): dan beeld op de demo-beat
  setInterval(() => {
    if (!aan || !analyser || !el || el.paused) { stilT = 0; return; }
    analyser.getByteFrequencyData(bins);
    let s = 0; for (let i = 0; i < 64; i++) s += bins[i];
    stilT = s === 0 ? stilT + 1 : 0;
    if (stilT === 6) { source.disconnect(); source.connect(ctx.destination); analyser = null; bins = null; status.textContent = 'meeluisteren (beeld op de demo-beat)'; }
  }, 1000);
})();

// --- Nu op de decks (17-10): af en toe groot in neon de artiest van de set die Sierk in Brave afspeelt ---
// Bron: 'streamstatus' (relay op de VPS) geeft de YouTube-titel die deel/pc-stream.py meestuurt; voor iedereen (tv en meeluisteraars).
// Uit de titel de artiest: alles vóór | of ' - ' of ' @ ' of '(' en vóór woorden als 'Boiler Room', 'LIVE', 'DJ Set'; 'The Last Ever ... Show'
// eraf. Tonen: kort na een nieuwe set, en daarna om de ~4 minuten, 9 s lang: de letters springen aan als neonbuizen (flikkeren), gloeien
// op de tel in de showkleuren en flikkeren weer uit. Test: clubNuSpeelt.toon('Noisia'), clubNuSpeelt.artiest('Mala | Boiler Room London').
(() => {
  'use strict';
  if (typeof clubHooks === 'undefined') return;
  const NS = window.clubNuSpeelt = { titel: '', naam: '', laatst: -1e9 };
  const WEG = /\b(boiler room|live at|live from|live in|live @|live|dj set|dj-set|full set|full show|set|mix|lowlands|dekmantel|awakenings|festival)\b/i;
  function artiest(t) {
    t = String(t || '').replace(/\s*-\s*YouTube.*$/i, '').trim();
    let a = t.split(/\s+[|•·~]\s+|\s+[-–—]\s+|\s+@\s+|\s*\(|\s*\[|:\s+/)[0] || t;
    const m = a.match(WEG); if (m && m.index > 1) a = a.slice(0, m.index);
    a = a.replace(/^\s*(the last ever|the final|the|a)\s+/i, '').replace(/\s+(show|set|mix)\s*$/i, '').replace(/\s+(b2b|&|x|vs\.?|and)\s*$/i, '').replace(/[\s,;.!-]+$/, '').trim();
    if (!a || a.length > 42) a = t.slice(0, 42);
    return a.toUpperCase();
  }
  NS.artiest = artiest;

  const doos = document.createElement('div');
  doos.id = 'nuspeelt';
  doos.style.cssText = 'position:fixed;left:0;right:0;bottom:11%;z-index:40;text-align:center;pointer-events:none;display:none;' +
    'font-family:"Arial Black","Impact",system-ui,sans-serif;text-transform:uppercase;line-height:1';
  doos.innerHTML = '<div class="ns-klein" style="font-size:2.1vw;letter-spacing:0.5em;font-weight:900;margin-bottom:0.6vw">NU OP DE DECKS</div>' +
    '<div class="ns-naam" style="font-size:7.2vw;letter-spacing:0.06em;font-weight:900;white-space:nowrap"></div>';
  document.body.appendChild(doos);
  const klein = doos.querySelector('.ns-klein'), naamEl = doos.querySelector('.ns-naam');
  let letters = [], t0 = -1, DUUR = 9;
  NS.toon = naam => {
    naam = String(naam || NS.naam || '').toUpperCase();
    if (!naam) return;
    naamEl.innerHTML = '';
    letters = [...naam].map((ch, i) => { const s = document.createElement('span'); s.textContent = ch; s.style.display = 'inline-block'; s.dataset.aan = (0.15 + Math.random() * 1.1).toFixed(2); naamEl.appendChild(s); return s; });
    t0 = performance.now() / 1000; NS.laatst = t0; doos.style.display = 'block';
  };
  const kA = new THREE.Color(), kB = new THREE.Color();
  const hex = c => '#' + c.getHexString();
  clubHooks.push(() => {
    if (t0 < 0) return;
    const t = performance.now() / 1000 - t0;
    if (t > DUUR + 0.6) { doos.style.display = 'none'; t0 = -1; return; }
    const sh = window.doolhof && doolhof.show, p = typeof pulse === 'number' ? pulse : 0;
    if (sh && sh.kleur) { sh.kleur(0, kA); sh.kleur(1, kB); } else { kA.setHSL((t * 0.05) % 1, 1, 0.55); kB.setHSL((t * 0.05 + 0.4) % 1, 1, 0.55); }
    const a = hex(kA), b = hex(kB), uit = t > DUUR - 0.4;
    for (const s of letters) {
      const aanT = +s.dataset.aan;
      // neonbuis: flikkert aan (rond aanT), op het eind weer uit
      const fl = t < aanT ? 0 : t < aanT + 0.35 ? (Math.sin(t * 90 + aanT * 50) > 0 ? 1 : 0.15) : uit ? (Math.sin(t * 70 + aanT * 30) > 0.2 ? 1 : 0) : 1;
      s.style.opacity = fl ? 1 : 0.08;
      s.style.color = fl ? '#fff' : '#333';
      const g = (0.6 + 1.2 * p) * fl;
      s.style.textShadow = `0 0 ${4 + 6 * g}px ${a}, 0 0 ${14 + 22 * g}px ${a}, 0 0 ${38 + 50 * g}px ${b}`;
    }
    naamEl.style.transform = `scale(${1 + 0.035 * p})`;
    klein.style.color = b; klein.style.textShadow = `0 0 10px ${b}, 0 0 26px ${a}`; klein.style.opacity = t < 0.3 ? t / 0.3 : uit ? 0.4 : 1;
  });

  // titel ophalen (iedereen): nieuwe set -> na 4 s tonen; daarna om de ~4 minuten
  async function tik() {
    try {
      const r = await fetch('streamstatus', { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json(), titel = j && j.live && j.titel ? String(j.titel) : '';
      if (!titel) return;
      const naam = artiest(titel), nu = performance.now() / 1000;
      if (titel !== NS.titel) { NS.titel = titel; if (naam !== NS.naam) { NS.naam = naam; setTimeout(() => NS.toon(naam), 4000); return; } }
      if (nu - NS.laatst > 230 + Math.random() * 40) NS.toon(naam);
    } catch (e) { /* geen stream: niets tonen */ }
  }
  setTimeout(() => { tik(); setInterval(tik, 12000); }, 6000);
})();

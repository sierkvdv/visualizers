// Stijlherkenning: haalt BPM en muziekstijl uit het geluid en zet per stijl een vaste preset (moshpit ja/nee, dansstijl,
// halve tel, hoe lang ophypen, wat een drop bevestigt). Publiceert window.clubStijl en stuurt bij elke wissel het event
// 'clubstijl'. Toont een klein label rechtsonder en een keuzemenu 'Stijl' in de balk (handmatig kiezen, onthouden in S.stijl).
// Invoer: window.nativeSpectrum(12 banden in dB 30 Hz-12 kHz, vlakheid midden) van deel/pc-geluid.py, anders de AnalyserNode
// van de browser (eigen analyser op dezelfde bron), anders de 3 banden van nativeBands (Mac-app: grover).
// Kenmerken: tempo uit de autocorrelatie van de aanslagen (alle banden), kick op elke tel (bas-aanslagen per tel), snare op
// 2 en 4 of half-time op 3 (aanslagen 1-4,5 kHz), syncopen (percussie op 3/16), sub t.o.v. midden, vlakheid van het midden
// (vervormde gitaren), hoeveel hoog, hoe hard de aanslagen. Oordeel pas na ~16 tellen. Wisselen pas als een andere stijl
// lang genoeg duidelijk (zekerheid >= 0,5) wint: 16 tellen bij een nieuw tempo, anders 32, plus tot 64 extra naarmate de
// huidige stijl langer zeker stond; een uitdager op precies het halve/dubbele tempo (dubstep 140 vs 'lounge 70') vraagt 64-96
// tellen + extra bij zekerheid >= 0,75. In break, opbouw en kale/ingetogen stukken (zachter en minder hoog dan de volle
// delen van de set) staat de herkenning stil.
(function () {
  'use strict';
  const W = typeof window !== 'undefined' ? window : globalThis;

  // --- presets (vast) ---
  const P = (mosh, dans, halveTel, ophypeMin, dropBevestig, moshTellen, cirkel, knipTempo) => ({ mosh, dans, halveTel, ophypeMin, dropBevestig, moshTellen, cirkel, knipTempo });
  const PRESETS = {
    house:    P(false, 'groove',   false, 8,  'kick',      0,  false, 0.5),
    techno:   P(false, 'groove',   false, 8,  'kick',      0,  false, 0.6),
    trance:   P(false, 'handen',   false, 16, 'na-stilte', 0,  false, 0.55),
    dubstep:  P(true,  'halftime', true,  8,  'na-stilte', 16, true,  0.65),
    dnb:      P(true,  'skank',    true,  8,  'bassprong', 32, true,  0.9),
    hiphop:   P(false, 'bounce',   false, 4,  'kick',      0,  false, 0.45),
    afro:     P(false, 'afro',     false, 4,  'kick',      0,  false, 0.45),
    lounge:   P(false, 'lounge',   false, 4,  'kick',      0,  false, 0.15),
    rock:     P(true,  'headbang', false, 4,  'riff',      16, false, 0.7),
    metal:    P(true,  'headbang', false, 4,  'riff',      32, true,  0.9),
    punk:     P(true,  'pogo',     false, 4,  'riff',      16, false, 0.9),
    onbekend: P(false, 'groove',   false, 8,  'kick',      0,  false, 0.5),  // halveTel volgt de BPM (oude gedrag)
  };
  const NAMEN = ['house', 'techno', 'trance', 'dubstep', 'dnb', 'hiphop', 'afro', 'lounge', 'rock', 'metal', 'punk'];
  for (const n of NAMEN) Object.freeze(PRESETS[n]);
  // tempobereik per stijl (zoals dj's het noemen: dubstep 140, dnb 174) en het midden
  const TEMPO = {
    house: [115, 130, 124], techno: [125, 150, 132], trance: [128, 145, 138], dubstep: [134, 152, 140], dnb: [162, 186, 174],
    hiphop: [70, 105, 90], afro: [96, 126, 110], lounge: [70, 120, 100], rock: [92, 160, 125], metal: [90, 220, 170], punk: [150, 210, 182],
  };

  const ST = W.clubStijl = {
    naam: 'onbekend', bpm: 120, voel: 120, auto: true, zeker: 0, preset: PRESETS.onbekend,
    kies, opties: NAMEN.slice(), log: [],
  };

  // --- invoer: 12 banden per blok -> aanslagsterkte per band in een ringbuffer van 50 Hz ---
  const NB = 12, RATE = 50, NS = 512, LMAX = 150;  // 10,2 s geschiedenis, autocorrelatie tot 3 s
  const amp = new Float32Array(NB), ampVor = new Float32Array(NB), ampGem = new Float32Array(NB), eGem = new Float32Array(NB);
  const rAll = new Float32Array(NS), rLow = new Float32Array(NS), rSnr = new Float32Array(NS), rPerc = new Float32Array(NS);
  let slot = -1, gevuld = 0, tLaatst = -1, vlakGem = -1, fluxGem = 0, levelRef = -200, stilSinds = 0, specT = -99;
  let spIn = 0;  // aantal blokken binnen (voor de test)
  let midE = 0, midV = 0;  // middenniveau (dB) en hoe sterk het schommelt: gitaren staan vlak, gepompte elektronica schommelt
  // kaal/ingetogen stuk: totaalniveau en hoog (snare, hats) kort gemeten t.o.v. een lange referentie die snel meestijgt en in
  // ~2 min wegzakt. Een kaal stuk (alleen sub en een snare) ligt duidelijk onder de volle delen van dezelfde set.
  let pTk = 0, pHk = 0, lvlK = -999, lvlL = -999, hoogK = -999, hoogL = -999, lvlT = 0;

  function voed(db, vlak, t) {  // db: 12 waarden (energie per band, dB), vlak: 0..1 of null, t: seconden
    spIn++;
    let mx = -300;
    for (let k = 0; k < NB; k++) if (db[k] > mx) mx = db[k];
    if (!(mx > -95)) { stilSinds = stilSinds || t; tLaatst = t; return; }  // stilte: niets bijleren
    if (stilSinds && t - stilSinds > 3) { pTk = 0; lvlT = 0; }  // na een pauze: niveau opnieuw ijken
    stilSinds = 0;
    levelRef = levelRef < -150 ? mx : levelRef + (mx - levelRef) * 0.01;
    const dt = tLaatst < 0 ? 0.02 : Math.min(0.25, Math.max(0.001, t - tLaatst));
    tLaatst = t;
    const aG = 1 - Math.exp(-dt / 3), eA = 1 - Math.exp(-dt / 6);
    let fAll = 0, fLow = 0, fSnr = 0, fPerc = 0;
    for (let k = 0; k < NB; k++) {
      const d = Math.max(db[k], levelRef - 50);  // vloer: 50 dB onder de luidste band
      const a = Math.pow(10, d / 20);
      ampGem[k] = ampGem[k] ? ampGem[k] + (a - ampGem[k]) * aG : a;
      eGem[k] = eGem[k] ? eGem[k] + (a * a - eGem[k]) * eA : a * a;
      const f = Math.min(4, Math.max(0, a - ampVor[k]) / (ampGem[k] + 1e-12));  // aanslag t.o.v. het gewone niveau van die band
      ampVor[k] = a; amp[k] = a;
      fAll += f;
      if (k <= 2) fLow += f / 3; else if (k >= 7 && k <= 9) fSnr += f / 3;
      if (k >= 4) fPerc += f / 8;
    }
    fAll /= NB;
    fluxGem += (fAll - fluxGem) * eA;
    const md = 10 * Math.log10(amp[4] * amp[4] + amp[5] * amp[5] + amp[6] * amp[6] + 1e-20);
    if (!midE) midE = md;
    midE += (md - midE) * aG; midV += ((md - midE) * (md - midE) - midV) * aG;
    if (vlak != null && vlak >= 0) vlakGem = vlakGem < 0 ? vlak : vlakGem + (vlak - vlakGem) * eA;
    let pT = 0, pH = 0;
    for (let k = 0; k < NB; k++) { const p = Math.pow(10, db[k] / 10); pT += p; if (k >= 8) pH += p; }
    const aK = 1 - Math.exp(-dt / 4), aOp = 1 - Math.exp(-dt / 10), aAf = 1 - Math.exp(-dt / 120);
    if (!pTk) { pTk = pT; pHk = pH; } else { pTk += (pT - pTk) * aK; pHk += (pH - pHk) * aK; }  // ~4 s gemiddeld vermogen
    lvlK = 10 * Math.log10(pTk + 1e-20); hoogK = 10 * Math.log10(pHk + 1e-20);
    lvlT += dt;
    if (lvlT < 8) { lvlL = lvlK; hoogL = hoogK; }  // eerste 8 s: referentie = nu (één harde eerste klap telt niet)
    else { lvlL += (lvlK - lvlL) * (lvlK > lvlL ? aOp : aAf); hoogL += (hoogK - hoogL) * (hoogK > hoogL ? aOp : aAf); }
    const s = Math.floor(t * RATE);
    if (slot < 0) slot = s - 1;
    if (s > slot) {
      const n = Math.min(NS, s - slot);
      for (let i = 1; i <= n; i++) { const j = (slot + i) % NS; rAll[j] = rLow[j] = rSnr[j] = rPerc[j] = 0; }
      gevuld = Math.min(NS, gevuld + (s - slot));
      slot = s;
    }
    const j = ((slot % NS) + NS) % NS;
    if (fAll > rAll[j]) rAll[j] = fAll;
    if (fLow > rLow[j]) rLow[j] = fLow;
    if (fSnr > rSnr[j]) rSnr[j] = fSnr;
    if (fPerc > rPerc[j]) rPerc[j] = fPerc;
  }

  // nativeSpectrum van pc-geluid.py (zelfde CDP-aanroep als nativeBands)
  const nuS = () => performance.now() / 1000;
  W.nativeSpectrum = (db, vlak) => { specT = nuS(); voed(db, vlak, specT); };
  // oude pc-geluid.py of de Mac-app: alleen 3 banden; grof verdeeld over de 12
  const db3 = new Float32Array(NB);
  if (typeof W.nativeBands === 'function') {
    const oud = W.nativeBands;
    W.nativeBands = (b, m, t) => {
      oud(b, m, t);
      const nu = nuS();
      if (nu - specT < 1) return;
      const B = 20 * Math.log10(b / 40 + 1e-7), M = 20 * Math.log10(m / 120 + 1e-7), T = 20 * Math.log10(t / 240 + 1e-7);
      for (let k = 0; k < NB; k++) db3[k] = k < 3 ? B : k < 9 ? M - 3 : T - 3;
      voed(db3, null, nu);
    };
  }

  // --- analyse (elke 0,5 s, verdeeld over een paar beelden) ---
  const lin = new Float32Array(NS);
  const acAll = new Float32Array(LMAX + 1), acLow = new Float32Array(LMAX + 1), acSnr = new Float32Array(LMAX + 1), acPerc = new Float32Array(LMAX + 1);
  function acf(ring, out) {  // genormaliseerde autocorrelatie (gemiddelde eraf, zuiver per lag) over de laatste NS slots
    const n = gevuld;
    if (n < 64) { out.fill(0); return; }
    let m = 0;
    for (let i = 0; i < n; i++) { const v = ring[(slot - n + 1 + i + NS * 4) % NS]; lin[i] = v; m += v; }
    m /= n;
    let e = 0;
    for (let i = 0; i < n; i++) { lin[i] -= m; e += lin[i] * lin[i]; }
    e /= n;
    if (e < 1e-9) { out.fill(0); return; }
    for (let l = 0; l <= LMAX; l++) {
      let s = 0;
      for (let i = 0, k = n - l; i < k; i++) s += lin[i] * lin[i + l];
      out[l] = s / (n - l) / e;
    }
  }
  const rAt = (ac, lagS) => {  // waarde bij een lag in seconden (lineair tussen de slots)
    const x = lagS * RATE;
    if (x >= LMAX) return 0;
    const i = Math.floor(x), f = x - i;
    return ac[i] * (1 - f) + ac[i + 1] * f;
  };
  function pieken(ring, perSec) {  // aanslagen per seconde: lokale toppen boven gemiddelde + 1 sd, min. 0,1 s uit elkaar
    const n = gevuld;
    if (n < 64) return 0;
    let m = 0, q = 0;
    for (let i = 0; i < n; i++) { const v = ring[(slot - n + 1 + i + NS * 4) % NS]; lin[i] = v; m += v; q += v * v; }
    m /= n; const sd = Math.sqrt(Math.max(0, q / n - m * m)), drem = m + sd;
    let c = 0, laatst = -99;
    for (let i = 1; i < n - 1; i++) {
      const v = lin[i];
      if (v > drem && v >= lin[i - 1] && v > lin[i + 1] && i - laatst >= 5) { c++; laatst = i; }
    }
    return c / (n / RATE) * (perSec || 1);
  }

  // tempo: kamfilter over de autocorrelatie van alle aanslagen, 60-200 BPM in stappen van 0,5. De kam telt ook de halve tel
  // (8sten) en de maat (4 tellen) mee, zodat een 2:3- of 4:5-verhouding (triolen, tresillo) niet wint. De kromme wordt over
  // ~3 s gemiddeld: één rommelig stuk verschuift het tempo niet. tempoNu = alleen deze meting (voor de stabiliteitscontrole).
  const KAM_N = 281, kam = new Float32Array(KAM_N), kamGlad = new Float32Array(KAM_N), kamW = new Float32Array(KAM_N);
  for (let i = 0; i < KAM_N; i++) kamW[i] = 0.85 + 0.15 * Math.exp(-0.5 * Math.pow(Math.log2((60 + i * 0.5) / 120) / 1.2, 2));  // milde voorkeur rond 120
  let tempoF = 0, tempoKracht = 0, tempoNu = 0, kamVers = true;
  const kamSc = b => { const T = 60 / b, s2 = rAt(acAll, 2 * T); return rAt(acAll, T) + 0.5 * s2 + 0.35 * rAt(acAll, T / 2) + 0.35 * (4 * T * RATE < LMAX ? rAt(acAll, 4 * T) : s2); };
  const vouw = b => { while (b >= 160) b /= 2; while (b < 80) b *= 2; return b; };
  function piek(c) {  // beste bin en verfijnd met een parabool
    let best = -9, bi = 120;
    for (let i = 0; i < KAM_N; i++) { const v = c[i] * kamW[i]; if (v > best) { best = v; bi = i; } }
    let b = 60 + bi * 0.5;
    if (bi > 0 && bi < KAM_N - 1) { const y0 = c[bi - 1], y1 = c[bi], y2 = c[bi + 1], d = y0 - 2 * y1 + y2; if (d < 0) b += 0.5 * 0.5 * (y0 - y2) / d; }
    return b;
  }
  function tempo(dt) {
    const a = kamVers ? 1 : 1 - Math.exp(-dt / 3);
    kamVers = false;
    for (let i = 0; i < KAM_N; i++) { kam[i] = kamSc(60 + i * 0.5); kamGlad[i] += (kam[i] - kamGlad[i]) * a; }
    tempoNu = vouw(piek(kam));
    const b = piek(kamGlad);
    tempoF = vouw(b); tempoKracht = kamGlad[Math.round((b - 60) * 2)] / 2.2;
  }

  // --- kenmerken (F) en per stijl een score 0..1 ---
  const F = { f: 120, kracht: 0, subMid: 0, midHoog: 0, vlak: -1, flux: 0, kick: 0, perc: 0, diep: 0, midSchom: 0, gitaar: 0, elek: 0 };
  const dBg = (a, b) => { let s = 0; for (let k = a; k <= b; k++) s += eGem[k]; return 10 * Math.log10(s + 1e-20); };
  const klem = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const op = (x, a, b) => klem((x - a) / (b - a)), af = (x, a, b) => 1 - op(x, a, b);
  const bij = (B, c, w) => klem(1 - Math.abs(Math.log2(B / c)) / w);  // 1 op het midden, 0 op w octaaf ernaast
  const SCORE = {};
  for (const st of NAMEN) SCORE[st] = { B: 120, fit: 0, s: 0, glad: 0, vier: 0, back: 0, half: 0, sync: 0, ksync: 0 };
  function octaaf(f, st, uit) {  // tempo van deze stijl uit het basistempo f (80-160): de octaaf binnen het bereik, dichtst bij het midden
    const t = TEMPO[st];
    let bd = 99;
    for (let m = 0.5; m <= 2; m *= 2) {
      const b = f * m, buiten = b < t[0] ? Math.log2(t[0] / b) : b > t[1] ? Math.log2(b / t[1]) : 0;
      const d = buiten * 10 + Math.abs(Math.log2(b / t[2]));
      if (d < bd) { bd = d; uit.B = b; uit.fit = klem(1 - buiten / 0.06); }
    }
  }
  function patroon(sc) {  // patroonmaten bij het tempo van deze stijl
    const T = 60 / sc.B;
    const k1 = rAt(acLow, T), s1 = rAt(acSnr, T), s2 = rAt(acSnr, 2 * T), s4 = 4 * T * RATE < LMAX ? rAt(acSnr, 4 * T) : s2;
    const kOff = Math.max(rAt(acLow, 0.75 * T), rAt(acLow, 1.5 * T), rAt(acLow, 2.5 * T));
    sc.vier = klem((k1 - 0.12) / 0.3);                                       // kick op elke tel
    sc.back = klem((s2 - Math.max(0, s1) * 0.8 - 0.05) / 0.3);               // snare op 2 en 4
    sc.half = klem((s4 - Math.max(0, s2) * 0.8 - 0.05) / 0.3);               // snare op 3 (half-time)
    sc.sync = klem((rAt(acPerc, 0.75 * T) - Math.max(0, rAt(acPerc, 0.5 * T)) * 0.5) / 0.25);  // percussie op 3/16
    sc.ksync = klem((kOff - Math.max(0, k1) * 0.8 - 0.05) / 0.3);            // kick naast de tel (2-step, tresillo)
  }
  function scoren() {
    F.f = tempoF; F.kracht = tempoKracht;
    F.subMid = dBg(0, 2) - dBg(4, 8); F.midHoog = dBg(4, 8) - dBg(9, 11);
    F.vlak = vlakGem; F.flux = fluxGem; F.kick = pieken(rLow); F.perc = pieken(rPerc);
    F.diep = dBg(0, 0) - dBg(2, 2); F.midSchom = Math.sqrt(midV);
    // gitaren: weinig sub t.o.v. het midden, vlak (vervormd) en een midden dat constant staat; elektronica: veel sub
    const g = F.gitaar = af(F.subMid, 5, 9) * (F.vlak < 0 ? 0.5 : op(F.vlak, 0.14, 0.24)) * af(F.midSchom, 4, 8);
    const e = F.elek = Math.max(op(F.subMid, 5, 10), 0.8 * op(F.midSchom, 5, 10)) * (1 - g);  // veel sub, of een gepompt/gehakt midden
    for (const st of NAMEN) {
      const c = SCORE[st];
      octaaf(F.f, st, c); patroon(c);
      const B = c.B;
      let s;
      switch (st) {
        case 'house':   s = (0.3 + 0.7 * c.vier) * (c.vier * 3 + e + bij(B, 124, 0.08) * 2 + (1 - g) + af(F.vlak, 0.12, 0.25) * 0.5) / 7.5; break;
        case 'techno':  s = (0.3 + 0.7 * c.vier) * (c.vier * 3 + e + bij(B, 132, 0.15) * 2 + (1 - g) + op(F.subMid, 13, 20) * 0.5 + af(F.vlak, 0.14, 0.22) * 0.5) / 8; break;
        case 'trance':  s = (0.3 + 0.7 * c.vier) * (c.vier * 3 + e * 0.5 + bij(B, 138, 0.1) * 2 + (1 - g) + op(F.vlak, 0.14, 0.22)) / 7.5; break;
        case 'dubstep': s = (0.4 + 0.6 * e) * (c.half * 2.5 + (1 - c.vier) * 2 + e * 2 + bij(B, 140, 0.15) * 1.5 + op(F.vlak, 0.12, 0.22) * af(F.subMid, 9, 16)) / 9; break;  // + growl in het midden
        case 'dnb':     s = (0.4 + 0.6 * e) * (c.back * 3 + (1 - c.vier) * 2 + e * 1.5 + bij(B, 174, 0.07) * 1.5 + op(F.perc, 1.5, 4) * 0.5) / 8.5; break;
        case 'hiphop':  s = (0.6 + 0.4 * e) * (0.4 + 0.6 * c.back) * (c.back * 3 + (1 - c.vier) * 1.5 + e * 2 + bij(B, 90, 0.2) * 3 + af(F.perc, 3, 5.5)) / 10.5; break;
        case 'afro':    s = (Math.max(c.sync, c.ksync) * 3 + op(F.perc, 3, 5.5) * 2.5 + bij(B, 110, 0.2) * 1.5 + (1 - g) + (1 - c.half) * 0.5) / 8.5; break;
        case 'lounge':  s = (1 - 0.4 * op(F.diep, 5, 12)) * (af(F.vlak, 0.08, 0.18) * 2 + af(F.subMid, 6, 11) + op(F.midHoog, 4, 12) * 1.5 + af(F.flux, 0.12, 0.22) + bij(B, 100, 0.25) + (1 - c.vier * op(F.subMid, 8, 14)) * 0.5) / 7; break;  // een diepe sinus-sub (30-50 Hz boven 80-130 Hz) is basmuziek, geen lounge
        case 'rock':    s = g * (c.back * 2.5 + bij(B, 125, 0.25) * 1.5 + af(F.kick, 4, 6) + (1 - c.vier) * 0.5) / 5.5; break;
        case 'metal':   s = g * (op(F.kick, 4.3, 5.5) * 3 + bij(B, 170, 0.35) + af(F.midHoog, 0, 5) + c.back * 0.5) / 5.5; break;
        case 'punk':    s = g * (c.back * 2.5 + bij(B, 182, 0.12) * 2 + af(F.kick, 4.3, 5.5) * 2) / 6.5; break;
      }
      c.s = s * c.fit;
    }
  }

  // --- oordeel: gladgestreken scores, pas wisselen als een andere stijl lang genoeg duidelijk wint ---
  const FAM = { house: 'vier', techno: 'vier', trance: 'vier', dubstep: 'bas', dnb: 'bas', hiphop: 'hiphop', afro: 'afro', lounge: 'lounge', rock: 'gitaar', metal: 'gitaar', punk: 'gitaar' };
  let herkend = 'onbekend', voorsprong = 0, geoordeeld = 0, fRef = 0, fAfwijk = 0, nieuwTempo = true, fGlad = 0, fSprong = 0;
  let zekerAuto = 0, bpmGlad = 120, laatstOordeel = -1;
  // stabiliteit (een set springt zelden binnen een minuut van genre):
  // vast = tellen dat de huidige stijl met hoge zekerheid won (max 256); hoe langer, hoe meer bewijs een wissel vraagt.
  // bpmVast = de BPM waarop de huidige stijl zeker stond: een uitdager op precies het halve/dubbele tempo (dubstep 140 ->
  // 'lounge 70') is bijna altijd dezelfde muziek. nieuwTempoTel: een tempowissel geeft maar een tijdje korting.
  let vast = 0, bpmVast = 0, nieuwTempoTel = 0, laatsteEis = null;
  const ingetogen = () => lvlT < 8 ? 0 : Math.max(op(lvlL - lvlK, 3, 7), op(hoogL - hoogK, 6, 12));
  function eis(best) {  // wat een wissel van herkend naar best vraagt: tellen voorsprong, zekerheid, scoremarge
    const kan = SCORE[best], extra = Math.min(64, vast / 2);
    const naarMosh = PRESETS[best].mosh && !PRESETS[herkend].mosh;
    const half = bpmVast > 0 && Math.abs(Math.abs(Math.log2(kan.B / bpmVast)) - 1) < 0.07;
    const halftime = PRESETS[herkend].halveTel || PRESETS[best].halveTel;
    let tel, z = naarMosh ? 0.6 : 0.5, marge = 0.06;
    if (half) { tel = (halftime ? 96 : 64) + extra; z = Math.max(z, 0.75); marge = 0.12; }
    else if (nieuwTempo) tel = 16 + extra / 2;
    else tel = 32 + extra;
    if (naarMosh) tel = Math.max(tel, 24);
    return { tel, z, marge, half };
  }
  function oordeel(t) {
    const dtO = laatstOordeel < 0 ? 0.5 : Math.min(2, t - laatstOordeel);
    laatstOordeel = t;
    // basistempo gladstrijken (sprongen pas na 2 s overnemen: een nieuw nummer)
    if (!fGlad) fGlad = F.f;
    const dF = Math.log2(F.f / fGlad);
    if (Math.abs(dF) > 0.03) { fSprong += dtO; if (fSprong >= 2) { fGlad = F.f; fSprong = 0; } } else { fSprong = 0; fGlad *= Math.pow(2, dF * 0.3); }
    const tellen = dtO * fGlad / 60;
    // ander tempo dan waar het oordeel op rust = waarschijnlijk een ander nummer: dan sneller wisselen
    if (!fRef) fRef = fGlad;
    if (Math.abs(Math.log2(fGlad / fRef)) > 0.05) { fAfwijk += tellen; if (fAfwijk >= 8) { nieuwTempo = true; nieuwTempoTel = 0; fRef = fGlad; fAfwijk = 0; for (const st of NAMEN) SCORE[st].glad *= 0.5; } }
    else { fAfwijk = 0; fRef *= Math.pow(fGlad / fRef, 0.05); }
    if (nieuwTempo && herkend !== 'onbekend' && (nieuwTempoTel += tellen) > 96) nieuwTempo = false;
    const a = 1 - Math.exp(-dtO / 3);
    let best = NAMEN[0], twee = NAMEN[1];
    for (const st of NAMEN) {
      const c = SCORE[st];
      c.glad += (c.s - c.glad) * a;
      if (c.glad > SCORE[best].glad) { twee = best; best = st; } else if (st !== best && c.glad > SCORE[twee].glad) twee = st;
    }
    geoordeeld += tellen;
    // zekerheid: voorsprong op de beste uit een andere familie (house/techno/trance lijken op elkaar en doen hetzelfde)
    let ander = 0;
    for (const st of NAMEN) if (FAM[st] !== FAM[best] && SCORE[st].glad > ander) ander = SCORE[st].glad;
    const gb = SCORE[best].glad, marge = Math.min(gb - ander, 2 * (gb - SCORE[twee].glad) + 0.06);
    const zeker = klem(marge / 0.12) * op(gb, 0.35, 0.6);
    if (best === herkend) {
      zekerAuto = zeker;
      if (zeker >= 0.6) {
        vast = Math.min(256, vast + tellen);
        if (!nieuwTempo && !fAfwijk && Math.abs(Math.log2(F.f / fRef)) < 0.03) bpmVast = SCORE[herkend].B;  // alleen bij rustig tempo
      }
    }
    // een moshpit in een house-set is erger dan een gemiste moshpit: naar een moshstijl vraagt meer bewijs
    const naarMosh = PRESETS[best].mosh && !PRESETS[herkend].mosh;
    laatsteEis = null;
    if (herkend === 'onbekend') {
      if (geoordeeld >= (naarMosh ? 24 : 16) && zeker >= (naarMosh ? 0.5 : 0.45)) wissel(best, t, 'auto', zeker);
    } else if (best !== herkend) {
      const E = laatsteEis = eis(best);
      if (gb - SCORE[herkend].glad > E.marge && zeker >= E.z) voorsprong += tellen; else voorsprong = 0;
      if (voorsprong >= E.tel) wissel(best, t, E.half ? 'half' : nieuwTempo ? 'tempo' : 'auto', zeker);
    } else voorsprong = 0;
    if (best !== herkend) zekerAuto = herkend === 'onbekend' ? 0 : klem((SCORE[herkend].glad - gb + 0.12) / 0.24) * op(SCORE[herkend].glad, 0.3, 0.55);  // een ander wint: twijfel
  }
  function wissel(st, t, door, zeker) {
    voorsprong = 0; nieuwTempo = false; fRef = fGlad;
    if (st === herkend) return;
    const van = herkend;
    herkend = st; zekerAuto = zeker; vast = 0; bpmVast = SCORE[st].B;
    if (ST.auto) zet(st, door, van, t);
  }

  // --- publiceren ---
  const NAAM_TEKST = { dnb: 'drum & bass', onbekend: '' };
  const tekst = n => n in NAAM_TEKST ? NAAM_TEKST[n] : n;
  let toonTot = 0, volgendeToon = 0;
  function meld() {
    try { W.dispatchEvent(new CustomEvent('clubstijl', { detail: ST })); } catch (e) {}
  }
  function zet(n, door, van, t) {
    const oud = ST.naam;
    ST.naam = n;
    ST.preset = PRESETS[n];
    bpmBij(true);
    if (oud !== n || door === 'hand') {
      ST.log.push({ t: Math.round(t != null ? t : nuS()), van: van != null ? van : oud, naar: n, bpm: ST.bpm, zeker: Math.round(ST.zeker * 100) / 100, auto: ST.auto, door });
      if (ST.log.length > 40) ST.log.shift();
      toonTot = nuS() + 6; volgendeToon = toonTot + 75 + Math.random() * 45;
      meld();
    }
  }
  function kies(n) {  // handmatig: een stijlnaam, of 'auto' = weer de herkenning volgen
    if (n === 'auto') {
      ST.auto = true;
      zet(herkend, 'hand');
    } else if (PRESETS[n]) {
      ST.auto = false;
      zet(n, 'hand');
    } else return;
    if (typeof S !== 'undefined' && typeof save === 'function') { S.stijl = n; save(); }
    toonKeuze(true);
  }
  // BPM van de stijl: het basistempo in de octaaf van die stijl; onbekend = eigen tempo tussen 85 en 170, zonder meting de beatvolger
  const hulp = { B: 120, fit: 0 };
  let halfOnb = false;
  const gemeten = () => F.kracht >= 0.2 && gevuld >= 300;  // eigen tempometing staat
  function bpmBij(direct) {
    let b;
    const n = ST.naam, isLive = typeof live === 'undefined' ? true : live;
    if (gemeten() && isLive) {
      if (n !== 'onbekend') { octaaf(fGlad || F.f, n, hulp); b = hulp.B; }
      else b = F.f < 85 ? F.f * 2 : F.f;  // nog geen stijl: eigen tempo (85-170)
    } else if (isLive && fGlad && n !== 'onbekend') {  // break of rommelig stuk: het laatst gemeten tempo houden
      octaaf(fGlad, n, hulp); b = hulp.B;
    } else if (!isLive || gevuld >= 300) {  // demo-beat, of muziek zonder duidelijk ritme: de beatvolger (bij een stijl in diens octaaf als dat past)
      b = typeof period === 'number' && period > 0 ? 60 / period : 120;
      if (n !== 'onbekend') { octaaf(vouw(b), n, hulp); if (hulp.fit > 0) b = hulp.B; }
    } else b = bpmGlad;  // net muziek: de eerste 6 s het oude getal houden (de beatvolger zwalkt dan nog)
    bpmGlad = direct ? b : bpmGlad + (b - bpmGlad) * 0.25;
    if (direct || Math.abs(bpmGlad - ST.bpm) >= 0.8) ST.bpm = Math.round(bpmGlad);
    if (n === 'onbekend' && gevuld >= 300) {  // oude gedrag: halve tel boven ~126 BPM (zoals dansgevoel); pas na 6 s geluid
      const h = halfOnb ? ST.bpm > 123 : ST.bpm >= 127;
      if (h !== halfOnb) { halfOnb = h; PRESETS.onbekend.halveTel = h; if (!direct) meld(); }
    }
    ST.voel = ST.preset.halveTel ? ST.bpm / 2 : ST.bpm;
    ST.zeker = ST.auto ? zekerAuto : 1;
  }

  // --- per beeld: AnalyserNode uitlezen (zonder pc-geluid), analyse in stukjes, label ---
  let anBron = null, an = null, anDb = null, anP = null, anBins = null, anVlak = null;
  const db12 = new Float32Array(NB);
  function leesAnalyser(t) {
    if (typeof analyser === 'undefined' || !analyser || typeof source === 'undefined' || !source || typeof ctx === 'undefined' || !ctx) return;
    if (anBron !== source) {  // eigen analyser op dezelfde bron: zonder smoothing (scherpe aanslagen) en in float-dB
      try {
        an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0; source.connect(an); anBron = source;
        anDb = new Float32Array(an.frequencyBinCount); anP = new Float32Array(an.frequencyBinCount);
        const hz = ctx.sampleRate / an.fftSize;
        anBins = [];
        for (let k = 0; k < NB; k++) {
          const lo = 30 * Math.pow(400, k / 12), hi = 30 * Math.pow(400, (k + 1) / 12);
          let i0 = Math.ceil(lo / hz), i1 = Math.ceil(hi / hz) - 1;
          if (i1 < i0) i0 = i1 = Math.round(Math.sqrt(lo * hi) / hz);
          anBins.push(i0, Math.min(an.frequencyBinCount - 1, i1));
        }
        anVlak = [Math.ceil(300 / hz), Math.ceil(3000 / hz) - 1];
      } catch (e) { an = null; anBron = source; return; }
    }
    if (!an) return;
    an.getFloatFrequencyData(anDb);
    const top = anBins[NB * 2 - 1];
    for (let i = 1; i <= top; i++) { const d = anDb[i]; anP[i] = d > -200 ? Math.pow(10, d / 10) : 0; }
    for (let k = 0; k < NB; k++) {
      let s = 0;
      for (let i = anBins[2 * k]; i <= anBins[2 * k + 1]; i++) s += anP[i];
      db12[k] = s > 0 ? 10 * Math.log10(s) : -200;
    }
    let lg = 0, ar = 0, n = 0;
    for (let i = anVlak[0]; i <= anVlak[1]; i++) { const p = anP[i] + 1e-20; lg += Math.log(p); ar += p; n++; }
    voed(db12, n ? Math.exp(lg / n) / (ar / n) : null, t);
  }

  let fase = 0, volgendeAnalyse = 0, naBreak = false, laatstTempo = 0;
  function stap(dt, t) {
    const isNative = typeof native !== 'undefined' && native;
    if (!isNative) leesAnalyser(t);
    const isLive = typeof live === 'undefined' ? true : live;
    const vers = tLaatst > 0 && t - tLaatst < 2 && !stilSinds;
    if (fase === 0 && t >= volgendeAnalyse && isLive && vers && gevuld >= 300) { acf(rAll, acAll); tempo(t - laatstTempo); laatstTempo = t; fase = 1; }
    else if (fase === 1) { acf(rLow, acLow); fase = 2; }
    else if (fase === 2) { acf(rSnr, acSnr); fase = 3; }
    else if (fase === 3) {
      acf(rPerc, acPerc); scoren(); fase = 0; volgendeAnalyse = t + 0.5;
      // na een break of opbouw nog 12 tellen niet oordelen: het venster van 10 s bevat dan nog de break
      const R = W.clubRegie, tb = typeof beatPos === 'number' ? beatPos : 0;
      let pauze = false;
      if (R) {
        if (R.stand === 'break' || R.stand === 'opbouw') { pauze = true; naBreak = true; }
        else if (naBreak) { if (tb - R.sinds >= 12 || tb < R.sinds) naBreak = false; else pauze = true; }
      }
      const stabiel = Math.abs(Math.log2(tempoNu / F.f)) < 0.04;  // deze meting en het gemiddelde zijn het eens
      // kaal/ingetogen stuk (alleen sub en een snare, duidelijk zachter en minder hoog dan de volle delen): net als een break
      // niets bijleren, anders wordt een kale dubstep-passage 'lounge'
      if (!pauze && F.kracht >= 0.2 && stabiel && ingetogen() < 0.5) oordeel(t); else laatstOordeel = -1;
    }
    bpmBij(false);
    label(t);
  }

  // --- label rechtsonder en keuzemenu in de balk ---
  let lab = null, labT = null, labAuto = null, labNaam = '', labBpm = 0, sel = null, selTekst = '', selT = 0;
  let wasLive = false;
  function label(t) {
    if (!lab) return;
    const isLive = typeof live === 'undefined' ? true : live;
    if (!wasLive && isLive && gemeten()) {  // eerste tempometing: een handmatige stijl dan één keer tonen
      wasLive = true;
      if (!ST.auto) { toonTot = t + 6; volgendeToon = t + 75 + Math.random() * 45; }
    }
    if (isLive && t > volgendeToon && volgendeToon > 0) { toonTot = t + 3; volgendeToon = t + 75 + Math.random() * 45; }
    const aan = t < toonTot;
    if (aan !== lab.classList.contains('aan')) lab.classList.toggle('aan', aan);
    if (aan) {
      if (ST.naam !== labNaam || ST.bpm !== labBpm) {  // alleen bij een ander getal een nieuwe tekst
        labNaam = ST.naam; labBpm = ST.bpm;
        const n = tekst(labNaam);
        labT.textContent = (n ? n + ' · ' : '') + labBpm + ' BPM';
      }
      const ad = ST.auto ? '' : 'none';
      if (labAuto.style.display !== ad) labAuto.style.display = ad;
    }
    if (t - selT > 1) { selT = t; toonKeuze(false); }
  }
  function toonKeuze(ook) {
    if (!sel) return;
    const h = tekst(herkend), s = 'Stijl: auto (' + (h ? h + ' ' : '') + ST.bpm + (h ? '' : ' BPM') + ')';
    if (s !== selTekst) sel.options[0].text = selTekst = s;
    if (ook) sel.value = ST.auto ? 'auto' : ST.naam;
  }
  if (typeof document !== 'undefined' && document.body) {
    const css = document.createElement('style');
    css.textContent = `
      #stijlLabel { position: fixed; right: 18px; bottom: 16px; z-index: 5; pointer-events: none; white-space: nowrap;
                    font: 600 12px/1 "Helvetica Neue", Arial, sans-serif; letter-spacing: .28em; text-transform: uppercase;
                    color: rgba(255,255,255,.82); text-shadow: 0 0 8px rgba(0,0,0,.9), 0 0 2px rgba(0,0,0,.9); opacity: 0; transition: opacity 1.2s; }
      #stijlLabel.aan { opacity: 1; }
      #stijlLabel small { font-size: 9px; letter-spacing: .18em; opacity: .65; margin-left: .9em; padding: 1px 4px 2px;
                          border: 1px solid rgba(255,255,255,.45); border-radius: 3px; vertical-align: 1px; }`;
    document.head.appendChild(css);
    lab = document.createElement('div'); lab.id = 'stijlLabel';
    labT = document.createElement('span'); labAuto = document.createElement('small'); labAuto.textContent = 'auto';
    lab.append(labT, labAuto);
    document.body.appendChild(lab);
    sel = document.getElementById('stijl');
    if (!sel && document.getElementById('ui')) {  // index.html zonder de regel in de balk: zelf toevoegen
      sel = document.createElement('select'); sel.id = 'stijl'; sel.add(new Option('Stijl: auto', 'auto'));
      document.getElementById('ui').insertBefore(sel, document.getElementById('btnFull'));
    }
    if (sel) {
      for (const n of NAMEN) sel.add(new Option('Stijl: ' + tekst(n), n));
      sel.onchange = () => kies(sel.value);
    }
  }
  if (typeof clubHooks !== 'undefined') clubHooks.push(stap);
  // bewaarde keuze terug (zonder opnieuw te bewaren)
  if (typeof S !== 'undefined' && S.stijl && S.stijl !== 'auto' && PRESETS[S.stijl]) { ST.auto = false; ST.naam = S.stijl; ST.preset = PRESETS[S.stijl]; }
  bpmBij(true);
  toonKeuze(true);

  // --- test en meten ---
  ST._voed = voed;
  ST._stap = stap;
  ST.herkenning = () => herkend;
  ST.info = () => {
    const sc = {};
    for (const st of NAMEN) { const c = SCORE[st]; sc[st] = { bpm: Math.round(c.B * 10) / 10, s: Math.round(c.s * 100) / 100, glad: Math.round(c.glad * 100) / 100, vier: +c.vier.toFixed(2), back: +c.back.toFixed(2), half: +c.half.toFixed(2), sync: +c.sync.toFixed(2), ksync: +c.ksync.toFixed(2) }; }
    const f = {};
    for (const k in F) f[k] = Math.round(F[k] * 100) / 100;
    const E = laatsteEis;
    const extra = 'vast ' + Math.round(vast) + ' kaal ' + ingetogen().toFixed(2) + ' (niv -' + Math.max(0, lvlL - lvlK).toFixed(1) + ' hoog -' + Math.max(0, hoogL - hoogK).toFixed(1) + ' dB)' + (E ? ' eis ' + Math.round(E.tel) + 't z' + E.z + (E.half ? ' half' : '') : '');
    return { naam: ST.naam, herkend, auto: ST.auto, bpm: ST.bpm, voel: ST.voel, zeker: Math.round(ST.zeker * 100) / 100, voorsprong: Math.round(voorsprong), nieuwTempo, vast: Math.round(vast), kaal: +ingetogen().toFixed(2), extra, F: f, score: sc, blokken: spIn };
  };
})();

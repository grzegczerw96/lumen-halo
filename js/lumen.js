// Strona Lumen Halo: jedno płótno 3D przypięte za treścią. Słuchawki przechodzą przez sekcje według stanu „rig”
// (położenie, obrót, skala, przemiana w piórko), który jest jedną funkcją miejsca na stronie (scrollState).
// Ten plik to rdzeń: przypięcia sekcji, teksty, kolory tła, menu i konfigurator, bez three.js. Część 3D (lumen-3d.js)
// wczytuje się dopiero po starcie strony, bo na pierwszym ekranie jest samo zdjęcie: strona szybciej się pokazuje
// i nie zacina się przy pierwszym przewinięciu.
import { PALETTES } from './palettes.js';

gsap.registerPlugin(ScrollTrigger);
// ograniczony ruch (ustawienie systemu „Efekty animacji”); ?reduce w adresie wymusza go do sprawdzenia
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || location.search.includes('reduce');
// sam ekran dotykowy (telefon, tablet): przewijanie przejmuje skrypt (ScrollTrigger.normalizeScroll), więc sekcje, napisy
// i model jadą w tej samej klatce, a pasek adresu nie chowa się w trakcie (inaczej zmienia się wysokość okna)
const touch = ScrollTrigger.isTouch === 1;
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a) * t, degToRad = (d) => d * Math.PI / 180;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const io = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2); // power2.inOut
const seg = (y, a, b) => clamp((y - a) / (b - a), 0, 1);
// teksty idą dokładnie za przewijaniem (wygładza je Lenis), więc nie rozjeżdżają się z modelem przy szybkim przewijaniu
const SCRUB = true;
const canvas = $('#stage'), backdrop = $('.backdrop');

// ---------- Kolory (interpolacja w przestrzeni liniowej, jak wcześniej w three.js) ----------
const toLin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v) => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const lin = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(toLin); };
const mixCol = (a, b, t) => { const A = lin(a), B = lin(b); return A.map((v, i) => Math.round(clamp(toSrgb(lerp(v, B[i], t)), 0, 255)).toString(16).padStart(2, '0')).join(''); };
const luma = (h) => { const [r, g, b] = lin(h); return r * 0.3 + g * 0.59 + b * 0.11; };
const mixStops = (stops, h) => { // interpolacja kolorów wg godziny
  let i = 0; while (i < stops.length - 2 && h > stops[i + 1][0]) i++;
  const [h0, a] = stops[i], [h1, b] = stops[i + 1];
  return mixCol(a, b, clamp((h - h0) / (h1 - h0), 0, 1));
};

// ---------- Układ i ujęcia ----------
// Ujęcia są funkcjami, bo zależą od proporcji ekranu (telefon: model nad tekstem, mniejszy).
const MODEL_H = 3.65, FL = 5; // wysokość modelu i długość piórka w jednostkach sceny
const L = { mobile: false, compact: false, dist: 13, aspect: 1 };
const halfH = () => L.dist * Math.tan(degToRad(15));
const halfW = () => halfH() * L.aspect;
const BASE = { px: 0, py: 0, pz: 0, rx: 0.08, ry: -0.9, rz: 0, s: 0.9, camY: 0.6, camTY: 0, bob: 1, sway: 0, alpha: 1 };
const pose = (o) => ({ ...BASE, ...o });
// Telefon: model mieści się w wolnym pasie między tekstami. Pas jest liczony z położenia elementów w sekcji
// (sekcja przypięta stoi u góry ekranu), więc działa przy każdej wysokości tekstu i ekranu.
const rel = (sel, sec) => { const r = $(sel).getBoundingClientRect(), s = $(sec).getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top - s.top, bottom: r.bottom - s.top }; };
const fitIn = (top, bottom, maxS, hk = 1) => {
  const H2 = 2 * halfH(), span = Math.max(bottom - top, 80), mid = (top + bottom) / 2 / innerHeight;
  return { py: (0.5 - mid) * H2, s: Math.min(maxS, span / innerHeight * H2 * 0.9 / (MODEL_H * hk)) };
};
// Model w wolnym prostokącie (w pikselach): środek i skala tak, żeby zmieścił się na wysokość i szerokość.
// hk, wk: wysokość i szerokość modelu w danym ujęciu jako ułamek MODEL_H (leżący jest niższy i szerszy).
const fitRect = (r, maxS, hk = 1, wk = 0.85) => {
  const H2 = 2 * halfH(), W2 = 2 * halfW();
  const sH = (r.bottom - r.top) / innerHeight * H2 * 0.9 / (MODEL_H * hk), sW = (r.right - r.left) / innerWidth * W2 * 0.9 / (MODEL_H * wk);
  return { px: ((r.left + r.right) / 2 / innerWidth - 0.5) * W2, py: (0.5 - (r.top + r.bottom) / 2 / innerHeight) * H2, s: Math.min(maxS, sH, sW) };
};
const LP_MOB_H = 210; // pas na dole ekranu (tablet, telefon) na opis cechy i pasek stanu
const KON_R = [0.08, -0.75]; // obrót słuchawek w Kontakcie (jak w ofercie)
const P = {
  // Anatomia (lupa): duży model na środku smugi światła, ok. 58% wysokości ekranu; zbliżenia detali stoją wokół
  an: () => {
    // model w wolnym pasie pod tytułem (z zapasem, bo przy ujęciu pałąka model pochyla się do przodu i rośnie w górę);
    // tablet i telefon: nad opisem z paskiem stanu, a kamera stoi dalej, więc skala może być większa
    const top = rel('.anat-head', '#design').bottom + 48;
    const f = L.compact ? fitIn(top, innerHeight - LP_MOB_H, 2.4) : fitIn(top, innerHeight - 32, 1.1);
    return pose({ py: f.py, rx: 0.12, ry: -0.9, s: f.s });
  },
  // obrót, w którym powstaje piórko (finał): ten sam co w Kontakcie, bo tam słuchawki rozsypują się w piórko
  lek: () => pose({ rx: KON_R[0], ry: KON_R[1] }),
  kol: () => {
    // model w lewej kolumnie (komputer) albo w pasie nad konfiguratorem (tablet, telefon)
    const r = rel('#spin', '#konfiguracja'), f = L.mobile ? fitRect(r, 2.4, 1, 0.8) : fitRect({ ...r, bottom: r.bottom - 22 }, 1.2, 1.15, 0.8); // telefon i tablet: bez podpisu „Przeciągnij” pod modelem
    return pose({ px: f.px, py: f.py, ry: -0.75, s: f.s, sway: 1 }); // na białym tle model powoli kołysze się na boki
  },
  day: () => {
    // komputer: prawa część ekranu nad osią czasu; tablet i telefon: wolne miejsce między tytułem a zegarem
    // telefon: opis nad zegarem ma stałą wysokość dwóch linii (CSS), więc model kończy się 24 px nad nim, bez dodatkowego zapasu
    const h = rel('.day .h2', '#uzytkowanie'), c = rel('.clock', '#uzytkowanie'), t = rel('.track', '#uzytkowanie'), pad = parseFloat(getComputedStyle($('.day')).paddingLeft);
    const r = L.mobile ? { left: pad, right: innerWidth - pad, top: h.bottom + 20, bottom: c.top - 24 }
      : { left: innerWidth * 0.55, right: innerWidth - pad, top: 76, bottom: t.top - 24 }; // tytuł i zegar zajmują lewą część (ok. 40% szerokości)
    const f = fitRect(r, 1.1, 1, 0.85);
    return pose({ px: f.px, py: f.py, rx: 0.14, s: f.s });
  },
  // Dane: komputer — lewa kolumna; tablet, telefon — między tytułem a wierszami. Liczone dla rozłożonego modelu (szerszy i wyższy).
  dane: () => { const f = fitRect(rel('#dane-lane', '#dane'), L.mobile ? 2.4 : 1.4, 1.3, 1.25); return pose({ px: f.px, py: f.py, rx: 0.12, ry: -0.6, s: f.s, bob: 0.5 }); },
  // Kontakt: złożony model w swoim miejscu (komputer: lewa kolumna, tablet i telefon: obok tytułu)
  kon: () => { const f = fitRect(rel('#kon-lane', '#kontakt'), L.mobile ? 2.4 : 1.2, 1.05, 0.9); return pose({ px: f.px, py: f.py, rx: KON_R[0], ry: KON_R[1], s: f.s }); },
};
const KEYS = Object.keys(BASE);
const rig = { ...BASE, wave: 0, vis: 1, ent: 0 }; // vis: zanikanie przy przenosinach modelu między sekcjami
const drag = { x: 0, y: 0 };
const appear = { v: 0 }; // płótno pojawia się łagodnie, gdy 3D jest gotowe

let G = null; // część 3D (lumen-3d.js), gdy się wczyta
function layout() {
  const w = innerWidth, h = innerHeight, a = w / h;
  L.mobile = w <= 560 || a < 5 / 6; // ten sam próg co w CSS
  L.compact = L.mobile || w < 1100;  // tablet i telefon: Anatomia bez zbliżeń, opis z paskiem stanu w rogu
  L.dist = a < 1.15 ? 13 * 1.15 / Math.max(a, 0.46) * (L.mobile ? 0.82 : 1) : 13;
  L.aspect = a;
  document.documentElement.classList.toggle('compact', L.compact);
  lastLight = '';
  if (G) G.resize();
}
// ---------- Start i Anatomia: zdjęcie gaśnie, zostaje smuga światła, a w niej pojawiają się słuchawki ----------
// Start to zdjęcie (warstwa .photo). Przy przewijaniu najpierw gaśnie tekst, potem zdjęcie, a pod koniec pojawia się
// wąska, miękka smuga światła (.light) i tytuł Anatomii. Słuchawki wyostrzają się w smudze jak w obiektywie.
const ANAT_BG = '#e9e8e5';
const photoEl = $('.photo'), lightEl = $('.light');
let lastLight = '';
function setLight(a, photo) {
  const key = a.toFixed(3) + photo.toFixed(3);
  if (key === lastLight) return;
  lastLight = key;
  lightEl.style.visibility = a > 0.002 ? 'visible' : 'hidden';
  lightEl.style.opacity = a;
  photoEl.style.visibility = photo > 0.002 ? 'visible' : 'hidden';
  photoEl.style.opacity = photo;
}

// e: postęp wejścia 0–1. Słuchawki przechodzą z rozmycia do ostrości i lekko dokręcają do pierwszego ujęcia.
let lastBlur = '';
function setEntrance(e) {
  const blur = e < 1 ? `blur(${(28 * (1 - smooth(e)) ** 1.5).toFixed(1)}px)` : '';
  if (blur !== lastBlur) { canvas.style.filter = blur; lastBlur = blur; }
  return { a: smooth(seg(e, 0, 0.6)), turn: -0.35 * (1 - io(e)) }; // start jak dotąd (ry −0,8), potem obrót do środka, do pierwszej cechy
}

// ---------- Stan zależny od miejsca na stronie ----------
// Położenie i obrót modelu, przemiana w piórko, zanikanie i kolor tła są jedną funkcją pozycji przewijania
// (a nie osobnymi animacjami w każdej sekcji). Wszystko liczy się z jednej wartości: przewinięcia strony (wygładza je Lenis),
// tej samej, z którą jadą sekcje i teksty. Dzięki temu skok w dowolne miejsce daje właściwe ujęcie, model nie zostaje
// w tyle przy szybkim przewijaniu i nic nie przeskakuje na granicach sekcji.
// Dzień: bloki słuchania (godziny od-do), bateria 40 h z ANC
const BLOCKS = [[7.5, 8.5, 'Dojazd', 'redukcja szumów włączona'], [9, 12, 'Praca w skupieniu', 'trzy godziny bez przerwy'], [13, 14, 'Spacer', 'tryb przezroczysty'], [20, 22.5, 'Wieczór z muzyką', 'najdłuższa sesja dnia']];
const BG_DAY = [[7, '#eef1f4'], [11, '#f5f2ec'], [15, '#f3ede4'], [18.5, '#ecd9c4'], [20, '#5d5049'], [21, '#232226'], [23, '#161618']];

const B = {};            // granice sekcji w pikselach przewijania
let POSES = null;        // ujęcia policzone dla bieżącego rozmiaru ekranu
function measure() {
  const g = (id) => ScrollTrigger.getById(id);
  Object.assign(B, { hE: g('hero').end, dS: g('design').start, dE: g('design').end, kS: g('kol').start, kE: g('kol').end, yS: g('day').start, yE: g('day').end,
    nS: g('dane').start, nE: g('dane').end, cS: g('kon').start, cE: g('kon').end, end: ScrollTrigger.maxScroll(window) });
  POSES = Object.fromEntries(Object.keys(P).map((k) => [k, P[k]()]));
  // cień w Konfiguracji: tuż pod dolną krawędzią modelu (liczoną z ujęcia), a nie w stałym miejscu sekcji
  const k = POSES.kol, u = innerHeight / (2 * halfH()), r = rel('#spin', '#konfiguracja');
  spinEl.style.setProperty('--sh-y', ((0.5 - k.py / (2 * halfH())) * innerHeight + 0.47 * MODEL_H * k.s * u - r.top).toFixed(0) + 'px');
  if (G) G.measure();
}
const AN_0 = 0.8, AN_U = AN_0 + 5;
// ujęcie dla każdej cechy (obrót wokół osi pionowej i pochylenie): opisywana część zwrócona do widza.
// Kolejność jak w opisach: poduszki (przez szczelinę między muszlami), pierścień, ceramika, pałąk (lekko z góry),
// ramię (pełny obrót w drugą stronę, do lewej muszli)
const FEAT_ROT = [[-0.45, 0.1], [-1.15, 0.12], [-1.45, 0.06], [-0.7, 0.32], [1.0, 0.12]];
const featPose = (i) => ({ ...POSES.an, ry: FEAT_ROT[i][0], rx: FEAT_ROT[i][1] }); // Anatomia: dokończenie wejścia słuchawek, potem 5 cech po 1 jednostce
const mixPose = (a, b, t) => Object.fromEntries(KEYS.map((k) => [k, lerp(a[k], b[k], t)]));

// ride: ujęcie przesunięte razem z sekcją o dy pikseli przewinięcia (w górę, gdy dy > 0)
const ride = (p, dy) => ({ ...p, py: p.py + dy * 2 * halfH() / innerHeight });
// Lądowanie piórka: punkt na górnej krawędzi „Halo” (w telefonie „Lumen”) w stopce. Piórko ma tam stałą szerokość
// względem ekranu; środek piórka względem środka słuchawek (G.featherOff) liczy część 3D po zbudowaniu piórka.
const landEl = $('#land');
// featherAt: ujęcie, w którym środek piórka stoi w punkcie ekranu (x, y), a piórko ma szerokość w pikseli
function featherAt(x, y, w) {
  const W = innerWidth, H = innerHeight, o = G.featherOff, s = w / W * 2 * halfW() / (FL * G.featherScale);
  return pose({ px: (x / W - 0.5) * 2 * halfW() - o.x * s, py: (0.5 - y / H) * 2 * halfH() - o.y * s, rx: KON_R[0], ry: KON_R[1], s, bob: 0 });
}
// miejsce lądowania: środek piórka nad górną krawędzią liter (piórko na nich leży), szerokość względem ekranu
function landSpot() {
  const r = landEl.getBoundingClientRect();
  let w = innerWidth * (!L.mobile ? 0.34 : innerWidth <= 560 ? 0.52 : 0.42);
  // niskie ekrany: piórko (wysokie na ok. 0,45 szerokości) mieści się między odnośnikami stopki a napisem, z zapasem 16 px
  const room = r.top - footTopEl.getBoundingClientRect().bottom; // wolny pas między odnośnikami (z e-mailem) a napisem
  if (!L.mobile) w = Math.min(w, (room - 16) / 0.45);
  return { x: r.left, y: r.top - G.featherOff.h * w, w, room };
}
// piórko, które właśnie powstało w miejscu modelu w Kontakcie (komputer: w lewej kolumnie)
function laneSpot() {
  // tablet i telefon: miejsce obok tytułu jest małe, więc piórko ma jego szerokość (pełną dostaje dopiero nad stopką)
  const r = $('#kon-lane').getBoundingClientRect(), w = r.width * (L.mobile ? 0.78 : 0.62); // na początku mniejsze, rośnie przy opadaniu
  // tablet i telefon: przy prawej krawędzi miejsca, jak najdalej od tytułu
  return { x: L.mobile ? Math.min(r.right - w * 0.5, innerWidth - w * 0.55) : r.left + r.width / 2, y: r.top + r.height / 2, w };
}
const lanePose = () => { const l = laneSpot(); return featherAt(l.x, l.y, l.w); };
// pusty pas między dołem formularza Kontaktu a odnośnikami stopki: tędy piórko przechodzi w bok (komputer)
const kformEl = $('#kform'), footTopEl = $('.foot-top'), footColsEl = $('.foot-cols'), footMailEl = $('.foot-mail');
const band = () => { const a = kformEl.getBoundingClientRect().bottom, b = footTopEl.getBoundingClientRect().top; return { y: (a + b) / 2, h: b - a }; };
const featherReady = () => G && G.dust && G.featherOff;

function scrollState(y) {
  const S = { wave: 0, vis: 1, bg: null, day: 23, dayMix: 0, clock: null, lp: 0, lpV: 0, ent: 1, light: 0, photo: 0, col: 0, white: 1, spin: 1, e: 0, dane: 0, top: false, land: 0 };
  // wejście słuchawek: razem z pojawianiem się tytułu (od 0,6 Startu) do połowy pierwszej jednostki przypiętej Anatomii
  const ent = seg(y, B.hE * 0.6, B.dS + (B.dE - B.dS) / AN_U * 0.5);
  const u = innerHeight / (2 * halfH()); // pikseli na jednostkę sceny
  if (y < B.dS) {
    // Start (przypięty): najpierw gaśnie tekst (oś czasu), potem zdjęcie, a pod koniec pojawia się smuga światła
    // i tytuł Anatomii (pętla); potem sekcja Anatomia dojeżdża pod stojący już tytuł.
    const t = seg(y, 0, B.hE);
    S.pose = featPose(0); S.ent = ent; // ustawienie jak przy pierwszej cesze
    S.photo = 1 - smooth(seg(t, 0.3, 0.72));
    S.light = 0.85 * smooth(seg(t, 0.55, 1));
    S.bg = mixCol('#efebe5', ANAT_BG, seg(t, 0.3, 0.72));
  }
  else if (y <= B.dE) {
    // Anatomia (lupa): zbliżenia pojawiają się, gdy model jest już ostry, potem 5 cech od AN_0 po jednej jednostce;
    // model stoi na środku i tylko lekko się obraca
    const k = seg(y, B.dS, B.dE) * AN_U, v = k - AN_0;
    S.ent = ent;
    S.light = 0.85 * (1 - seg(k, AN_U - 0.25, AN_U));
    S.bg = ANAT_BG.slice(1);
    // obrót zgrany z cechami: model obraca się do następnego ujęcia, gdy jedna cecha gaśnie, a następna się pojawia
    // obrót trwa dłużej niż zmiana opisu (od połowy jednej cechy do początku następnej), więc jest łagodny
    let f = 0; for (let j = 0; j < 4; j++) f += io(seg(v, j + 0.5, j + 1.2));
    const j = Math.min(3, Math.floor(f));
    S.pose = mixPose(featPose(j), featPose(j + 1), f - j);
    S.lp = smooth(seg(v, -0.45, -0.05)) * (1 - smooth(seg(k, AN_U - 0.35, AN_U - 0.12)));
    S.lpV = v;
  }
  // Anatomia → oferta: model przesuwa się do kolumny konfiguratora i lekko dokręca, tło przechodzi w białe
  // (model dochodzi do swojej kolumny, zanim wjedzie tekst)
  else if (y < B.kS) { const t = seg(y, B.dE, B.kS); S.pose = mixPose(featPose(4), POSES.kol, io(Math.min(1, t * 1.8))); S.bg = mixCol(ANAT_BG, '#ffffff', t); S.white = 1 - t; S.spin = smooth(seg(t, 0.72, 1)); } // cień pod modelem dopiero, gdy model dojedzie (wcześniej najeżdżał na wjeżdżające słuchawki)
  else if (y <= B.kE) {
    // Konfiguracja (przypięta): kolor idzie za przewijaniem, z postojem na każdym (Kreda, Piasek, Grafit)
    const p = seg(y, B.kS, B.kE);
    S.pose = POSES.kol; S.bg = 'ffffff'; S.white = 0;
    S.col = io(seg(p, 0.15, 0.35)) + io(seg(p, 0.5, 0.7));
  }
  else if (y < B.yS) {
    // Konfiguracja → Użytkowanie. Model jedzie w górę razem ze swoją sekcją, obraca się, przechodzi w biel i gaśnie
    // razem z cieniem i podpisem; w Użytkowaniu pojawia się dopiero, gdy jego sekcja prawie dojechała, i wjeżdża razem z nią.
    // Światło przechodzi w poranne, gdy modelu nie widać.
    const t = seg(y, B.kE, B.yS);
    const out = 1 - smooth(seg(t, 0.12, 0.42)), inn = smooth(seg(t, 0.62, 0.92));
    S.pose = t < 0.5 ? ride(POSES.kol, y - B.kE) : ride(POSES.day, -(B.yS - y));
    S.pose.ry += io(t) * Math.PI;
    S.vis = t < 0.5 ? out : inn; S.spin = out;
    S.bg = mixCol('#ffffff', BG_DAY[0][1], t);
    S.col = 2; S.white = smooth(seg(t, 0, 0.4));
    S.day = 7; S.dayMix = smooth(seg(t, 0.4, 0.62));
  }
  else if (y <= B.yE) {
    const k = seg(y, B.yS, B.yE);
    S.pose = { ...POSES.day, ry: POSES.day.ry + Math.PI + k * Math.PI * 2 };
    S.day = S.clock = lerp(7, 23, smooth((k - 0.04) / 0.76)); S.dayMix = 1;
    S.bg = mixStops(BG_DAY, S.day);
  }
  else if (y < B.nS) {
    // Użytkowanie → Dane („świt”): tło jaśnieje, a światło na modelu razem z nim (z nocnego na dzienne), model jedzie
    // w górę razem z Użytkowaniem. Komputer: wyjeżdża z nim za ekran i wlatuje do Danych w ich przypiętej części, zanim
    // pojawi się tekst. Tablet, telefon: gaśnie w połowie drogi i pojawia się już w swoim miejscu w Danych.
    const t = seg(y, B.yE, B.nS), dayEnd = { ...POSES.day, ry: POSES.day.ry + Math.PI };
    const dawn = smooth(seg(t, 0.1, 0.9));
    S.bg = mixCol(BG_DAY[BG_DAY.length - 1][1], '#ffffff', dawn);
    S.day = 23; S.dayMix = 1 - dawn;
    if (!L.mobile || t < 0.5) { S.pose = ride(dayEnd, y - B.yE); if (L.mobile) S.vis = 1 - smooth(seg(t, 0.12, 0.42)); }
    else { S.pose = ride(POSES.dane, -(B.nS - y)); S.vis = smooth(seg(t, 0.62, 0.92)); }
  }
  else if (y <= B.nE) {
    // Dane (przypięte): przelot do lewej kolumny (komputer), rozłożenie na części, chwila postoju, złożenie
    const p = seg(y, B.nS, B.nE), dayEnd = { ...POSES.day, ry: POSES.day.ry + Math.PI };
    S.e = io(seg(p, 0.27, 0.6)) * (1 - io(seg(p, 0.82, 0.96)));
    const at = { ...POSES.dane, ry: lerp(POSES.dane.ry, -0.35, S.e), rx: lerp(0.12, 0.14, S.e) };
    const fly = L.mobile ? 1 : io(seg(p, 0, 0.26)); // przelot na ok. ćwierć przypięcia: łagodny, bez szarpnięcia
    S.pose = fly < 1 ? mixPose(ride(dayEnd, B.nS - B.yE), at, fly) : at; // start dokładnie tam, gdzie skończył się przejazd
    S.dane = p; S.bg = 'ffffff';
  }
  else if (y < B.cS) {
    // Dane → Kontakt. Komputer: lewa kolumna jest miejscem modelu w obu sekcjach, więc model zostaje i tylko się zmniejsza,
    // a prawa kolumna się wymienia. Tablet, telefon: model jedzie z Danymi, gaśnie i pojawia się obok tytułu Kontaktu.
    const t = seg(y, B.nE, B.cS);
    if (!L.mobile) S.pose = mixPose(POSES.dane, POSES.kon, io(t));
    else if (t < 0.5) { S.pose = ride(POSES.dane, y - B.nE); S.vis = 1 - smooth(seg(t, 0.12, 0.42)); }
    else { S.pose = ride(POSES.kon, -(B.cS - y)); S.vis = smooth(seg(t, 0.62, 0.92)); }
    S.dane = 1; S.bg = 'ffffff';
  }
  else if (y <= B.cE) {
    // Kontakt (przypięty): słuchawki jeszcze chwilę zostają na swoim miejscu i przy przewijaniu kołyszą się w lewo
    // i w prawo, a potem w tym samym miejscu rozsypują się w szare drobinki, które składają się w piórko.
    const p = seg(y, B.cS, B.cE), sw = Math.sin(seg(p, 0, 0.5) * Math.PI * 2);
    const k = { ...POSES.kon, ry: POSES.kon.ry + 0.32 * sw, rz: -0.06 * sw };
    S.dane = 1; S.bg = 'ffffff';
    if (!featherReady()) { S.pose = k; return S; } // piórko jeszcze się liczy: słuchawki zostają
    S.wave = smooth(seg(p, 0.5, 1));
    S.pose = mixPose(k, lanePose(), S.wave);
    // tło przechodzi w ciepłą szarość stopki, gdy powstaje piórko: białe piórko jest na niej dobrze widoczne
    S.bg = mixCol('#ffffff', ANAT_BG, smooth(seg(p, 0.55, 0.95)));
  }
  else {
    // Kontakt → stopka: piórko jedzie w górę razem z Kontaktem, a gdy wjeżdża stopka, odrywa się i z kołysaniem
    // opada na napis „Lumen Halo”. Najpierw w bok, potem w dół, przez pusty środek stopki.
    const t = seg(y, B.cE, B.end), T0 = 0.45;
    S.dane = 1;
    if (!featherReady()) { S.pose = ride(POSES.kon, y - B.cE); S.vis = 1 - smooth(seg(t, 0.05, 0.3)); S.bg = mixCol('#ffffff', ANAT_BG, smooth(seg(t, 0.35, 0.8))); return S; }
    S.wave = 1; S.bg = ANAT_BG.slice(1);
    if (t < T0) S.pose = lanePose(); // lanePose liczy się z położenia sekcji, więc piórko jedzie z nią
    else {
      // Komputer: w dół pustą lewą kolumną do pasa między formularzem a stopką, w bok wzdłuż pasa, na końcu na napis.
      // Tablet, telefon: pas jest za wąski, więc piórko wyjeżdża z Kontaktem w górę, a potem wlatuje z prawej
      // między odnośniki a napis. Przez cały czas lekko się kołysze.
      const f = seg(t, T0, 1), l = laneSpot(), d = landSpot();
      // komputer: piórko schodzi do napisu przez szczelinę między odnośnikami a e-mailem stopki; gdy szczelina jest węższa
      // od piórka (węższe ekrany), wlatuje z prawej do wolnego pasa nad napisem, jak na telefonie
      const fc = footColsEl.getBoundingClientRect(), fm = footMailEl.getBoundingClientRect();
      const side = L.mobile || fm.left - fc.right - 32 < d.w * 1.15;
      let x, yy, w;
      if (!side) {
        // w pasie piórko jest niższe od pasa (wysokość piórka to ok. 0,44 szerokości, z zapasem ok. 36 px nad i pod, bo piórko się kołysze)
        const bd = band(), wb = clamp((bd.h - 72) / 0.44, 160, l.w), f1 = io(seg(f, 0, 0.3)), f2 = io(seg(f, 0.3, 0.72)), f3 = smooth(seg(f, 0.72, 1));
        x = lerp(l.x, d.x, f2); yy = lerp(lerp(l.y, bd.y, f1), d.y, f3); w = lerp(lerp(l.w, wb, f1), d.w, f3);
        S.top = f > 0.3;
      } else {
        // wlatuje z prawego górnego rogu wolnego pasa nad napisem i opada na litery, kołysząc się (pas jest wyższy od piórka,
        // a piórko wchodzi na szerokość tekstu dopiero na dole pasa, więc nie przechodzi przez e-mail ani odnośniki)
        const g = seg(f, 0.4, 1);
        if (f < 0.4) { x = l.x; yy = l.y; w = l.w; }
        else { x = lerp(innerWidth + d.w * 0.6, d.x, 1 - (1 - g) ** 1.6); yy = d.y - d.w * clamp((d.room - 16) / d.w - 0.45, 0, 0.14) * (1 - smooth(g)); w = d.w; } // opada tyle, na ile pozwala pas
        S.top = f >= 0.4;
      }
      const k = 1 - smooth(seg(f, 0.8, 1));
      S.pose = featherAt(x + Math.sin(f * Math.PI * 3) * 0.04 * w * k, yy, w);
      S.pose.rz = Math.sin(f * Math.PI * 3 + 0.6) * 0.18 * k;
      S.land = smooth(seg(f, 0.88, 1));
    }
  }
  return S;
}

function buildTrack() {
  const tr = $('#d-track');
  for (const h of [7, 9, 12, 15, 18, 21, 23]) { const s = document.createElement('span'); s.className = 'hr' + ([9, 15, 21].includes(h) ? ' minor' : ''); s.style.left = (h - 7) / 16 * 100 + '%'; s.textContent = h + ':00'; tr.appendChild(s); }
  BLOCKS.forEach(([a, b, n]) => { const d = document.createElement('div'); d.className = 'blk'; d.style.left = (a - 7) / 16 * 100 + '%'; d.style.width = (b - a) / 16 * 100 + '%'; d.innerHTML = `<i></i><span>${n}</span>`; tr.appendChild(d); });
}
buildTrack();
const dayEls = { sec: $('#uzytkowanie'), clock: $('#d-clock'), what: $('#d-what'), now: $('#d-now'), level: $('#d-level'), pct: $('#d-pct'), note: $('#d-note'), blk: $$('#d-track .blk i') };
let lastDay = '';
function setDay(h, bg) {
  const listened = BLOCKS.reduce((s, [a, b]) => s + clamp(h - a, 0, b - a), 0), pct = Math.round(100 - listened / 40 * 100);
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 12) * 5, clock = `${hh}:${String(mm).padStart(2, '0')}`;
  const act = BLOCKS.find(([a, b]) => h >= a && h < b);
  const night = luma(bg) < 0.42;
  dayEls.now.style.left = (h - 7) / 16 * 100 + '%';
  BLOCKS.forEach(([a, b], i) => { dayEls.blk[i].style.transform = `scaleX(${clamp((h - a) / (b - a), 0, 1)})`; });
  dayEls.level.style.width = pct + '%';
  const key = clock + pct + night + L.mobile;
  if (key === lastDay) return;
  lastDay = key;
  dayEls.clock.textContent = clock;
  dayEls.what.textContent = act ? `${act[2]} · ${act[3]}` : (h < 7.5 ? 'Pobudka · słuchawki w etui' : h >= 22.5 ? 'Dobranoc · do jutra wystarczy' : 'Przerwa · słuchawki w etui');
  dayEls.pct.textContent = pct + '%';
  // telefon (Figma): pod osią sama bateria z krótkim podpisem
  dayEls.note.textContent = innerWidth <= 560 ? 'baterii zostało' : h >= 22.5 ? 'baterii po całym dniu słuchania' : 'baterii';
  dayEls.sec.classList.toggle('night', night);
}

// ---------- Pętla ----------
let lastBg = '', lastHead = '', lastTime = 0, lastOpacity = -1;
const navLinks = $$('.menu a, .mmenu nav a'), NAV_SECT = ['#start', '#design', '#konfiguracja', '#uzytkowanie', '#dane', '#kontakt']; let navOn = -1;
const footEl = $('#stopka'); let lastTop = false, lastLand = -1;
// Dane: na komputerze tytuł pojawia się, gdy model już wleciał, a wiersze po kolei w rytm rozkładania; na końcu przypięcia gasną
const daneHead = $$('.dane-head > *'), daneRows = $$('#spec > div');
let lastDane = '';
function setDane(p) {
  const key = p.toFixed(3) + L.mobile;
  if (key === lastDane) return;
  lastDane = key;
  const out = L.mobile ? 1 : 1 - smooth(seg(p, 0.82, 0.95));
  const head = (L.mobile ? 1 : smooth(seg(p, 0.22, 0.3))) * out;
  daneHead.forEach((el) => { el.style.opacity = head; el.style.transform = `translateY(${((1 - head) * 16).toFixed(1)}px)`; });
  daneRows.forEach((el, i) => { const o = smooth(seg(p, 0.27 + i * 0.04, 0.33 + i * 0.04)) * out; el.style.opacity = o; el.style.transform = `translateY(${((1 - o) * 12).toFixed(1)}px)`; });
}
const spinEl = $('#spin'); let lastSpin = 1;
const headKids = $$('.anat-head > *');
let dustAsk = false, dustIdle = false;
function frame(time) {
  const dt = Math.min(0.1, Math.max(0, time - lastTime)); lastTime = time;
  if (!POSES) return;
  const y = window.scrollY, S = scrollState(y);
  if (S.spin !== lastSpin) { spinEl.style.opacity = S.spin; lastSpin = S.spin; }
  const ent = setEntrance(S.ent);
  Object.assign(rig, S.pose); rig.vis = S.vis;
  // przemiana w piórko idzie za przewijaniem; skok (np. piórko policzyło się, gdy czytelnik był już w Kontakcie) wygładza się w czasie
  rig.wave = Math.abs(S.wave - rig.wave) > 0.08 && !reduce ? rig.wave + (S.wave - rig.wave) * (1 - Math.exp(-dt / 0.3)) : S.wave;
  setDane(S.dane);
  if (S.top !== lastTop) { canvas.style.zIndex = S.top ? 3 : ''; lastTop = S.top; } // lądujące piórko nad napisem w stopce
  if (S.land !== lastLand) { footEl.style.setProperty('--land', S.land.toFixed(3)); lastLand = S.land; }
  rig.ry += ent.turn; rig.ent = ent.a;
  setLight(S.light, S.photo);
  // tytuł Anatomii pojawia się, gdy gaśnie zdjęcie, i stoi w miejscu, a sekcja dojeżdża pod niego
  // (przesuwane są dzieci nagłówka, bo cały nagłówek gasi oś czasu na końcu sekcji)
  const hIn = smooth(seg(y, B.hE * 0.55, B.hE * 0.85));
  const head = hIn.toFixed(3) + Math.round(Math.max(0, B.dS - y));
  if (head !== lastHead) {
    headKids.forEach((el) => { el.style.opacity = hIn; el.style.transform = `translateY(${(-Math.max(0, B.dS - y) + (1 - hIn) * 24).toFixed(1)}px)`; });
    lastHead = head;
  }
  if (S.clock != null) setDay(S.clock, S.bg);
  if (S.bg !== lastBg) {
    backdrop.style.backgroundColor = '#' + S.bg; lastBg = S.bg;
    // na ciemnym tle (wieczór w Użytkowaniu) logo, koszyk i ikona menu są jasne
    document.documentElement.classList.toggle('nav-light', luma(S.bg) < 0.25);
  }
  if (!picked) { if (Math.abs(S.col - ringX) > 0.001) placeRing(S.col); setColor(Math.round(S.col)); }
  // strefa konfiguracji (granice z przypięć; ScrollTrigger liczy końce za przypiętą sekcją bez jej długości):
  // pasek z ceną po wybraniu koloru, a po wyjściu z niej model wraca do swojego obrotu
  const zone = y >= B.kS - innerHeight * 0.5 && y < B.kE + innerHeight * 0.6;
  if (zone !== barZone) { barZone = zone; showBar(); if (!zone) resetDrag(); }
  // menu: bieżąca sekcja, gdy jej góra minie 55% wysokości ekranu
  const h = innerHeight, on = [0, B.dS, B.kS, B.yS, B.nS, B.cS].filter((s) => y >= s - 0.55 * h).length - 1;
  if (on !== navOn) { navLinks.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === NAV_SECT[on])); navOn = on; }
  const opacity = rig.alpha * rig.vis * appear.v * rig.ent;
  if (Math.abs(opacity - lastOpacity) > 0.0005) { canvas.style.opacity = opacity; lastOpacity = opacity; }
  if (!G) return;
  // piórko liczy się w tle, gdy czytelnik dojdzie do Użytkowania (albo po kilku sekundach bezczynności)
  if (!dustAsk && (dustIdle || y > B.yS - innerHeight)) { dustAsk = true; G.buildDust(); }
  G.frame(time, dt, { e: S.e, col: S.col, white: S.white, picked, color, day: S.day, dayMix: S.dayMix, lpA: S.lp, lpV: S.lpV, opacity });
}

// ---------- Przewijanie: przypięcia sekcji i teksty ----------
function timelines() {
  // 1. Start (stoi dzięki CSS, patrz #start): delikatnie gaśnie tekst; zdjęcie i smuga światła są w scrollState
  gsap.timeline({ scrollTrigger: { id: 'hero', trigger: '#start', start: 'top top', end: 'bottom bottom', scrub: SCRUB } })
    .to('.hero-copy', { y: -24, autoAlpha: 0, duration: 0.28, ease: 'power1.out' }, 0)
    .to({}, { duration: 1 }, 0);

  // 2. Anatomia: przypięta; najpierw wejście słuchawek, potem 5 kroków lupy (koła, linie i podpisy liczy pętla,
  // podobnie jak pojawianie się nagłówka przy wjeździe sekcji, żeby działało też po skoku w środek strony)
  const tA = gsap.timeline({ scrollTrigger: { id: 'design', trigger: '#design', start: 'top top', end: '+=495%', pin: true, scrub: SCRUB } });
  // nagłówek gaśnie przed odjazdem sekcji, żeby nie przesuwał się nad stojącym modelem (stożek gaśnie w scrollState)
  tA.to('.anat-head', { autoAlpha: 0, y: -30, duration: 0.15 }, AN_U - 0.15)
    .to({}, { duration: 0.1 }, AN_U - 0.1);

  // 3. Konfiguracja: przypięta na 1,5 ekranu; przy przewijaniu słuchawki zmieniają kolor (scrollState), model można obracać
  ScrollTrigger.create({ id: 'kol', trigger: '#konfiguracja', start: 'top top', end: '+=150%', pin: true });

  // 4. Użytkowanie: godzina biegnie od 7:00 do 23:00 (scrollState), na końcu karty z faktami
  ScrollTrigger.create({ id: 'day', trigger: '#uzytkowanie', start: 'top top', end: '+=220%', pin: true });

  // 5. Dane techniczne: przypięte; model wlatuje (komputer), rozkłada się, wiersze pojawiają się po kolei (scrollState, setDane)
  ScrollTrigger.create({ id: 'dane', trigger: '#dane', start: 'top top', end: '+=180%', pin: true });
  // 6. Kontakt: przypięty na jeden ekran: słuchawki kołyszą się, potem rozsypują w piórko; 7. stopka: piórko spada na napis
  ScrollTrigger.create({ id: 'kon', trigger: '#kontakt', start: 'top top', end: '+=100%', pin: true });

  ScrollTrigger.addEventListener('refresh', measure);
}

// ---------- Konfigurator ----------
const swBtns = $$('.sw'), optBtns = $$('.opt'), buybar = $('#buybar');
let extra = 0, picked = false, barZone = false, color = 0;
const NBSP = String.fromCharCode(160), fmt = (n) => (n >= 1000 ? Math.floor(n / 1000) + NBSP + String(n % 1000).padStart(3, '0') : String(n)); // 1 899 zł jak w reszcie strony
function updateSum() {
  const total = fmt(1899 + extra) + ' zł', etui = optBtns.find((o) => o.getAttribute('aria-checked') === 'true').dataset.name;
  $('#k-total').textContent = 'Razem ' + total;
  $('#k-buy').textContent = 'Kup Lumen Halo · ' + PALETTES[color].name;
  $('#b-price').textContent = total;
  $('#b-what').textContent = PALETTES[color].name + ' · ' + etui;
}
function showBar() {
  const on = picked && barZone;
  buybar.classList.toggle('on', on);
  buybar.setAttribute('aria-hidden', String(!on));
  buybar.querySelector('a').tabIndex = on ? 0 : -1;
}
// obwódka wybranego koloru: przy przewijaniu idzie płynnie za kolorem (x: 0 Kreda … 2 Grafit), po kliknięciu przesuwa się do próbki
const swRing = document.createElement('span');
swRing.className = 'sw-ring'; swRing.setAttribute('aria-hidden', 'true');
$('.swatches').appendChild(swRing);
let ringX = -1;
function placeRing(x = ringX < 0 ? 0 : ringX) {
  ringX = x;
  const k = Math.min(1, Math.floor(x)), f = x - k, a = swBtns[k].querySelector('i'), b = swBtns[k + 1].querySelector('i');
  swRing.style.width = swRing.style.height = a.offsetWidth + 10 + 'px';
  swRing.style.transform = `translate(${lerp(a.offsetLeft, b.offsetLeft, f) - 5}px, ${a.offsetTop - 5}px)`;
}
function setColor(i) {
  if (i === color) return;
  color = i;
  swBtns.forEach((b, k) => b.setAttribute('aria-checked', String(k === i)));
  updateSum();
}
swBtns.forEach((b) => b.addEventListener('click', () => {
  picked = true;
  swRing.classList.add('ease');
  setColor(+b.dataset.i);
  placeRing(color);
  showBar();
}));
addEventListener('resize', () => placeRing());
if (document.fonts) document.fonts.ready.then(() => placeRing());
placeRing(0);
optBtns.forEach((b) => b.addEventListener('click', () => { optBtns.forEach((o) => o.setAttribute('aria-checked', String(o === b))); extra = +b.dataset.price; updateSum(); }));
updateSum();

// obracanie modelu w sekcji Konfiguracja
function resetDrag() { gsap.to(drag, { x: 0, y: 0, duration: reduce ? 0 : 0.8, ease: 'power2.out' }); }
{
  const area = $('#spin'); let down = null;
  area.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; area.setPointerCapture(e.pointerId); gsap.killTweensOf(drag); });
  area.addEventListener('pointermove', (e) => {
    if (!down) return;
    drag.y += (e.clientX - down.x) * 0.008;
    drag.x = clamp(drag.x + (e.clientY - down.y) * 0.006, -0.7, 0.7);
    down = { x: e.clientX, y: e.clientY };
  });
  const up = () => { down = null; };
  area.addEventListener('pointerup', up); area.addEventListener('pointercancel', up);
}

// ---------- Menu na telefon i tablet (M1): duże nazwy sekcji na białym tle, na dole „Umów odsłuch” ----------
const burger = $('#burger'), mmenu = $('#mmenu');
function setMenu(open) {
  document.documentElement.classList.toggle('menu-open', open);
  burger.setAttribute('aria-expanded', String(open));
  burger.setAttribute('aria-label', open ? 'Zamknij menu' : 'Menu');
  mmenu.inert = !open;
  if (open) { $('#nav').classList.remove('hide'); if (lenis) lenis.stop(); mmenu.querySelector('a').focus({ preventScroll: true }); }
  else if (lenis) lenis.start();
}
burger.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
$$('a', mmenu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
addEventListener('keydown', (e) => { if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') { setMenu(false); burger.focus(); } });
matchMedia('(min-width: 961px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });
mmenu.inert = true;

// ---------- Płynne przewijanie i odnośniki ----------
let lenis = null;
if (touch) ScrollTrigger.normalizeScroll(true);
else if (!reduce) {
  lenis = new Lenis({ lerp: 0.09 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
$$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
  const target = $(a.getAttribute('href'));
  if (!target) return;
  e.preventDefault();
  if (lenis) lenis.scrollTo(target, { duration: 1.6, force: true });
  else target.scrollIntoView();
}));

// ---------- Start ----------
layout();
timelines();
// zmiana rozmiaru: ScrollTrigger przelicza przypięcia przy zmianie szerokości; ujęcia liczą się od nowa zawsze
addEventListener('resize', () => { layout(); if (B.end) measure(); });
gsap.ticker.add((time) => frame(time));

// Część 3D: wczytuje się, gdy czytelnik zacznie przewijać albo dotknie strony, a najpóźniej chwilę po wczytaniu strony
// (gdy przeglądarka ma wolną chwilę). Na pierwszym ekranie słuchawek i tak nie widać, więc nic się nie spóźnia,
// a strona pokazuje się szybciej i nie zacina się zaraz po wejściu.
const core = { $, $$, smooth, seg, io, rig, drag, L, halfH, halfW, MODEL_H, FL, KON_R, canvas, reduce, P, rel, featPose };
const WAKE = ['wheel', 'touchstart', 'pointerdown', 'keydown', 'scroll'];
let loading = false;
function load3D() {
  if (loading) return;
  loading = true;
  WAKE.forEach((e) => removeEventListener(e, load3D));
  import('./lumen-3d.js').then((m) => m.start(core)).then((g) => {
    G = g;
    if (POSES) G.measure();
    gsap.to(appear, { v: 1, duration: reduce ? 0 : 1.2, ease: 'power2.out' });
    setTimeout(() => { dustIdle = true; }, 1500); // piórko liczy się w tle, kawałkami, wcześnie (zanim ktoś dojedzie do Kontaktu)
  }).catch((e) => { document.documentElement.classList.add('no-webgl'); console.warn('3D niedostępne', e); });
}
if (scrollY > 0 || location.hash) load3D();
else {
  WAKE.forEach((e) => addEventListener(e, load3D, { passive: true }));
  const later = () => setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(load3D, { timeout: 2000 }) : load3D()), 2500);
  if (document.readyState === 'complete') later(); else addEventListener('load', later, { once: true });
}

// diagnostyka (tylko z ?debug w adresie): test ciągłości ujęć i odstępów modelu od tekstu
if (location.search.includes('debug')) { window.__lumen = { scrollState, B, rig, L, get G() { return G; }, halfH, halfW, MODEL_H }; window.__box = () => G.box(); }

// ---------- Dane (telefon): wszystkie wiersze w arkuszu od dołu ----------
{
  const sheet = $('#sheet'), all = $('#spec-all');
  $$('#spec > div').forEach((d) => { const c = d.cloneNode(true); c.style.cssText = ''; all.appendChild(c); });
  $('#spec-more').addEventListener('click', () => { all.querySelectorAll('div').forEach((d) => { d.style.cssText = ''; }); sheet.showModal(); if (lenis) lenis.stop(); });
  const close = () => sheet.close();
  $('#sheet-close').addEventListener('click', close);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
  sheet.addEventListener('close', () => { if (lenis) lenis.start(); });
}
// ---------- Kontakt: temat i wysyłka (prototyp: nic nie wychodzi ze strony) ----------
{
  const seg = $$('.seg button');
  seg.forEach((b) => b.addEventListener('click', () => seg.forEach((o) => o.setAttribute('aria-checked', String(o === b)))));
  $('#kform').addEventListener('submit', (e) => { e.preventDefault(); $('#sent').hidden = false; });
}

// menu chowa się przy przewijaniu w dół i wraca przy przewijaniu w górę (na samej górze strony jest zawsze widoczne)
{
  const nav = $('#nav'); let lastY = scrollY;
  addEventListener('scroll', () => {
    const y = scrollY, d = y - lastY;
    if (y < 80 || document.documentElement.classList.contains('menu-open')) nav.classList.remove('hide');
    else if (d > 6) nav.classList.add('hide');
    else if (d < -6) nav.classList.remove('hide');
    if (Math.abs(d) > 6 || y < 80) lastY = y;
  }, { passive: true });
}

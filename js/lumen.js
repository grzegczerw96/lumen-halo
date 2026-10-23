// Strona Lumen Halo: jedno płótno 3D przypięte za treścią. Słuchawki przechodzą przez sekcje według stanu „rig”
// (położenie, obrót, skala, kamera, światło okna, przemiana w piórko), który przewijanie animuje przez GSAP ScrollTrigger.
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { PALETTES, studioEnv, buildHalo, centerHalo } from './halo-model.js';

gsap.registerPlugin(ScrollTrigger);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const { lerp, clamp, degToRad } = THREE.MathUtils;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const SCRUB = reduce ? true : 1;

// ---------- Scena ----------
const canvas = $('#stage'), backdrop = $('.backdrop');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  document.documentElement.classList.add('no-webgl');
  throw e;
}
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
scene.environment = studioEnv(renderer);
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

const sun = new THREE.DirectionalLight(0xfffaf2, 1.4);
sun.position.set(1.5, 9, 3.5);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.radius = 28;
sun.shadow.blurSamples = 32;
Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 24 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
const hemi = new THREE.HemisphereLight(0xffffff, 0xd8d4cc, 0.2);
scene.add(sun, hemi);

const MODEL_H = 3.65;
const { halo, M, anchors } = buildHalo(renderer);
centerHalo(halo, MODEL_H);
const pivot = new THREE.Group();
pivot.add(halo);
scene.add(pivot);

// ---------- Układ i ujęcia ----------
// Ujęcia są funkcjami, bo zależą od proporcji ekranu (telefon: model nad tekstem, mniejszy).
const L = { mobile: false, dist: 13 };
const halfH = () => L.dist * Math.tan(degToRad(15));
const halfW = () => halfH() * camera.aspect;
const BASE = { px: 0, py: 0, pz: 0, rx: 0.08, ry: -0.9, rz: 0, s: 0.9, camY: 0.6, camTY: 0, bob: 1, alpha: 1 };
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
const LP_MOB_H = 230; // pas na dole ekranu telefonu na aktywne zbliżenie i jego podpis
const P = {
  // Anatomia (lupa): duży model na środku smugi światła, ok. 58% wysokości ekranu; zbliżenia detali stoją wokół
  an: () => {
    if (!L.mobile) return pose({ py: -0.5, rx: 0.12, ry: -0.9, s: 1.1 });
    const f = fitIn(rel('.anat-head', '#design').bottom + 8, innerHeight - LP_MOB_H, 1.1);
    return pose({ py: f.py, rx: 0.12, ry: -0.9, s: f.s });
  },
  lek: () => {
    if (!L.mobile) return pose({ px: 0.28 * halfW(), ry: -0.85, s: 0.9 });
    const f = fitIn(76, rel('.lek-copy', '#lekkosc').top - 8, 0.75);
    return pose({ py: f.py, ry: -0.85, s: f.s });
  },
  kol: () => {
    // model w lewej kolumnie (desktop) albo w pasie nad konfiguratorem (telefon)
    const r = rel('#spin', '#kolory'), f = fitRect({ ...r, bottom: r.bottom - 22 }, L.mobile ? 0.7 : 0.95, 1.15, 0.8);
    return pose({ px: f.px, py: f.py, s: f.s });
  },
  day: () => pose({ px: (L.mobile ? 0.58 : 0.66) * halfW(), py: (L.mobile ? 0.7 : 0.5) * halfH(), rx: 0.14, s: L.mobile ? 0.26 : 0.44 }), // telefon: w rzędzie nadtytułu, obok krótkiego „Cały dzień”
  end: () => ({ ...P.day(), alpha: 0 }),
};
const KEYS = Object.keys(BASE);
const rig = { ...P.an(), wave: 0, vis: 1, ent: 0 }; // vis: zanikanie przy przenosinach modelu między sekcjami
const drag = { x: 0, y: 0 };
const appear = { v: 0 };

function layout() {
  const w = innerWidth, h = innerHeight, a = w / h;
  L.mobile = w <= 560 || a < 5 / 6; // ten sam próg co w CSS
  L.dist = a < 1.15 ? 13 * 1.15 / Math.max(a, 0.46) * (L.mobile ? 0.82 : 1) : 13;
  renderer.setPixelRatio(Math.min(devicePixelRatio, L.mobile ? 1.5 : 1.75));
  renderer.setSize(w, h, false);
  camera.aspect = a;
  camera.updateProjectionMatrix();
  lastLight = '';
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
function setEntrance(e) {
  canvas.style.filter = e < 1 ? `blur(${(28 * (1 - smooth(e)) ** 1.5).toFixed(2)}px)` : '';
  return { a: smooth(seg(e, 0, 0.6)), turn: -0.35 * (1 - io(e)) }; // start jak dotąd (ry −0,8), potem obrót do środka, do pierwszej cechy
}

// ---------- Lekkość: słuchawki rozsypują się w drobinki, które składają się w piórko ----------
// Piórko to tekstura rysowana na płótnie 2D (stosina, chorągiewki, puch u nasady) na wygiętej powierzchni:
// łuk z obu końców, szczyt po prawej podwinięty, puch po lewej. Drobinki są losowane z powierzchni modelu
// i z tekstury piórka (tam, gdzie jest gęsta), więc lądują dokładnie na nim. Płaszczyzna tnąca „zjada” bryłę,
// drobinki lecą w kolejności od nasady do szczytu, a za nimi z tekstury wyłania się prawdziwe piórko.
const clipLocal = new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e3), clipWorld = new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e3);
Object.values(M).forEach((m) => { m.clippingPlanes = [clipWorld]; });
const RUN = 1.6; // tempo fali: drobinka rusza, gdy uW · RUN minie jej miejsce na piórku (0 nasada, 1 szczyt)
let dust = null, feather = null, fMesh = null, fShadow = null, cutX = null, cutK = null;
const fRev = { value: 0 };

function featherTexture() {
  const W = 2048, H = 768, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const yc = H / 2, xb = 60, xt = W - 170, // za szczytem stosiny zostaje miejsce na końce promieni
    X = (u) => xb + u * (xt - xb);
  g.lineCap = 'round';
  // puch u nasady: długie, miękkie, kręte promienie z drobnymi odgałęzieniami. Rysowany na osobnej warstwie i rozmyty
  // raz w całości (filtr przy każdej kresce zajmował kilkanaście sekund i zamrażał stronę po wczytaniu)
  const down = document.createElement('canvas'); down.width = W; down.height = H;
  { const g = down.getContext('2d'); g.lineCap = 'round';
  for (let i = 0; i < 1500; i++) {
    const u = 0.05 + 0.55 * Math.pow(rnd(), 0.85), s = rnd() < 0.5 ? -1 : 1;
    const len = H * (0.22 + 0.32 * rnd()) * (1 - Math.abs(u - 0.33) * 1.2);
    let a = s * (0.75 + 0.75 * rnd()), x = X(u), y = yc;
    g.strokeStyle = `rgba(255,255,255,${0.42 + 0.28 * rnd()})`; g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(x, y);
    const pts = [];
    for (let k = 0; k < 16; k++) {
      a += (rnd() - 0.5) * 0.5 - s * 0.03; // promień skręca w stronę szczytu i faluje
      x += Math.cos(a * 0.9) * len / 16 + len / 60; y += Math.sin(a) * len / 16;
      g.lineTo(x, y); pts.push([x, y, a]);
    }
    g.stroke();
    g.strokeStyle = i % 3 ? 'rgba(255,255,255,0.32)' : 'rgba(150,150,160,0.14)'; g.lineWidth = 0.9; // co trzeci promień z szarymi odgałęzieniami: puch ma cień i objętość
    g.beginPath();
    for (const [px, py, pa] of pts) for (const d of [-1, 1]) {
      const b = pa + d * (0.9 + 0.5 * rnd()), l = 5 + 10 * rnd();
      g.moveTo(px, py); g.lineTo(px + Math.cos(b) * l, py + Math.sin(b) * l);
    }
    g.stroke();
  }
  }
  g.filter = 'blur(0.6px)';
  g.drawImage(down, 0, 0);
  g.filter = 'none';
  // chorągiewki: gęste promienie skośne ku szczytowi, lekko wygięte, w pękach z rozszczepieniami.
  // Dolna (wewnętrzna) jest szersza, szczyt zaokrąglony.
  const env = (u, s) => {
    if (u < 0.42) return 0;
    const p = u < 0.66 ? 1 - ((0.66 - u) / 0.26) ** 2 * 0.7 : Math.max(0, 1 - ((u - 0.66) / 0.335) ** 2) ** 0.75 * (1 - 0.3 * smooth((u - 0.8) / 0.2)); // szczyt węższy i zaokrąglony
    return H * 0.44 * (s > 0 ? 1 : lerp(0.8, 1, smooth((u - 0.7) / 0.3))) * Math.max(0, p);
  };
  for (const s of [-1, 1]) {
    let clump = 0, jit = 0, cut = 1;
    for (let u = 0.42; u < 0.995; u += 1 / 1100) {
      if (clump-- <= 0) { clump = 6 + rnd() * 22 | 0; jit = (rnd() - 0.5) * 0.04; cut = 1 - 0.05 * rnd(); if (u < 0.88 && rnd() < 0.12) u += 0.002 + 0.003 * rnd(); }
      const E = env(u, s) * cut; if (E < 2) continue;
      const al = lerp(0.78 - 0.32 * u, 0.2, smooth((u - 0.86) / 0.14)) + jit, // przy szczycie promienie biegną prawie wzdłuż stosiny i zbiegają się w szpic
        x0 = X(u), fw = E / Math.tan(al), q = Math.min(1, (xt + 130 - x0) / fw), // promienie przy szczycie skracają się i schodzą do osi
        x1 = x0 + fw * q, y1 = yc + s * E * q;
      const gr = g.createLinearGradient(x0, yc, x1, y1);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.75, 'rgba(255,255,255,0.36)'); gr.addColorStop(1, 'rgba(255,255,255,0.06)');
      g.strokeStyle = gr; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(x0, yc); g.quadraticCurveTo(x0 + (x1 - x0) * 0.25, yc + s * E * 0.72, x1, y1); g.stroke();
      if (rnd() < 0.3) { // luźne końce promieni wystają poza brzeg, więc brzeg chorągiewki jest miękki
        const l = 6 + 22 * rnd() * (1 - u), dx = Math.cos(al) * l, dy = s * Math.sin(al) * l;
        g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 0.9;
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 + dx, y1 + dy); g.stroke();
      }
      if (rnd() < 0.55) { // cieńsze, szare promienie dają rysunek splotu widoczny na jasnym piórku
        g.strokeStyle = 'rgba(140,140,150,0.16)'; g.lineWidth = 0.7;
        g.beginPath(); g.moveTo(x0, yc); g.quadraticCurveTo(x0 + (x1 - x0) * 0.25, yc + s * E * 0.72, x1, y1); g.stroke();
      }
    }
  }
  // stosina: zwęża się ku szczytowi; u nasady gołe, półprzezroczyste dutki
  const sw = (u) => 9 * (1 - u) + 1.4;
  g.fillStyle = 'rgba(252,252,253,0.95)';
  g.beginPath();
  for (let u = 0; u <= 1; u += 0.01) g.lineTo(X(u), yc - sw(u) / 2);
  for (let u = 1; u >= 0; u -= 0.01) g.lineTo(X(u), yc + sw(u) / 2);
  g.fill();
  g.strokeStyle = 'rgba(140,140,150,0.45)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(X(0.08), yc + 1); g.lineTo(X(0.97), yc + 0.5); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return { t, data: g.getImageData(0, 0, W, H).data, W, H };
}

// Kształt piórka w jego układzie (oś x w prawo, y w górę, z do kamery). u: wzdłuż (0 nasada po lewej, 1 szczyt po prawej),
// v: w poprzek (0,5 = stosina). Stosina idzie łukiem, oba końce w górę, a szczyt mocniej; chorągiewka jest pochylona do kamery
// jak u piórka oglądanego lekko z góry i obraca się ku szczytowi, który zwija się przodem do widza.
const FL = 5, FWD = FL * 768 / 2048;
const shaftAt = (u) => new THREE.Vector3((u - 0.5) * FL, 0.42 * (2 * u - 1) ** 2 + 0.45 * Math.max(0, u - 0.7) ** 2 / 0.09 - 0.25, -0.35 * (2 * u - 1) ** 2);
function featherPoint(u, v, out = new THREE.Vector3()) {
  const C = shaftAt(u), T = shaftAt(Math.min(1, u + 0.002)).sub(shaftAt(Math.max(0, u - 0.002))).normalize();
  const th = lerp(0.62, 0.12, smooth((u - 0.4) / 0.6));
  const D = new THREE.Vector3(-T.y, T.x, 0).normalize().multiplyScalar(Math.cos(th)).add(new THREE.Vector3(0, 0, Math.sin(th)));
  D.addScaledVector(T, -D.dot(T)).normalize();
  const N = new THREE.Vector3().crossVectors(T, D), w = (v - 0.5) * FWD;
  return out.copy(C).addScaledVector(D, w).addScaledVector(N, -0.32 * w * w * (1 - 0.7 * smooth((u - 0.75) / 0.25))); // przy szczycie chorągiewka się prostuje
}

function buildFeather() {
  const ft = featherTexture();
  const geo = new THREE.PlaneGeometry(1, 1, 200, 60), p = geo.attributes.position, uv = geo.attributes.uv, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { featherPoint(uv.getX(i), uv.getY(i), v); p.setXYZ(i, v.x, v.y, v.z); }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: ft.t, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 1, emissive: '#ffffff', emissiveMap: ft.t, emissiveIntensity: 0.12 });
  // piórko wyłania się od nasady do szczytu, w tym samym tempie, w jakim gasną drobinki
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRev = fRev;
    sh.fragmentShader = 'uniform float uRev;\n' + sh.fragmentShader.replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n  diffuseColor.a *= smoothstep(0.3, 0.55, uRev - vMapUv.x);');
  };
  fMesh = new THREE.Mesh(geo, mat);
  fMesh.renderOrder = 2;
  // miękki cień pod piórkiem: unosi się w powietrzu, więc cień jest daleko i rozmyty
  const sc = document.createElement('canvas'); sc.width = 256; sc.height = 64;
  const sg = sc.getContext('2d'), rg = sg.createRadialGradient(128, 32, 0, 128, 32, 128);
  rg.addColorStop(0, 'rgba(0,0,0,0.2)'); rg.addColorStop(0.45, 'rgba(0,0,0,0.08)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  sg.setTransform(1, 0, 0, 0.25, 0, 24); sg.fillStyle = rg; sg.fillRect(0, -96, 256, 256);
  fShadow = new THREE.Mesh(new THREE.PlaneGeometry(FL * 0.62, FL * 0.13), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }));
  fShadow.position.set(0.2, -2.1, -0.6);
  feather = new THREE.Group();
  feather.add(fMesh, fShadow);
  feather.visible = false;
  // układ piórka jest zgodny z kamerą: obrót znosi obrót słuchawek w ujęciu Lekkość
  const lp = P.lek();
  feather.quaternion.setFromEuler(new THREE.Euler(lp.rx, lp.ry, lp.rz, 'YXZ')).invert();
  feather.position.copy(L.mobile ? new THREE.Vector3(0, 0.15, 0.4) : new THREE.Vector3(0.25, 0.35, 0.4)).applyQuaternion(feather.quaternion);
  feather.scale.setScalar(L.mobile ? 1.35 : 1); // na telefonie słuchawki są małe, a piórko ma wypełnić szerokość ekranu
  feather.updateMatrix();
  pivot.add(feather);
  return ft;
}

// Przygotowanie trwa ok. 0,6 s, więc jest rozbite na trzy kawałki w wolnych chwilach przeglądarki, żeby nie zacinać przewijania
const idle = () => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 1500 }) : setTimeout(r, 60)));
async function buildDust() {
  const ft = buildFeather();
  await idle();
  const N = L.mobile ? 28000 : 42000;
  pivot.position.set(0, 0, 0); pivot.rotation.set(0, 0, 0); pivot.scale.setScalar(1); pivot.updateMatrixWorld(true);
  const meshes = []; halo.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  const areas = meshes.map((m) => {
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry, p = g.attributes.position; let a = 0;
    for (let i = 0; i < p.count; i += 3) { A.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); B.fromBufferAttribute(p, i + 1).applyMatrix4(m.matrixWorld); C.fromBufferAttribute(p, i + 2).applyMatrix4(m.matrixWorld); a += B.sub(A).cross(C.sub(A)).length() / 2; }
    return a;
  });
  const total = areas.reduce((s, a) => s + a, 0), hp = [], v = new THREE.Vector3();
  meshes.forEach((m, k) => { const s = new MeshSurfaceSampler(m).build(), n = Math.round(N * areas[k] / total); for (let i = 0; i < n; i++) { s.sample(v); hp.push(v.clone().applyMatrix4(m.matrixWorld)); } });
  await idle();
  // cele na piórku: punkty tekstury losowane proporcjonalnie do krycia, przeniesione na wygiętą powierzchnię
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const fe = [];
  while (fe.length < hp.length) {
    const x = rnd() * ft.W | 0, y = rnd() * ft.H | 0;
    if (rnd() * 255 > ft.data[(y * ft.W + x) * 4 + 3]) continue;
    const u = (x + 0.5) / ft.W;
    fe.push({ u, p: featherPoint(u, 1 - (y + 0.5) / ft.H).applyMatrix4(feather.matrix) });
  }
  // pary: kolejność rozsypywania słuchawek (wzdłuż x) = kolejność składania piórka (od nasady do szczytu)
  hp.sort((a, b) => a.x - b.x); fe.sort((a, b) => a.u - b.u);
  const n = hp.length, start = new Float32Array(n * 3), end = new Float32Array(n * 3), k = new Float32Array(n), r3 = new Float32Array(n * 3);
  cutX = new Float32Array(n); cutK = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    hp[i].toArray(start, i * 3); fe[i].p.toArray(end, i * 3);
    k[i] = cutK[i] = fe[i].u; cutX[i] = hp[i].x;
    r3[i * 3] = rnd() * 2 - 1; r3[i * 3 + 1] = rnd() * 2 - 1; r3[i * 3 + 2] = rnd() * 2 - 1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(start, 3));
  g.setAttribute('aEnd', new THREE.BufferAttribute(end, 3));
  g.setAttribute('aK', new THREE.BufferAttribute(k, 1));
  g.setAttribute('aRnd', new THREE.BufferAttribute(r3, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uW: { value: 0 }, uTime: { value: 0 }, uSize: { value: 15 }, uPR: { value: renderer.getPixelRatio() } },
    vertexShader: `
      uniform float uW, uTime, uSize, uPR;
      attribute vec3 aEnd, aRnd; attribute float aK;
      varying float vA; varying vec3 vC;
      void main() {
        float d = uW * ${RUN.toFixed(2)} - aK;      // ile czasu minęło od przejścia płaszczyzny
        float e = smoothstep(0.0, 0.35, d);
        float s = sin(3.14159 * e);
        vec3 p = mix(position, aEnd, e) + aRnd * 0.26 * s + vec3(0.0, 0.32 * s, 0.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uPR / -mv.z;
        vA = step(0.0, d) * (1.0 - smoothstep(0.32, 0.6, d)); // po wylądowaniu drobinka gaśnie, a w jej miejscu jest już piórko
        vC = aRnd.x > 0.1 ? vec3(1.0) : vec3(0.6, 0.6, 0.64);  // większość białych, część szarych, żeby było je widać na jasnym tle
      }`,
    fragmentShader: `
      varying float vA; varying vec3 vC;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float a = vA * 0.6 * (1.0 - smoothstep(0.12, 0.25, dot(c, c)));
        if (a < 0.01) discard;
        gl_FragColor = vec4(vC, a);
      }`,
  });
  dust = new THREE.Points(g, mat);
  dust.frustumCulled = false;
  dust.visible = false;
  pivot.add(dust);
}
// położenie płaszczyzny tnącej: tuż za ostatnią drobinką, która już ruszyła (kolejność drobinek jest posortowana)
function cutAt(front) {
  let lo = 0, hi = cutK.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cutK[m] < front) lo = m + 1; else hi = m; }
  return lo === 0 ? -1e3 : lo >= cutX.length ? 1e3 : cutX[lo];
}

// ---------- Anatomia: zbliżenia detali (lupa) ----------
// Cechy pojawiają się pojedynczo: okrągłe zbliżenie stoi tuż obok modelu, po tej stronie, po której jest opisywana
// część, z cienką linią do punktu i podpisem pod spodem. Gdy jedna cecha prawie zgaśnie, zaczyna pojawiać się następna,
// a model w tym czasie dokręca się dalej. Zbliżenie to osobny widok kamery z bliska na model (ten sam model i światło),
// renderowany do tekstury i rysowany w kole na tym samym płótnie. Cel i kierunek kamery są w układzie słuchawek
// (x: prawa muszla, y: góra, z: przód), więc zbliżenie obraca się razem z modelem.
const rim = new THREE.Object3D();
rim.position.set(0.21, -0.42, 0.72); // brzeg ceramicznego frontu z przodu: ceramika, polerowana fazka i bok pierścienia
anchors.face.parent.add(rim);
const bandSide = new THREE.Object3D();
bandSide.position.copy(anchors.band.position).add(new THREE.Vector3(0.85, -0.6, 0)); // prawy bok łuku pałąka: zewnętrzna strona dzianiny
anchors.band.parent.add(bandSide);
const armL = new THREE.Object3D(); // przegub nad lewą muszlą: widać go po obrocie w drugą stronę
armL.position.set(-anchors.arm.position.x, anchors.arm.position.y, anchors.arm.position.z);
anchors.foam.parent.add(armL);
// kolejność cech jak w HTML: poduszki, pierścień, ceramika, pałąk, ramię
const LP = [
  { at: anchors.foam, dir: [0.45, -0.05, 0.89], span: 0.85 }, // poduszki: lewa od strony ucha, przez szczelinę między muszlami
  { at: anchors.ring, dir: [0.75, 0.05, 0.66], span: 0.7 },   // pierścień z aluminium
  { at: rim, dir: [0.62, -0.18, 0.76], span: 0.55 },         // ceramiczna muszla: pod kątem, żeby było widać grubość
  { at: bandSide, dir: [0.55, 0.4, 0.73], span: 0.6 },       // pałąk z dzianiny: ukośnie na zewnętrzną stronę łuku, widać splot i przeszycie
  { at: armL, dir: [-0.6, 0.15, 0.8], span: 0.75 },          // ruchome ramię lewej muszli
];
const lpEls = $$('.lp'), linesSvg = $('#lines');
const NS = 'http://www.w3.org/2000/svg';
LP.forEach((l, i) => {
  l.el = lpEls[i];
  l.line = document.createElementNS(NS, 'path'); l.line.setAttribute('fill', 'none'); l.line.setAttribute('stroke', '#1d1d1f'); l.line.setAttribute('stroke-width', '1');
  l.pulse = document.createElementNS(NS, 'circle'); l.pulse.setAttribute('r', '13'); l.pulse.setAttribute('fill', 'rgba(255,255,255,.4)'); l.pulse.setAttribute('stroke', '#fff');
  l.dot = document.createElementNS(NS, 'circle'); l.dot.setAttribute('r', '6'); l.dot.setAttribute('fill', '#fff'); l.dot.setAttribute('stroke', '#1d1d1f'); l.dot.setAttribute('stroke-width', '1.5');
  linesSvg.append(l.line, l.pulse, l.dot);
  l.rt = new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType, samples: 4 });
  l.mat = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: { map: { value: l.rt.texture }, uA: { value: 0 }, uPx: { value: 132 }, uBg: { value: new THREE.Color('#efeeeb').convertLinearToSRGB() } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D map; uniform float uA, uPx; uniform vec3 uBg; varying vec2 vUv;
      void main() {
        const float M = 1.35;                  // połowa boku kwadratu / promień koła (zapas na cień)
        vec2 p = (vUv * 2.0 - 1.0) * M;
        float q = length(p), px = 2.0 / uPx;   // q = 1 na krawędzi koła, px = jeden piksel w tych jednostkach
        vec4 img = texture2D(map, p * 0.5 + 0.5);
        vec3 c = img.a > 0.001 ? linearToOutputTexel(vec4(toneMapping(img.rgb / img.a), 1.0)).rgb : uBg;
        c = mix(uBg, c, img.a);
        float inner = 1.0 - smoothstep(1.0 - 5.0 * px, 1.0 - 4.0 * px, q);   // zdjęcie w białej obwódce (4 px)
        float disc = 1.0 - smoothstep(1.0 - px, 1.0, q);
        float sh = 0.12 * exp(-pow(max(length(p - vec2(0.0, -0.07)) - 0.96, 0.0) * 5.0, 2.0)); // miękki cień pod kołem
        vec4 res = mix(vec4(vec3(0.0), sh), vec4(mix(vec3(1.0), c, inner), 1.0), disc);
        gl_FragColor = vec4(res.rgb, res.a * uA);
      }`,
  });
  l.quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), l.mat);
  l.quad.frustumCulled = false;
});
const ovScene = new THREE.Scene(), ovCam = new THREE.OrthographicCamera(0, 1, 0, -1, -1, 1);
LP.forEach((l) => ovScene.add(l.quad));
const lpCam = new THREE.PerspectiveCamera(18, 1, 0.02, 60);
const LP_M = 1.35, LP_LABEL_W = 300, LP_GAP = 40; // zapas kwadratu wokół koła (cień); szerokość podpisu jak w CSS; odstęp koła od modelu
let lpA = 0, lpD = 120, lpTop = 200;
// narożniki prostopadłościanu wokół modelu (układ obracanej grupy): z nich co klatkę wychodzi obrys modelu na ekranie
const boxCorners = [];
{
  pivot.position.set(0, 0, 0); pivot.rotation.set(0, 0, 0); pivot.scale.setScalar(1); pivot.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(halo);
  for (let k = 0; k < 8; k++) boxCorners.push(new THREE.Vector3(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z));
}
function placeLoupes() {
  const W = innerWidth, H = innerHeight;
  lpD = L.mobile ? Math.min(0.3 * W, 112) : Math.min(0.1 * W, 0.155 * H);
  const res = Math.min(512, Math.round(lpD * 1.4 * Math.min(devicePixelRatio, 2)));
  LP.forEach((l) => l.rt.setSize(res, res));
  ovCam.right = W; ovCam.bottom = -H; ovCam.updateProjectionMatrix();
  lpTop = rel('.anat-head', '#design').bottom + 24; // koła nie wchodzą na tytuł
  // strona każdej cechy: po której stronie obrysu modelu leży jej punkt w jej własnym ujęciu
  LP.forEach((l, i) => {
    const p = featPose(i);
    pivot.position.set(p.px, p.py, p.pz); pivot.rotation.set(p.rx, p.ry, p.rz, 'YXZ'); pivot.scale.setScalar(p.s); pivot.updateMatrixWorld(true);
    camera.position.set(0, p.camY, L.dist); camera.lookAt(0, p.camTY, 0); camera.updateMatrixWorld();
    let x0 = Infinity, x1 = -Infinity;
    boxCorners.forEach((c) => { cTmp.copy(c).applyMatrix4(pivot.matrixWorld).project(camera); x0 = Math.min(x0, cTmp.x); x1 = Math.max(x1, cTmp.x); });
    l.at.getWorldPosition(wTmp).project(camera);
    l.left = wTmp.x < (x0 + x1) / 2;
  });
}
const wTmp = new THREE.Vector3(), dTmp = new THREE.Vector3(), cTmp = new THREE.Vector3();
// v: postęp cech 0–5, a: krycie całej lupy. Renderuje widoczne zbliżenia do tekstur, ustawia koła, linie i podpisy.
function drawLoupes(a, v) {
  if (a < 0.002) {
    if (lpA >= 0.002) { LP.forEach((l) => { l.el.style.visibility = 'hidden'; l.quad.visible = false; l.line.style.opacity = l.dot.style.opacity = l.pulse.style.opacity = 0; }); lpA = a; }
    return;
  }
  lpA = a;
  const W = innerWidth, H = innerHeight, unit = halo.matrixWorld.getMaxScaleOnAxis();
  // obrys modelu na ekranie
  let x0 = Infinity, x1 = -Infinity;
  boxCorners.forEach((c) => { cTmp.copy(c).applyMatrix4(pivot.matrixWorld).project(camera); const x = (cTmp.x * 0.5 + 0.5) * W; x0 = Math.min(x0, x); x1 = Math.max(x1, x); });
  const pad = Math.max(24, 0.045 * W), top = lpTop;
  renderer.shadowMap.autoUpdate = false; // cienie policzone w głównym przebiegu
  LP.forEach((l, i) => {
    // cecha i pojawia się od i, gaśnie tuż przed i + 1, kiedy już pojawia się następna; ostatnia gaśnie z sekcją
    const vin = smooth(seg(v, i - 0.03, i + 0.25)), vout = i === 4 ? 1 : 1 - smooth(seg(v, i + 0.72, i + 0.98));
    const vis = i === 0 ? vout : vin * vout, show = a * vis;
    l.quad.visible = show > 0.002;
    if (!l.quad.visible) { l.el.style.visibility = 'hidden'; l.line.style.opacity = l.dot.style.opacity = l.pulse.style.opacity = 0; return; }
    l.at.getWorldPosition(wTmp);
    const s = wTmp.clone().project(camera), ax = (s.x * 0.5 + 0.5) * W, ay = (-s.y * 0.5 + 0.5) * H;
    // zbliżenie: kamera z bliska wzdłuż kierunku w układzie słuchawek
    dTmp.set(...l.dir).normalize().transformDirection(halo.matrixWorld);
    lpCam.position.copy(wTmp).addScaledVector(dTmp, (l.span * unit) / 2 / Math.tan(degToRad(9)));
    lpCam.lookAt(wTmp);
    renderer.setRenderTarget(l.rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, lpCam);
    // koło: tuż za obrysem modelu, po stronie punktu, na jego wysokości; przy pojawianiu się lekko rośnie
    const d = lpD * lerp(0.9, 1, smooth(seg(v, i - 0.03, i + 0.5))), left = l.left; // strona stała dla cechy: podpis nie przeskakuje przy obrocie
    let x, y;
    if (L.mobile) { x = pad + d / 2; y = H - 132; }
    else {
      x = clamp(left ? x0 - LP_GAP - d / 2 : x1 + LP_GAP + d / 2, pad + d / 2, W - pad - d / 2);
      y = clamp(ay - d * 0.35, top + d / 2, H - 150 - d / 2);
    }
    l.quad.position.set(x, -y, 0); l.quad.scale.setScalar(d * LP_M);
    l.mat.uniforms.uA.value = show; l.mat.uniforms.uPx.value = d;
    // linia od brzegu koła do punktu na modelu
    const dx = ax - x, dy = ay - y, len = Math.hypot(dx, dy) || 1, r = d / 2 + 8;
    l.line.setAttribute('d', `M${(x + dx / len * r).toFixed(1)},${(y + dy / len * r).toFixed(1)} L${ax.toFixed(1)},${ay.toFixed(1)}`);
    l.line.style.opacity = show * 0.5;
    l.dot.setAttribute('cx', ax); l.dot.setAttribute('cy', ay); l.dot.style.opacity = show;
    l.pulse.setAttribute('cx', ax); l.pulse.setAttribute('cy', ay); l.pulse.style.opacity = show;
    // podpis pod kołem, wyrównany do krawędzi bliżej modelu (telefon: obok koła)
    const st = l.el.style;
    l.el.classList.toggle('l', left && !L.mobile);
    st.visibility = 'visible'; st.opacity = show;
    st.transform = L.mobile ? `translate(${x + d / 2 + 16}px, ${y - 30}px)`
      : `translate(${left ? x + d / 2 - LP_LABEL_W : x - d / 2}px, ${y + d / 2 + 16 + (1 - vin) * 10}px)`;
  });
  renderer.setRenderTarget(null);
  renderer.shadowMap.autoUpdate = true;
  renderer.autoClear = false;
  renderer.render(ovScene, ovCam);
  renderer.autoClear = true;
}

// ---------- Światło: kolor dnia ----------
const lightCol = new THREE.Color('#fffaf2');
const light = { c: lightCol, i: 1.4, env: 1 };
const mix = (stops, h) => { // interpolacja kolorów/liczb wg godziny
  let i = 0; while (i < stops.length - 2 && h > stops[i + 1][0]) i++;
  const [h0, a] = stops[i], [h1, b] = stops[i + 1], t = clamp((h - h0) / (h1 - h0), 0, 1);
  return typeof a === 'number' ? lerp(a, b, t) : new THREE.Color(a).lerp(new THREE.Color(b), t);
};

// ---------- Stan zależny od miejsca na stronie ----------
// Położenie i obrót modelu, przemiana w piórko, zanikanie i kolor tła są jedną funkcją pozycji przewijania
// (a nie osobnymi animacjami w każdej sekcji). Dzięki temu skok w dowolne miejsce, także powrót na górę
// jednym kliknięciem, zawsze daje właściwe ujęcie. Lenis wygładza samo przewijanie.
const KOL = [
  { title: ['Kreda.', 'Jasna jak poranek.'], lead: 'Ceramika w kolorze kredy, dzianina w kolorze mgły.', bg: '#eff0f1', sun: ['#f1f5ff', 1.45] },
  { title: ['Piasek.', 'Ciepło południa.'], lead: 'Ceramika piaskowa, dzianina owsiana, aluminium szampańskie.', bg: '#f3eee6', sun: ['#fff0da', 1.55] },
  { title: ['Grafit.', 'Spokojny jak wieczór.'], lead: 'Grafitowa ceramika i węglowa dzianina.', bg: '#e6e3df', sun: ['#ffdcbc', 1.25] },
];
let color = 0;
const kolBg = new THREE.Color(KOL[0].bg); // płynnie zmienia się przy wyborze koloru

// Dzień: bloki słuchania (godziny od-do), bateria 40 h z ANC
const BLOCKS = [[7.5, 8.5, 'Dojazd', 'redukcja szumów włączona'], [9, 12, 'Praca w skupieniu', 'trzy godziny bez przerwy'], [13, 14, 'Spacer', 'tryb przezroczysty'], [20, 22.5, 'Wieczór z muzyką', 'najdłuższa sesja dnia']];
const BG_DAY = [[7, '#eef1f4'], [11, '#f5f2ec'], [15, '#f3ede4'], [18.5, '#ecd9c4'], [20, '#5d5049'], [21, '#232226'], [23, '#161618']];
const SUN_DAY = [[7, '#dce7ff'], [12, '#fff6ea'], [18.5, '#ffbd82'], [20.5, '#8ea4ff'], [23, '#7c92e3']];
const SUN_I = [[7, 1.3], [12, 1.6], [18.5, 1.3], [20.5, 0.5], [23, 0.35]];
const ENV_I = [[7, 1], [18, 0.95], [20.5, 0.5], [23, 0.4]];

const B = {};            // granice sekcji w pikselach przewijania
let POSES = null;        // ujęcia policzone dla bieżącego rozmiaru ekranu
function measure() {
  const g = (id) => ScrollTrigger.getById(id);
  Object.assign(B, { hE: g('hero').end, dS: g('design').start, dE: g('design').end, lS: g('lek').start, lE: g('lek').end, kS: g('kol').start, yS: g('day').start, yE: g('day').end });
  B.eE = B.yE + innerHeight * 0.65;
  POSES = Object.fromEntries(Object.keys(P).map((k) => [k, P[k]()]));
  placeLoupes();
}
const AN_0 = 0.8, AN_U = AN_0 + 5;
// ujęcie dla każdej cechy (obrót wokół osi pionowej i pochylenie): opisywana część zwrócona do widza.
// Kolejność jak w LP: poduszki (przez szczelinę między muszlami), pierścień, ceramika, pałąk (lekko z góry),
// ramię (pełny obrót w drugą stronę, do lewej muszli)
const FEAT_ROT = [[-0.45, 0.1], [-1.15, 0.12], [-1.45, 0.06], [-0.7, 0.32], [1.0, 0.12]];
const featPose = (i) => ({ ...POSES.an, ry: FEAT_ROT[i][0], rx: FEAT_ROT[i][1] }); // Anatomia: dokończenie wejścia słuchawek, potem 5 cech po 1 jednostce
const io = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2); // power2.inOut
const seg = (y, a, b) => clamp((y - a) / (b - a), 0, 1);
const mixPose = (a, b, t) => Object.fromEntries(KEYS.map((k) => [k, lerp(a[k], b[k], t)]));
const cA = new THREE.Color(), cB = new THREE.Color();
const mixCol = (a, b, t) => cA.set(a).lerp(cB.set(b), t).getHexString();
const dipAt = (t) => (t < 0.5 ? 1 - smooth((t - 0.05) / 0.35) : smooth((t - 0.6) / 0.35)); // zanika w połowie przenosin

function scrollState(y) {
  const S = { wave: 0, vis: 1, bg: null, day: null, lp: 0, lpV: 0, ent: 1, light: 0, photo: 0 };
  // wejście słuchawek: razem z pojawianiem się tytułu (od 0,6 Startu) do połowy pierwszej jednostki przypiętej Anatomii
  const ent = seg(y, B.hE * 0.6, B.dS + (B.dE - B.dS) / AN_U * 0.5);
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
    const u = seg(y, B.dS, B.dE) * AN_U, v = u - AN_0;
    S.ent = ent;
    S.light = 0.85 * (1 - seg(u, AN_U - 0.25, AN_U));
    S.bg = ANAT_BG.slice(1);
    // obrót zgrany z cechami: model obraca się do następnego ujęcia, gdy jedna cecha gaśnie, a następna się pojawia
    const vi = clamp(v, 0, 5), k = Math.min(4, Math.floor(vi));
    S.pose = k < 4 ? mixPose(featPose(k), featPose(k + 1), smooth(seg(vi - k, 0.68, 1))) : featPose(4);
    S.lp = smooth(seg(v, -0.45, -0.05)) * (1 - smooth(seg(u, AN_U - 0.35, AN_U - 0.12)));
    S.lpV = v;
  }
  else if (y < B.lS) { const t = seg(y, B.dE, B.lS); S.pose = mixPose(featPose(4), POSES.lek, t); S.bg = mixCol(ANAT_BG, '#e6e6ea', t); }
  else if (y <= B.lE) {
    // Lekkość: rozsypanie (0,2–1,3), piórko i „268 g”, powrót do słuchawek (2,0–2,8)
    const u = seg(y, B.lS, B.lE) * 2.9;
    S.pose = POSES.lek; S.wave = u < 1.3 ? seg(u, 0.2, 1.3) : u < 2 ? 1 : 1 - seg(u, 2, 2.8); S.bg = 'e6e6ea';
  }
  else if (y < B.kS) { const t = seg(y, B.lE, B.kS); S.pose = mixPose(POSES.lek, POSES.kol, t); S.vis = dipAt(t); S.bg = mixCol('#e6e6ea', kolBg, t); }
  else if (y < B.yS) { const t = seg(y, B.kS, B.yS); S.pose = mixPose(POSES.kol, POSES.day, t); S.vis = dipAt(t); S.bg = mixCol(kolBg, BG_DAY[0][1], t); }
  else if (y <= B.yE) { const u = seg(y, B.yS, B.yE); S.pose = { ...POSES.day, ry: POSES.day.ry + u * Math.PI * 2 }; S.day = lerp(7, 23, smooth((u - 0.04) / 0.76)); }
  else { const t = seg(y, B.yE, B.eE); S.pose = mixPose({ ...POSES.day, ry: POSES.day.ry + Math.PI * 2 }, POSES.end, t); S.bg = mixCol(BG_DAY[BG_DAY.length - 1][1], '#ffffff', t); }
  return S;
}

function buildTrack() {
  const tr = $('#d-track');
  for (const h of [7, 9, 12, 15, 18, 21, 23]) { const s = document.createElement('span'); s.className = 'hr'; s.style.left = (h - 7) / 16 * 100 + '%'; s.textContent = h + ':00'; tr.appendChild(s); }
  BLOCKS.forEach(([a, b, n]) => { const d = document.createElement('div'); d.className = 'blk'; d.style.left = (a - 7) / 16 * 100 + '%'; d.style.width = (b - a) / 16 * 100 + '%'; d.innerHTML = `<i></i><span>${n}</span>`; tr.appendChild(d); });
}
buildTrack();
const dayEls = { sec: $('#dzien'), clock: $('#d-clock'), what: $('#d-what'), now: $('#d-now'), level: $('#d-level'), pct: $('#d-pct'), note: $('#d-note'), blk: $$('#d-track .blk i') };
let lastDay = '', dayLight = null;
function setDay(h) {
  const listened = BLOCKS.reduce((s, [a, b]) => s + clamp(h - a, 0, b - a), 0), pct = Math.round(100 - listened / 40 * 100);
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 12) * 5, clock = `${hh}:${String(mm).padStart(2, '0')}`;
  const act = BLOCKS.find(([a, b]) => h >= a && h < b);
  const bg = mix(BG_DAY, h), night = bg.r * 0.3 + bg.g * 0.59 + bg.b * 0.11 < 0.42;
  dayLight = { c: mix(SUN_DAY, h), i: mix(SUN_I, h), env: mix(ENV_I, h), bg: bg.getHexString() };
  dayEls.now.style.left = (h - 7) / 16 * 100 + '%';
  BLOCKS.forEach(([a, b], i) => { dayEls.blk[i].style.transform = `scaleX(${clamp((h - a) / (b - a), 0, 1)})`; });
  dayEls.level.style.width = pct + '%';
  const key = clock + pct + night;
  if (key === lastDay) return;
  lastDay = key;
  dayEls.clock.textContent = clock;
  dayEls.what.textContent = act ? `${act[2]} · ${act[3]}` : (h < 7.5 ? 'Pobudka · słuchawki w etui' : h >= 22.5 ? 'Dobranoc · do jutra wystarczy' : 'Przerwa · słuchawki w etui');
  dayEls.pct.textContent = pct + '%';
  dayEls.note.textContent = h >= 22.5 ? 'baterii po całym dniu słuchania' : 'baterii';
  dayEls.sec.classList.toggle('night', night);
}

// ---------- Pętla ----------
let lastBg = '', dayActive = false, lastHead = '';
const lpState = { a: 0, v: 0 };
const headKids = $$('.anat-head > *');
function frame(time) {
  const t = time;
  if (POSES) {
    const S = scrollState(window.scrollY);
    const ent = setEntrance(S.ent);
    Object.assign(rig, S.pose); rig.wave = S.wave; rig.vis = S.vis;
    rig.ry += ent.turn; rig.ent = ent.a;
    setLight(S.light, S.photo);
    // tytuł Anatomii pojawia się, gdy gaśnie zdjęcie, i stoi w miejscu, a sekcja dojeżdża pod niego
    // (przesuwane są dzieci nagłówka, bo cały nagłówek gasi oś czasu na końcu sekcji)
    const y = window.scrollY, hIn = smooth(seg(y, B.hE * 0.55, B.hE * 0.85));
    const head = hIn.toFixed(3) + Math.round(Math.max(0, B.dS - y));
    if (head !== lastHead) {
      headKids.forEach((el) => { el.style.opacity = hIn; el.style.transform = `translateY(${(-Math.max(0, B.dS - y) + (1 - hIn) * 24).toFixed(1)}px)`; });
      lastHead = head;
    }
    if (S.day != null) setDay(S.day);
    dayActive = S.day != null;
    const bg = dayActive ? dayLight.bg : S.bg;
    if (bg !== lastBg) { backdrop.style.backgroundColor = '#' + bg; lastBg = bg; }
    lpState.a = S.lp; lpState.v = S.lpV;
  }
  const bob = reduce ? 0 : Math.sin(t * 0.9) * 0.05 * rig.bob;
  pivot.position.set(rig.px, rig.py + bob, rig.pz);
  pivot.rotation.set(rig.rx + drag.x, rig.ry + drag.y, rig.rz, 'YXZ');
  pivot.scale.setScalar(rig.s);
  camera.position.set(0, rig.camY, L.dist);
  camera.lookAt(0, rig.camTY, 0);
  const L0 = dayActive && dayLight ? dayLight : light;
  sun.color.copy(L0.c); sun.intensity = L0.i;
  scene.environmentIntensity = L0.env;
  if (dust) {
    dust.visible = rig.wave > 0.0005;
    dust.material.uniforms.uW.value = rig.wave;
    dust.material.uniforms.uTime.value = t;
    const cut = rig.wave > 0.0005 ? cutAt(rig.wave * RUN) : -1e3;
    clipLocal.set(new THREE.Vector3(1, 0, 0), -cut);
    feather.visible = dust.visible;
    fRev.value = rig.wave * RUN;
    // gotowe piórko unosi się i lekko kołysze; zaczyna dopiero, gdy drobinki już zgasły, żeby się z nimi nie rozjechało
    const k = reduce ? 0 : smooth((rig.wave - 0.95) / 0.05);
    fMesh.rotation.set(Math.sin(t * 0.6) * 0.05 * k, Math.sin(t * 0.45) * 0.08 * k, Math.sin(t * 0.7 + 1) * 0.04 * k);
    fMesh.position.y = Math.sin(t * 0.8) * 0.09 * k;
    fShadow.material.opacity = smooth((rig.wave - 0.6) / 0.4) * (1 - fMesh.position.y * 1.5);
    fShadow.scale.x = 1 - fMesh.position.y * 0.8;
    fShadow.position.y = -2.1 - bob / rig.s; // cień stoi w miejscu, gdy słuchawki i piórko lekko się bujają
    pivot.updateMatrixWorld(true);
    clipWorld.copy(clipLocal).applyMatrix4(pivot.matrixWorld);
  }
  canvas.style.opacity = rig.alpha * rig.vis * appear.v * rig.ent;
  renderer.render(scene, camera);
  drawLoupes(lpState.a * rig.ent, lpState.v);
}

// ---------- Przewijanie: przypięcia sekcji i teksty ----------
function timelines() {
  // 1. Start: delikatnie gaśnie tekst; zdjęcie i smuga światła są w scrollState
  gsap.timeline({ scrollTrigger: { id: 'hero', trigger: '#start', start: 'top top', end: '+=160%', pin: true, scrub: SCRUB } })
    .to('.hero-copy', { y: -24, autoAlpha: 0, duration: 0.28, ease: 'power1.out' }, 0)
    .to({}, { duration: 1 }, 0);

  // 2. Anatomia: przypięta; najpierw wejście słuchawek, potem 5 kroków lupy (koła, linie i podpisy liczy pętla,
  // podobnie jak pojawianie się nagłówka przy wjeździe sekcji, żeby działało też po skoku w środek strony)
  const tA = gsap.timeline({ scrollTrigger: { id: 'design', trigger: '#design', start: 'top top', end: '+=495%', pin: true, scrub: SCRUB } });
  // nagłówek gaśnie przed odjazdem sekcji, żeby nie przesuwał się nad stojącym modelem (stożek gaśnie w scrollState)
  tA.to('.anat-head', { autoAlpha: 0, y: -30, duration: 0.15 }, AN_U - 0.15)
    .to({}, { duration: 0.1 }, AN_U - 0.1);

  // 3. Lekkość: tekst przed przemianą i „268 g” po niej
  gsap.timeline({ scrollTrigger: { id: 'lek', trigger: '#lekkosc', start: 'top top', end: '+=260%', pin: true, scrub: SCRUB } })
    .fromTo('.lek-intro', { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.15, immediateRender: false }, 0)
    .to('.lek-intro', { autoAlpha: 0, y: -20, duration: 0.15 }, 0.75)
    .fromTo('.lek-out', { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.25, immediateRender: false }, 1.05)
    .to('.lek-out', { autoAlpha: 0, y: -30, duration: 0.2 }, 1.9)
    .to({}, { duration: 0.1 }, 2.8);

  // 4. Kolory: bez przypięcia; tu można obracać model
  ScrollTrigger.create({ id: 'kol', trigger: '#kolory', start: 'top top', end: 'bottom top' });
  ScrollTrigger.create({ trigger: '#kolory', start: 'top 60%', end: 'bottom 40%', onLeave: resetDrag, onLeaveBack: resetDrag });

  // 5. Cały dzień: godzina biegnie od 7:00 do 23:00 (scrollState), na końcu karty z faktami
  gsap.timeline({ scrollTrigger: { id: 'day', trigger: '#dzien', start: 'top top', end: '+=220%', pin: true, scrub: SCRUB } })
    .to('.fact', { opacity: 1, y: 0, stagger: 0.04, duration: 0.1 }, 0.82)
    .to({}, { duration: 0.1 }, 0.9);

  // menu: podświetlenie bieżącej sekcji
  const links = $$('.menu a');
  links.forEach((a) => ScrollTrigger.create({ trigger: a.getAttribute('href'), start: 'top 55%', end: 'bottom 55%', onToggle: (s) => a.classList.toggle('on', s.isActive) }));
  ScrollTrigger.addEventListener('refresh', measure);
}

// ---------- Konfigurator ----------
const swBtns = $$('.sw'), optBtns = $$('.opt');
let extra = 0;
function tweenPalette(i) {
  const p = PALETTES[i], d = reduce ? 0 : 0.9;
  const to = (mat, hex) => { const c = new THREE.Color(hex); gsap.to(mat.color, { r: c.r, g: c.g, b: c.b, duration: d, ease: 'power2.out' }); };
  to(M.ceramic, p.ceramic); to(M.metal, p.metal); to(M.lip, p.metal); to(M.polish, p.metal); to(M.pivot, p.metal); to(M.cushion, p.cushion); to(M.band, p.band); to(M.inner, p.inner);
  const s = new THREE.Color(KOL[i].sun[0]);
  gsap.to(light.c, { r: s.r, g: s.g, b: s.b, duration: d });
  gsap.to(light, { i: KOL[i].sun[1], duration: d });
}
function updateSum() {
  const NBSP = String.fromCharCode(160), fmt = (n) => (n >= 1000 ? Math.floor(n / 1000) + NBSP + String(n % 1000).padStart(3, "0") : String(n)); // 1 899 zł jak w reszcie strony
  const total = 1899 + extra;
  $('#k-total').textContent = 'Razem ' + fmt(total) + ' zł';
  $('#k-buy').textContent = 'Kup Lumen Halo · ' + PALETTES[color].name;
}
function setColor(i) {
  if (i === color) return;
  color = i;
  swBtns.forEach((b, k) => b.setAttribute('aria-checked', String(k === i)));
  const [a, b] = KOL[i].title;
  $('#k-title').innerHTML = `<span>${a}</span>${b}`;
  $('#k-lead').textContent = KOL[i].lead;
  tweenPalette(i);
  const c = new THREE.Color(KOL[i].bg);
  gsap.to(kolBg, { r: c.r, g: c.g, b: c.b, duration: reduce ? 0 : 0.9 });
  updateSum();
}
swBtns.forEach((b) => b.addEventListener('click', () => setColor(+b.dataset.i)));
optBtns.forEach((b) => b.addEventListener('click', () => { optBtns.forEach((o) => o.setAttribute('aria-checked', String(o === b))); extra = +b.dataset.price; updateSum(); }));
updateSum();

// obracanie modelu w sekcji Kolory
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

// ---------- Płynne przewijanie i odnośniki ----------
let lenis = null;
if (!reduce) {
  lenis = new Lenis({ lerp: 0.09 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
$$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
  const target = $(a.getAttribute('href'));
  if (!target) return;
  e.preventDefault();
  if (lenis) lenis.scrollTo(target, { duration: 1.6 });
  else target.scrollIntoView();
}));

// ---------- Start ----------
layout();
timelines();
addEventListener('resize', () => { layout(); });
gsap.ticker.add((time) => frame(time));
gsap.to(appear, { v: 1, duration: reduce ? 0 : 1.2, ease: 'power2.out', delay: 0.1 });
// piórko i drobinki do sekcji Lekkość liczą się chwilę po starcie, w wolnych chwilach, żeby nie opóźniać wejścia na stronę
setTimeout(() => idle().then(buildDust), 1500);

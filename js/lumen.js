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
const { halo, M, anchors, guides } = buildHalo(renderer);
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
const FEAT_H = 190; // wysokość opisu cechy na dole ekranu (telefon)
const P = {
  // budowa ze światła: model na środku stożka, lekko z przodu, żeby było widać oba pierścienie
  b: () => {
    if (!L.mobile) return pose({ py: -0.62, rx: 0.1, ry: -0.55, s: 0.78 });
    const f = fitIn(rel('.anat-head', '#design').bottom + 8, innerHeight - 40, 0.8);
    return pose({ py: f.py, rx: 0.1, ry: -0.55, s: f.s });
  },
  // Anatomia: model przesunięty od strony opisu; obrót pokazuje opisywaną część
  ...Object.fromEntries([
    [-0.13, -0.62, 0.12, -1.0, 0.78], [0.13, -0.62, 0.05, -1.42, 0.8], [0.13, -0.8, 0.55, -0.3, 0.8], [-0.15, -1.05, 0.2, -0.62, 0.98], [0.13, -0.62, 0.1, -0.6, 0.8],
  ].map(([x, y, rx, ry, s], i) => ['a' + i, () => {
    if (!L.mobile) return pose({ px: x * halfW(), py: y, rx, ry, s });
    const f = fitIn(rel('.anat-head', '#design').bottom + 8, innerHeight - 72 - FEAT_H, 0.8);
    return pose({ py: f.py, rx, ry, s: f.s * (i === 3 ? 1.1 : 1) });
  }])),
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
const rig = { ...P.b(), wave: 0, vis: 1 }; // vis: zanikanie przy przenosinach modelu między sekcjami
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
// ---------- Start i Anatomia: słuchawki powstają ze światła ----------
// Start to zdjęcie (warstwa .photo). Przy przewijaniu światło z okna odrywa się od zdjęcia (warstwa .light: dwie plamy
// w miejscach plam na zdjęciu), przesuwa się i zwęża w stożek, a zdjęcie gaśnie w szarość. W Anatomii ze szczytu stożka
// spadają dwie wiązki i zawijają się w pierścienie (Halo), trzecia rysuje pałąk, a potem materiały „skraplają się”
// ze światła: aluminium, ceramika, poduszki, dzianina. Wiązki to rurki odsłaniane wzdłuż długości, bryła to próg szumu w shaderze.
const ANAT_BG = '#e9e8e5', DIM_BG = '#cfcdc9';
const WALL = [[335, 0], [790, 0], [1440, 325], [1440, 640], [560, 548]];   // plama na ścianie, w pikselach zdjęcia 1440 × 900
const FLOOR = [[0, 600], [560, 548], [1000, 665], [860, 900], [0, 800]];   // plama na podłodze
const photoEl = $('.photo'), lightEl = $('.light'), lightP = $$('.light i');
// współrzędne zdjęcia → ekran, jak przy background-size: cover (na telefonie zdjęcie jest przesunięte, żeby było widać słuchawki)
const photoPt = ([x, y]) => {
  const k = Math.max(innerWidth / 1440, innerHeight / 900);
  return [(innerWidth - 1440 * k) * (L.mobile ? 0.74 : 0.5) + x * k, (innerHeight - 900 * k) * 0.5 + y * k];
};
const conePts = () => {
  const w = Math.min(innerWidth * (L.mobile ? 0.9 : 0.64), 860), l = innerWidth / 2 - w / 2, top = -0.08 * innerHeight, h = 0.92 * innerHeight;
  return [[l + 0.36 * w, top], [l + 0.64 * w, top], [l + 0.75 * w, top + 0.5 * h], [l + 0.86 * w, top + h], [l + 0.14 * w, top + h]];
};
let lastLight = '';
function setLight(m, a, photo) {
  const c = conePts(), poly = (src) => 'polygon(' + src.map((p, i) => { const q = photoPt(p); return lerp(q[0], c[i][0], m).toFixed(1) + 'px ' + lerp(q[1], c[i][1], m).toFixed(1) + 'px'; }).join(',') + ')';
  const key = [m, a, photo].map((v) => v.toFixed(3)).join();
  if (key === lastLight) return;
  lastLight = key;
  lightEl.style.visibility = a > 0.002 ? 'visible' : 'hidden';
  if (a > 0.002) {
    lightP[0].style.clipPath = poly(WALL);
    lightP[1].style.clipPath = poly(FLOOR);
    lightP[1].style.opacity = 1 - smooth(m / 0.7);
    lightEl.style.opacity = a;
    lightEl.style.filter = `blur(${lerp(10, 44, m * m).toFixed(1)}px)`; // plamy z okna są ostre, stożek miękki
    lightEl.style.setProperty('--mb', lerp(1, 0.12, m).toFixed(3)); // stożek u dołu rozpływa się w tle
  }
  photoEl.style.visibility = photo > 0.002 ? 'visible' : 'hidden';
  photoEl.style.opacity = photo;
  // światło „odrywa się” od zdjęcia: zdjęcie lekko ciemnieje, a jasne plamy niesie już warstwa światła
  photoEl.style.filter = `brightness(${lerp(1, 0.7, smooth(a / 0.75)).toFixed(3)})`;
}

// Bryła wyłania się z szumu: piksele powyżej progu są odrzucane, a przy samym progu świecą
const FILL = { metal: { value: 1 }, ceramic: { value: 1 }, cushion: { value: 1 }, band: { value: 1 } };
const FILL_OF = { ceramic: 'ceramic', metal: 'metal', lip: 'metal', polish: 'metal', pivot: 'metal', cushion: 'cushion', inner: 'cushion', band: 'band' };
const FILL_GLSL = `
uniform float uFill; varying vec3 vFillP;
float fillHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float fillNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fillHash(i), fillHash(i + vec3(1, 0, 0)), f.x), mix(fillHash(i + vec3(0, 1, 0)), fillHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(fillHash(i + vec3(0, 0, 1)), fillHash(i + vec3(1, 0, 1)), f.x), mix(fillHash(i + vec3(0, 1, 1)), fillHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;
Object.entries(M).forEach(([k, m]) => {
  const u = FILL[FILL_OF[k] || 'metal'];
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFill = u;
    sh.vertexShader = 'varying vec3 vFillP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFillP = transformed;');
    sh.fragmentShader = FILL_GLSL + sh.fragmentShader
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  float fN = 0.65 * fillNoise(vFillP * 6.0) + 0.35 * fillNoise(vFillP * 23.0), fT = uFill * 1.3 - 0.15;
  if (fN > fT) discard;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += vec3(1.0, 0.97, 0.9) * 2.2 * (1.0 - smoothstep(0.0, 0.07, fT - fN)) * step(uFill, 0.999);`);
  };
  m.customProgramCacheKey = () => 'fill-' + k;
});

// Wiązki: cienki rdzeń i poświata (addytywna, gaśnie ku brzegom rurki); na czele każdej wiązki jasny błysk.
// Wiązki spadające ze stożka wyłaniają się z jego jasności: uIn to część długości, na której rośnie krycie.
const beams = new THREE.Group();
beams.visible = false;
pivot.add(beams);
const beamA = { value: 1 };
const beamMat = (glow, fadeIn) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, toneMapped: false, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
  uniforms: { uA: beamA, uIn: { value: fadeIn }, uGlow: { value: glow ? 1 : 0 } },
  vertexShader: `varying float vF, vU;
    void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vF = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz))); vU = uv.x; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform float uA, uIn, uGlow; varying float vF, vU;
    void main() {
      float a = uA * (uIn > 0.0 ? smoothstep(0.0, uIn, vU) : 1.0) * mix(1.0, pow(vF, 2.0) * 0.5, uGlow);
      gl_FragColor = vec4(vec3(1.0, 0.98, 0.93), a);
    }`,
});
const sparkTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,250,235,0.6)'); r.addColorStop(1, 'rgba(255,250,235,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const BEAM_SEG = 6 * 8; // indeksy na jeden odcinek rurki (8 ścian)
let beamList = [];
function tube(curve, segs, r, mat) {
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, r, 8, false), mat);
  m.frustumCulled = false; m.renderOrder = 3;
  return m;
}
// Ścieżki w układzie obracanej grupy (pivot), liczone dla ujęcia budowy; przeliczane przy zmianie rozmiaru ekranu
function buildBeams() {
  beamList.forEach((b) => [b.core, b.glow].forEach((m) => { m.geometry.dispose(); m.material.dispose(); }));
  beams.clear(); beamList = [];
  const b = POSES.b, G = guides;
  pivot.updateMatrixWorld(true);
  const toPivot = new THREE.Matrix4().copy(pivot.matrixWorld).invert();
  const at = (obj, x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(obj.matrixWorld).applyMatrix4(toPivot);
  const poseInv = new THREE.Matrix4().compose(new THREE.Vector3(b.px, b.py, b.pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(b.rx, b.ry, b.rz, 'YXZ')), new THREE.Vector3(b.s, b.s, b.s)).invert();
  const top = (s) => at(G.cups[s], 0, G.ringR, G.ringH);
  const add = (pts, segs, fadeIn = 0) => {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const core = tube(curve, segs, 0.008, beamMat(false, fadeIn)), glow = tube(curve, segs, 0.045, beamMat(true, fadeIn));
    const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    spark.scale.setScalar(0.38);
    beams.add(core, glow, spark);
    beamList.push({ curve, segs, core, glow, spark });
  };
  [1, -1].forEach((s) => {
    // ze szczytu stożka (u góry ekranu, nad środkiem) prosto w dół do szczytu pierścienia, potem dookoła pierścienia
    const apex = new THREE.Vector3(b.px + s * 0.1, halfH() * 1.08 + 0.3, 0).applyMatrix4(poseInv), t = top(s), pts = [];
    for (let k = 0; k <= 10; k++) pts.push(apex.clone().lerp(t, k / 10));
    for (let k = 1; k <= 96; k++) { const a = Math.PI / 2 + s * k / 96 * Math.PI * 2.04; pts.push(at(G.cups[s], G.ringR * Math.cos(a), G.ringR * Math.sin(a), G.ringH)); }
    add(pts, 300, 0.22);
  });
  // pałąk: z prawego pierścienia w górę tulei, łukiem pałąka i w dół tulei do lewego pierścienia
  const pts = [top(1)];
  for (let k = 0; k <= 4; k++) pts.push(at(G.tilts[1], G.stemX, lerp(G.stemY0, G.sleeveTop, k / 4), 0));
  for (let k = 1; k < 60; k++) pts.push(G.arc.getPointAt(k / 60).applyMatrix4(halo.matrixWorld).applyMatrix4(toPivot));
  for (let k = 4; k >= 0; k--) pts.push(at(G.tilts[-1], -G.stemX, lerp(G.stemY0, G.sleeveTop, k / 4), 0));
  pts.push(top(-1));
  add(pts, 260);
}
let shadowsOn = true;
function setBuild(bt) {
  const f = (a, c) => smooth(seg(bt, a, c));
  FILL.metal.value = f(0.45, 0.66); FILL.ceramic.value = f(0.55, 0.76); FILL.cushion.value = f(0.63, 0.84); FILL.band.value = f(0.7, 0.92);
  // cienie tylko z gotowej bryły (mapa cieni nie zna progu szumu)
  const done = bt >= 0.999;
  if (done !== shadowsOn) { halo.traverse((o) => { if (o.isMesh) o.castShadow = done; }); shadowsOn = done; }
  const fade = 1 - seg(bt, 0.82, 1), prog = [io(seg(bt, 0.02, 0.4)), io(seg(bt, 0.02, 0.4)), io(seg(bt, 0.36, 0.62))];
  beams.visible = bt > 0.02 && fade > 0;
  if (!beams.visible) return;
  beamA.value = fade;
  beamList.forEach((b, i) => {
    const n = Math.round(prog[i] * b.segs) * BEAM_SEG;
    b.core.geometry.setDrawRange(0, n); b.glow.geometry.setDrawRange(0, n);
    b.spark.visible = prog[i] > 0.001 && prog[i] < 0.999;
    if (b.spark.visible) b.curve.getPointAt(prog[i], b.spark.position);
  });
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
  // puch u nasady: długie, miękkie, kręte promienie z drobnymi odgałęzieniami
  g.filter = 'blur(0.6px)';
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

function buildDust() {
  const ft = buildFeather();
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

// ---------- Anatomia: linia od opisu do części modelu ----------
const feats = $$('.feat'), leader = $('#leader'), dot = $('#leader-dot'), dots = $$('.dots i');
const tmp = new THREE.Vector3();
let anatActive = false;
function drawLeader() {
  let best = null, op = 0;
  for (const el of feats) { const o = +gsap.getProperty(el, 'opacity'); if (o > op) { op = o; best = el; } }
  if (!anatActive || !best || op < 0.02 || L.mobile) { leader.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); return; }
  anchors[best.dataset.anchor].getWorldPosition(tmp).project(camera);
  const ax = (tmp.x * 0.5 + 0.5) * innerWidth, ay = (-tmp.y * 0.5 + 0.5) * innerHeight;
  const r = best.querySelector('h3').getBoundingClientRect(), right = best.classList.contains('r');
  const sx = right ? r.left - 20 : r.right + 20, sy = r.top + r.height / 2, ex = sx + (right ? -48 : 48);
  leader.setAttribute('d', `M${sx},${sy} H${ex} L${ax},${ay}`);
  dot.setAttribute('cx', ax); dot.setAttribute('cy', ay);
  leader.setAttribute('opacity', op * 0.55); dot.setAttribute('opacity', op);
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
  Object.assign(B, { dS: g('design').start, dE: g('design').end, lS: g('lek').start, lE: g('lek').end, kS: g('kol').start, yS: g('day').start, yE: g('day').end });
  B.eE = B.yE + innerHeight * 0.65;
  POSES = Object.fromEntries(Object.keys(P).map((k) => [k, P[k]()]));
  buildBeams();
}
const AN_0 = 1.8, AN_U = AN_0 + 5; // Anatomia: budowa ze światła, potem 5 cech po 1 jednostce
const io = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2); // power2.inOut
const seg = (y, a, b) => clamp((y - a) / (b - a), 0, 1);
const mixPose = (a, b, t) => Object.fromEntries(KEYS.map((k) => [k, lerp(a[k], b[k], t)]));
const cA = new THREE.Color(), cB = new THREE.Color();
const mixCol = (a, b, t) => cA.set(a).lerp(cB.set(b), t).getHexString();
const dipAt = (t) => (t < 0.5 ? 1 - smooth((t - 0.05) / 0.35) : smooth((t - 0.6) / 0.35)); // zanika w połowie przenosin

function scrollState(y) {
  const S = { wave: 0, vis: 1, bg: null, day: null, anat: -1, build: 1, light: 0, cone: 1, photo: 0 };
  if (y < B.dS) {
    // Start: światło z okna odrywa się od zdjęcia i zwęża w stożek, zdjęcie gaśnie w szarość; modelu jeszcze nie ma
    S.pose = POSES.b; S.build = 0;
    S.cone = io(seg(y, B.dS * 0.22, B.dS));
    S.light = lerp(0.75 * smooth(seg(y, 0, B.dS * 0.25)), 0.6, S.cone);
    S.photo = 1 - smooth(seg(y, B.dS * 0.45, B.dS * 0.95));
    S.bg = mixCol('#efebe5', DIM_BG, seg(y, B.dS * 0.45, B.dS * 0.95));
  }
  else if (y <= B.dE) {
    // Anatomia: budowa ze światła (0–1,4), obrót do pierwszego ujęcia (do 1,9), potem 5 cech od 1,8;
    // przejście do kroku i trwa od i − 0,3 do i + 0,2 (licząc od 1,8)
    const u = seg(y, B.dS, B.dE) * AN_U, lit = smooth(seg(u, 0.7, 1.33));
    S.build = seg(u, 0, 1.4);
    S.light = lerp(0.6, 0.95, lit) * (1 - seg(u, AN_U - 0.25, AN_U));
    S.bg = mixCol(DIM_BG, ANAT_BG, lit);
    if (u < 1.9) S.pose = mixPose(POSES.b, POSES.a0, io(seg(u, 0.75, 1.9)));
    else {
      const v = u - AN_0;
      let i = 0; while (i < 4 && v >= i + 0.7) i++;
      S.pose = i ? mixPose(POSES['a' + (i - 1)], POSES['a' + i], io(clamp((v - (i - 0.3)) / 0.5, 0, 1))) : POSES.a0;
    }
    S.anat = u >= AN_0 ? Math.min(4, Math.floor(u - AN_0)) : -1;
  }
  else if (y < B.lS) { const t = seg(y, B.dE, B.lS); S.pose = mixPose(POSES.a4, POSES.lek, t); S.bg = mixCol(ANAT_BG, '#e6e6ea', t); }
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
let lastBg = '', lastDot = -2, dayActive = false;
function frame(time) {
  const t = time;
  if (POSES) {
    const S = scrollState(window.scrollY);
    Object.assign(rig, S.pose); rig.wave = S.wave; rig.vis = S.vis;
    setBuild(S.build);
    setLight(S.cone, S.light, S.photo);
    if (S.day != null) setDay(S.day);
    dayActive = S.day != null;
    const bg = dayActive ? dayLight.bg : S.bg;
    if (bg !== lastBg) { backdrop.style.backgroundColor = '#' + bg; lastBg = bg; }
    anatActive = S.anat >= 0;
    if (S.anat !== lastDot) { dots.forEach((d, k) => d.classList.toggle('on', k === S.anat)); lastDot = S.anat; }
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
  canvas.style.opacity = rig.alpha * rig.vis * appear.v;
  renderer.render(scene, camera);
  drawLeader();
}

// ---------- Przewijanie: przypięcia sekcji i teksty ----------
function timelines() {
  // 1. Start: tekst odjeżdża, a światło zaczyna się przesuwać (scrollState)
  gsap.timeline({ scrollTrigger: { id: 'hero', trigger: '#start', start: 'top top', end: '+=70%', pin: true, scrub: SCRUB } })
    .to('.hero-copy', { y: -80, autoAlpha: 0, duration: 0.45, ease: 'power1.in' }, 0)
    .to('.scroll-cue', { autoAlpha: 0, duration: 0.1 }, 0)
    .to({}, { duration: 1 }, 0);

  // 2. Anatomia: przypięta; najpierw budowa ze światła, potem 5 kroków, w każdym jedna cecha
  const tA = gsap.timeline({ scrollTrigger: { id: 'design', trigger: '#design', start: 'top top', end: '+=580%', pin: true, scrub: SCRUB } });
  feats.forEach((el, i) => {
    tA.fromTo(el, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.2, immediateRender: false }, AN_0 + (i ? i + 0.12 : 0.05))
      .to(el, { autoAlpha: 0, y: -24, duration: 0.18 }, AN_0 + i + 0.72);
  });
  // nagłówek i kropki gasną przed odjazdem sekcji, żeby nie przesuwały się nad stojącym modelem (stożek gaśnie w scrollState)
  tA.to(['.anat-head', '.dots'], { autoAlpha: 0, y: -30, duration: 0.15 }, AN_U - 0.15)
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
  ScrollTrigger.create({ start: 8, end: 'max', onToggle: (s) => $('#nav').classList.toggle('solid', s.isActive) });
  ScrollTrigger.addEventListener('refresh', measure);
}

// ---------- Konfigurator ----------
const swBtns = $$('.sw'), optBtns = $$('.opt');
let extra = 0;
function tweenPalette(i) {
  const p = PALETTES[i], d = reduce ? 0 : 0.9;
  const to = (mat, hex) => { const c = new THREE.Color(hex); gsap.to(mat.color, { r: c.r, g: c.g, b: c.b, duration: d, ease: 'power2.out' }); };
  to(M.ceramic, p.ceramic); to(M.metal, p.metal); to(M.lip, p.metal); to(M.polish, p.metal); to(M.cushion, p.cushion); to(M.band, p.band); to(M.inner, p.inner);
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
// drobinki do sekcji Lekkość liczą się po pierwszej klatce, żeby nie opóźniać startu strony
(window.requestIdleCallback || ((f) => setTimeout(f, 300)))(() => { buildDust(); });

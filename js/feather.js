// Piórko z finału strony: tekstura rysowana na płótnie 2D (stosina, chorągiewki, puch u nasady) na wygiętej powierzchni.
// Wspólne dla strony (lumen-3d.js) i porównania wariantów przemiany (piorko-warianty.html).
import * as THREE from 'three';

const { lerp, clamp } = THREE.MathUtils;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const pause = () => new Promise((r) => (window.scheduler?.yield ? scheduler.yield().then(r) : setTimeout(r, 0)));

// rysowanie trwa kilkaset milisekund, więc idzie kawałkami z przerwami (pause), żeby nie zacinać przewijania
export async function featherTexture(renderer) {
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
    if (i % 250 === 249) await pause();
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
  await pause();
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
    await pause();
    let clump = 0, jit = 0, cut = 1, n = 0;
    for (let u = 0.42; u < 0.995; u += 1 / 1100) {
      if (++n % 300 === 0) await pause();
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
  await pause();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const data = g.getImageData(0, 0, W, H).data;
  return { t, data, W, H };
}

// Kształt piórka w jego układzie (oś x w prawo, y w górę, z do kamery). u: wzdłuż (0 nasada po lewej, 1 szczyt po prawej),
// v: w poprzek (0,5 = stosina). Stosina idzie łukiem, oba końce w górę, a szczyt mocniej; chorągiewka jest pochylona do kamery
// jak u piórka oglądanego lekko z góry i obraca się ku szczytowi, który zwija się przodem do widza.
export const FL = 5; // długość piórka w jednostkach sceny
const FWD = FL * 768 / 2048;
const shaftAt = (u) => new THREE.Vector3((u - 0.5) * FL, 0.42 * (2 * u - 1) ** 2 + 0.45 * Math.max(0, u - 0.7) ** 2 / 0.09 - 0.25, -0.35 * (2 * u - 1) ** 2);
export function featherPoint(u, v, out = new THREE.Vector3()) {
  const Cp = shaftAt(u), T = shaftAt(Math.min(1, u + 0.002)).sub(shaftAt(Math.max(0, u - 0.002))).normalize();
  const th = lerp(0.62, 0.12, smooth((u - 0.4) / 0.6));
  const D = new THREE.Vector3(-T.y, T.x, 0).normalize().multiplyScalar(Math.cos(th)).add(new THREE.Vector3(0, 0, Math.sin(th)));
  D.addScaledVector(T, -D.dot(T)).normalize();
  const N = new THREE.Vector3().crossVectors(T, D), w = (v - 0.5) * FWD;
  return out.copy(Cp).addScaledVector(D, w).addScaledVector(N, -0.32 * w * w * (1 - 0.7 * smooth((u - 0.75) / 0.25))); // przy szczycie chorągiewka się prostuje
}

// Siatka i materiał piórka. fRev: { value } — postęp odsłaniania od nasady do szczytu (0 nic, ≥ 1,6 całe).
export function featherMesh(ft, fRev) {
  const geo = new THREE.PlaneGeometry(1, 1, 200, 60), p = geo.attributes.position, uv = geo.attributes.uv, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { featherPoint(uv.getX(i), uv.getY(i), v); p.setXYZ(i, v.x, v.y, v.z); }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: ft.t, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 1, emissive: '#ffffff', emissiveMap: ft.t, emissiveIntensity: 0.12 });
  // piórko wyłania się od nasady do szczytu, w tym samym tempie, w jakim gasną drobinki
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRev = fRev;
    sh.fragmentShader = 'uniform float uRev;\n' + sh.fragmentShader.replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n  diffuseColor.a *= smoothstep(0.3, 0.55, uRev - vMapUv.x);');
  };
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 2;
  return m;
}
